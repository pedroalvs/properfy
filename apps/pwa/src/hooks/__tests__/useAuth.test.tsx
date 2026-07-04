import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
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

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    hasTokens: () => mockHasTokens(),
    getAccessToken: () => null,
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
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

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('useAuth login hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasTokens.mockReturnValue(false);
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
});
