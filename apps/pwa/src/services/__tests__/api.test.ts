import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Controllable token store so the middleware can "refresh" mid-test.
let accessToken: string | null = 'stale-token';
const setTokens = vi.fn((at: string) => {
  accessToken = at;
});
const clearTokens = vi.fn(() => {
  accessToken = null;
});

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: () => accessToken,
    getRefreshToken: () => 'refresh-token',
    setTokens: (at: string, rt: string) => setTokens(at, rt),
    clearTokens: () => clearTokens(),
    hasTokens: () => accessToken !== null,
  },
}));

vi.mock('@/lib/post-login-redirect', () => ({
  buildCurrentRedirectTarget: () => '/schedule',
  savePostLoginRedirect: vi.fn(),
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// A single stable stub delegating to a per-test handler. openapi-fetch binds
// `globalThis.fetch` at createClient() time, so the stub must be installed before
// the api module is (dynamically) imported.
let fetchHandler: (request: Request, url: string) => Promise<Response>;
const fetchMock = vi.fn((input: RequestInfo | URL): Promise<Response> => {
  const request = input as Request;
  const url = typeof input === 'object' && 'url' in request ? request.url : String(input);
  return fetchHandler(request, url);
});

async function importApi() {
  vi.resetModules();
  vi.stubGlobal('fetch', fetchMock);
  return (await import('../api')).api;
}

describe('api 401-retry middleware (PWA-8)', () => {
  beforeEach(() => {
    accessToken = 'stale-token';
    setTokens.mockClear();
    clearTokens.mockClear();
    fetchMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resends a body-bearing POST after a 401 refresh without throwing', async () => {
    const retriedBodies: string[] = [];

    fetchHandler = async (request, url) => {
      if (url.endsWith('/v1/auth/refresh')) {
        return jsonResponse(200, { accessToken: 'fresh-token', refreshToken: 'fresh-refresh' });
      }
      // First inspector call carries the stale token → 401. Consume the body
      // first, exactly as a real fetch does when it sends the request — this is
      // what leaves the original Request `bodyUsed` and breaks a naive rebuild.
      if (request.headers.get('Authorization') === 'Bearer stale-token') {
        await request.text();
        return new Response(null, { status: 401 });
      }
      // Retry: capture the body to prove it survived the rebuild.
      retriedBodies.push(await request.clone().text());
      return jsonResponse(200, { appointmentId: 'apt-1', status: 'SCHEDULED', startedAt: 'now' });
    };

    const api = await importApi();
    const body = { latitude: -33.8, longitude: 151.2 };
    const { response, error } = await api.POST('/v1/inspector/appointments/{appointmentId}/start', {
      params: { path: { appointmentId: 'apt-1' } },
      body,
    });

    expect(error).toBeUndefined();
    expect(response.status).toBe(200);
    // The retry must carry the original JSON body (the bug threw a TypeError here).
    expect(retriedBodies).toHaveLength(1);
    expect(JSON.parse(retriedBodies[0]!)).toEqual(body);
    expect(setTokens).toHaveBeenCalledWith('fresh-token', 'fresh-refresh');
  });
});
