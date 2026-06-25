import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useUpdateInspectorSelf } from '../useUpdateInspectorSelf';

const mockApiPatch = vi.fn();

vi.mock('@/services/api', () => ({
  api: { PATCH: (...args: unknown[]) => mockApiPatch(...args) },
}));

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

describe('useUpdateInspectorSelf', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sends PATCH to /v1/inspectors/me with phone payload', async () => {
    mockApiPatch.mockResolvedValue({ data: {}, error: undefined });

    const { result } = renderHook(() => useUpdateInspectorSelf(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ phone: '+61412345678' });
    });

    expect(mockApiPatch).toHaveBeenCalledWith('/v1/inspectors/me', { body: { phone: '+61412345678' } });
  });

  it('surfaces error on API failure', async () => {
    mockApiPatch.mockResolvedValue({ data: undefined, error: { error: { message: 'Bad request' } } });

    const { result } = renderHook(() => useUpdateInspectorSelf(), { wrapper: makeWrapper() });

    await act(async () => {
      try {
        await result.current.mutateAsync({ phone: 'bad' });
      } catch {
        // expected
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('starts in idle state', () => {
    const { result } = renderHook(() => useUpdateInspectorSelf(), { wrapper: makeWrapper() });
    expect(result.current.isPending).toBe(false);
    expect(result.current.isError).toBe(false);
  });
});
