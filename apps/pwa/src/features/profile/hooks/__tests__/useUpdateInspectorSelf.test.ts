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

  const BASE = {
    street: '1 George St',
    suburb: 'Sydney',
    city: 'Sydney',
    state: 'NSW' as const,
    postcode: '2000',
    country: 'AU' as const,
  };

  it('sends the base address in the PATCH body', async () => {
    mockApiPatch.mockResolvedValue({ data: { data: { inspectorId: 'i1' } }, error: undefined });

    const { result } = renderHook(() => useUpdateInspectorSelf(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ address: BASE });
    });

    expect(mockApiPatch).toHaveBeenCalledWith('/v1/inspectors/me', { body: { address: BASE } });
  });

  it('returns baseGeocodeFailed from the response envelope', async () => {
    mockApiPatch.mockResolvedValue({
      data: { data: { inspectorId: 'i1', baseGeocodeFailed: true } },
      error: undefined,
    });

    const { result } = renderHook(() => useUpdateInspectorSelf(), { wrapper: makeWrapper() });

    let returned: { baseGeocodeFailed?: boolean } | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync({ address: BASE });
    });

    expect(returned?.baseGeocodeFailed).toBe(true);
  });

  it('propagates the API error message', async () => {
    mockApiPatch.mockResolvedValue({ data: undefined, error: { error: { message: 'Only Australian addresses are supported' } } });

    const { result } = renderHook(() => useUpdateInspectorSelf(), { wrapper: makeWrapper() });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ address: BASE });
      }),
    ).rejects.toThrow('Only Australian addresses are supported');
  });

  it('invalidates the inspector query on success', async () => {
    mockApiPatch.mockResolvedValue({ data: { data: { inspectorId: 'i1' } }, error: undefined });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);

    const { result } = renderHook(() => useUpdateInspectorSelf(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ address: BASE });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspector'] });
  });
});
