import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../useAuth';

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('@/services/api', () => ({
  api: {
    GET: (...args: unknown[]) => mockGet(...args),
    POST: (...args: unknown[]) => mockPost(...args),
  },
}));

const mockHasTokens = vi.fn();
const mockClearTokens = vi.fn();

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    hasTokens: () => mockHasTokens(),
    getAccessToken: () => null,
    setTokens: vi.fn(),
    clearTokens: () => mockClearTokens(),
  },
}));

const mockClearAllLocalData = vi.fn().mockResolvedValue(undefined);
const mockResetQueueSnapshot = vi.fn();

vi.mock('@/features/execution/lib/indexeddb', () => ({
  clearAllLocalData: () => mockClearAllLocalData(),
}));

vi.mock('@/features/execution/hooks/useOfflineQueue', () => ({
  resetQueueSnapshot: () => mockResetQueueSnapshot(),
}));

const loginUser = {
  id: 'user-1',
  name: 'Inspector Jane',
  email: 'jane@test.com',
  role: 'INSP',
  tenantId: null,
};

const meResponse = {
  ...loginUser,
  status: 'ACTIVE',
  phone: '+61400000000',
  totpEnabled: true,
  lastLoginAt: '2026-07-01T10:00:00Z',
  inspectorId: 'insp-1',
  inspectorPhotoUrl: 'https://example.com/photo.jpg',
};

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe('useAuth login hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasTokens.mockReturnValue(false);
    queryClient = new QueryClient();
  });

  it('hydrates extended user fields from /v1/me after login', async () => {
    mockPost.mockResolvedValue({
      data: { user: loginUser, accessToken: 'at', refreshToken: 'rt' },
      error: undefined,
      response: { status: 200 },
    });
    mockGet.mockResolvedValue({ data: meResponse, error: undefined });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login('jane@test.com', 'secret');
    });

    await waitFor(() => {
      expect(result.current.user?.phone).toBe('+61400000000');
    });
    expect(result.current.user?.inspectorId).toBe('insp-1');
    expect(result.current.user?.totpEnabled).toBe(true);
    expect(mockGet).toHaveBeenCalledWith('/v1/me');
  });

  it('keeps the minimal user logged in when /v1/me fails after login', async () => {
    mockPost.mockResolvedValue({
      data: { user: loginUser, accessToken: 'at', refreshToken: 'rt' },
      error: undefined,
      response: { status: 200 },
    });
    mockGet.mockRejectedValue(new Error('network'));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login('jane@test.com', 'secret');
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe('jane@test.com');
    expect(result.current.user?.phone).toBeUndefined();
  });

  it('keeps the minimal user when /v1/me resolves with an error envelope', async () => {
    mockPost.mockResolvedValue({
      data: { user: loginUser, accessToken: 'at', refreshToken: 'rt' },
      error: undefined,
      response: { status: 200 },
    });
    mockGet.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'INTERNAL', message: 'boom' } },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login('jane@test.com', 'secret');
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe('jane@test.com');
    expect(result.current.user?.phone).toBeUndefined();
  });
});

describe('useAuth logout wipes per-inspector data (PWA-7)', () => {
  const cacheDelete = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    vi.clearAllMocks();
    mockHasTokens.mockReturnValue(false);
    queryClient = new QueryClient();
    cacheDelete.mockClear();
    vi.stubGlobal('caches', { delete: cacheDelete });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears tokens, the query cache, the SW API caches and local stores on logout', async () => {
    mockPost.mockResolvedValue({ data: {}, error: undefined, response: { status: 200 } });
    const clearSpy = vi.spyOn(queryClient, 'clear');

    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => {
      result.current.logout();
    });

    expect(mockClearTokens).toHaveBeenCalled();
    expect(clearSpy).toHaveBeenCalled();
    expect(cacheDelete).toHaveBeenCalledWith('api-schedule-cache');
    expect(cacheDelete).toHaveBeenCalledWith('api-appointment-cache');
    expect(mockClearAllLocalData).toHaveBeenCalled();
    expect(mockResetQueueSnapshot).toHaveBeenCalled();
    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
  });
});
