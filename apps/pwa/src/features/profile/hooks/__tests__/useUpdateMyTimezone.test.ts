import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useUpdateMyTimezone } from '../useUpdateMyTimezone';

const mockApiPatch = vi.fn();

vi.mock('@/services/api', () => ({
  api: { PATCH: (...args: unknown[]) => mockApiPatch(...args) },
}));

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

describe('useUpdateMyTimezone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends PATCH to /v1/me with the timezone', async () => {
    mockApiPatch.mockResolvedValue({ data: {}, error: undefined });
    const { result } = renderHook(() => useUpdateMyTimezone(), {
      wrapper: makeWrapper(makeClient()),
    });

    await act(async () => {
      await result.current.mutateAsync({ timezone: 'Australia/Perth' });
    });

    expect(mockApiPatch).toHaveBeenCalledWith('/v1/me', { body: { timezone: 'Australia/Perth' } });
  });

  it('invalidates queries on success so day-derived views recompute', async () => {
    mockApiPatch.mockResolvedValue({ data: {}, error: undefined });
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateMyTimezone(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ timezone: 'Australia/Perth' });
    });

    expect(invalidateSpy).toHaveBeenCalled();
  });

  it('surfaces the API error message', async () => {
    mockApiPatch.mockResolvedValue({
      data: undefined,
      error: { error: { message: 'Invalid timezone identifier' } },
    });
    const { result } = renderHook(() => useUpdateMyTimezone(), {
      wrapper: makeWrapper(makeClient()),
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ timezone: 'Not/AZone' });
      }),
    ).rejects.toThrow('Invalid timezone identifier');
  });
});
