import createClient from 'openapi-fetch';
import type { paths } from '@properfy/shared';
import { env } from '@/config/env';
import { authStorage } from '@/lib/auth-storage';

export const api = createClient<paths>({
  baseUrl: env.apiBaseUrl,
});

let isRefreshing = false;
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
    if (response.status !== 401) return response;

    // Never intercept 401 on auth endpoints — let the caller handle it directly
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith('/v1/auth/')) return response;

    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = refreshAccessToken().finally(() => {
        isRefreshing = false;
        refreshPromise = null;
      });
    }

    const refreshed = await refreshPromise;
    if (!refreshed) {
      authStorage.clearTokens();
      window.location.href = '/login';
      return response;
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
