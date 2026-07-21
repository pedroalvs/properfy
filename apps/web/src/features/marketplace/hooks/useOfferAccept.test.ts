import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
    showInfo: vi.fn(),
    dismiss: vi.fn(),
    messages: [],
  }),
  SnackbarProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { api } from '@/services/api';
import { useOfferAccept } from './useOfferAccept';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPost.mockReset();
  mockShowSuccess.mockReset();
  mockShowError.mockReset();
});

describe('useOfferAccept', () => {
  it('calls POST with correct path when accepting', async () => {
    mockPost.mockResolvedValueOnce({ data: { success: true } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useOfferAccept(), { wrapper });

    act(() => {
      result.current.accept('grp-01');
    });

    await waitFor(() => {
      expect(result.current.isAccepting).toBe(false);
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/v1/marketplace/offers/grp-01/accept',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': expect.any(String),
        }),
      }),
    );
  });

  it('includes Idempotency-Key header', async () => {
    mockPost.mockResolvedValueOnce({ data: { success: true } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useOfferAccept(), { wrapper });

    act(() => {
      result.current.accept('grp-01');
    });

    await waitFor(() => {
      expect(result.current.isAccepting).toBe(false);
    });

    const callArgs = mockPost.mock.calls[0]?.[1];
    expect(callArgs?.headers?.['Idempotency-Key']).toBeDefined();
    expect(typeof callArgs?.headers?.['Idempotency-Key']).toBe('string');
    expect(callArgs?.headers?.['Idempotency-Key'].length).toBeGreaterThan(0);
  });

  it('shows success snackbar on successful accept', async () => {
    mockPost.mockResolvedValueOnce({ data: { success: true } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useOfferAccept(), { wrapper });

    act(() => {
      result.current.accept('grp-01');
    });

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith('Offer accepted');
    });
  });

  it('shows error snackbar on failure', async () => {
    mockPost.mockResolvedValueOnce({ data: undefined, error: { status: 409, message: 'Already accepted' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useOfferAccept(), { wrapper });

    act(() => {
      result.current.accept('grp-01');
    });

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled();
    });
  });

  it('calls onSuccess callback after successful accept', async () => {
    mockPost.mockResolvedValueOnce({ data: { success: true } });
    const onSuccess = vi.fn();
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useOfferAccept(onSuccess), { wrapper });

    act(() => {
      result.current.accept('grp-01');
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });
});
