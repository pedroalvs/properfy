import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useUpdateInspectorAvailabilityTemplate } from '../useUpdateInspectorAvailabilityTemplate';
import type { AvailabilityTemplate } from '@properfy/shared';

const mockApiPut = vi.fn();

vi.mock('@/services/api', () => ({
  api: { PUT: (...args: unknown[]) => mockApiPut(...args) },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

const OFF = { am: false, pm: false };
const ON = { am: true, pm: true };

const TEMPLATE: AvailabilityTemplate = {
  mon: ON, tue: OFF, wed: ON, thu: OFF, fri: ON, sat: OFF, sun: OFF,
};

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

describe('useUpdateInspectorAvailabilityTemplate', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sends PUT to /v1/inspectors/me/availability-template with full template', async () => {
    mockApiPut.mockResolvedValue({
      data: { template: TEMPLATE, overrides: { mon: OFF, tue: OFF, wed: OFF, thu: OFF, fri: OFF, sat: OFF, sun: OFF } },
      error: undefined,
    });

    const { result } = renderHook(() => useUpdateInspectorAvailabilityTemplate(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync(TEMPLATE);
    });

    expect(mockApiPut).toHaveBeenCalledWith(
      '/v1/inspectors/me/availability-template',
      { body: { template: TEMPLATE } },
    );
  });

  it('surfaces error on API failure', async () => {
    mockApiPut.mockResolvedValue({ data: undefined, error: { error: { message: 'Server error' } } });

    const { result } = renderHook(() => useUpdateInspectorAvailabilityTemplate(), { wrapper: makeWrapper() });

    await act(async () => {
      try {
        await result.current.mutateAsync(TEMPLATE);
      } catch {
        // expected
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('starts in idle state', () => {
    const { result } = renderHook(() => useUpdateInspectorAvailabilityTemplate(), { wrapper: makeWrapper() });
    expect(result.current.isPending).toBe(false);
  });
});
