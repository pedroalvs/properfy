import createClient from 'openapi-fetch';
import type { paths } from '@properfy/shared';
import { env } from '@/config/env';
import { authStorage } from '@/lib/auth-storage';
import { buildCurrentRedirectTarget, savePostLoginRedirect } from '@/lib/post-login-redirect';

export const api = createClient<paths>({
  baseUrl: env.apiBaseUrl,
});

let refreshPromise: Promise<boolean> | null = null;

// A 401 retry has to rebuild the request, but by the time `onResponse` runs the
// original request's body stream has already been consumed by the initial fetch —
// rebuilding from it throws `TypeError: ...Request object that has already been used`
// on every body-bearing call (START/FINISH/accept-offer). Stash an untouched clone
// per request (keyed by openapi-fetch's stable middleware `id`) so the retry can be
// rebuilt from a request whose body is still readable.
const pendingRequestClones = new Map<string, Request>();

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = authStorage.getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${env.apiBaseUrl}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) return false;

    const data = await response.json();
    authStorage.setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

function redirectToLogin(): void {
  savePostLoginRedirect(buildCurrentRedirectTarget());
  authStorage.clearTokens();
  window.location.replace('/login');
}

api.use({
  async onRequest({ request, id }) {
    const token = authStorage.getAccessToken();
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`);
    }
    request.headers.set('x-request-id', crypto.randomUUID());
    // Clone now, while the body is still intact, in case a 401 forces a retry.
    pendingRequestClones.set(id, request.clone());
    return request;
  },

  async onError({ id }) {
    pendingRequestClones.delete(id);
  },

  async onResponse({ response, request, id }) {
    const requestClone = pendingRequestClones.get(id);
    pendingRequestClones.delete(id);

    if (response.status === 403) {
      try {
        const body = await response.clone().json();
        if (body?.error?.code === 'INSPECTOR_INACTIVE') {
          window.location.replace('/deactivated');
          return new Response(null, { status: 403 });
        }
      } catch {
        // Not JSON or no error code — fall through
      }
      return response;
    }

    if (response.status !== 401) return response;

    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith('/v1/auth/')) return response;

    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        setTimeout(() => { refreshPromise = null; }, 0);
      });
    }

    const refreshed = await refreshPromise;
    if (!refreshed) {
      redirectToLogin();
      return new Response(null, { status: 401 });
    }

    const newToken = authStorage.getAccessToken();
    // Rebuild from the untouched clone so a body-bearing retry keeps its payload;
    // fall back to the original request for bodyless calls (GET/DELETE).
    const retrySource = requestClone ?? request;
    const retryRequest = new Request(retrySource, {
      headers: new Headers(retrySource.headers),
    });
    if (newToken) {
      retryRequest.headers.set('Authorization', `Bearer ${newToken}`);
    }

    return fetch(retryRequest);
  },
});
