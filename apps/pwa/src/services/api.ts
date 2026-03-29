import createClient from 'openapi-fetch';
import type { paths } from '@properfy/shared';
import { env } from '@/config/env';
import { authStorage } from '@/lib/auth-storage';
import { buildCurrentRedirectTarget, savePostLoginRedirect } from '@/lib/post-login-redirect';

export const api = createClient<paths>({
  baseUrl: env.apiBaseUrl,
});

let refreshPromise: Promise<boolean> | null = null;

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
  async onRequest({ request }) {
    const token = authStorage.getAccessToken();
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`);
    }
    request.headers.set('x-request-id', crypto.randomUUID());
    return request;
  },

  async onResponse({ response, request }) {
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
    const retryRequest = new Request(request, {
      headers: new Headers(request.headers),
    });
    if (newToken) {
      retryRequest.headers.set('Authorization', `Bearer ${newToken}`);
    }

    return fetch(retryRequest);
  },
});
