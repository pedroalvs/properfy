import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/services/api';
import { useSetRentalTenantAvailability } from './useSetRentalTenantAvailability';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: { POST: vi.fn() },
}));

const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess, showError }),
}));

const SLOTS = [{ dayOfWeek: 'MON', start: '09:00', end: '12:00' }] as const;
const post = vi.mocked(api.POST);

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () => useSetRentalTenantAvailability('appt-1'),
    { wrapper },
  );
  return { ...hook, invalidate };
}

describe('useSetRentalTenantAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    post.mockResolvedValue({ data: { data: {} }, error: undefined } as never);
  });

  it('sends an idempotency key when declining and reuses it after an ambiguous failure', async () => {
    post
      .mockResolvedValueOnce({ data: undefined, error: { error: { message: 'Network response lost' } } } as never)
      .mockResolvedValueOnce({ data: { data: {} }, error: undefined } as never);
    const { result } = setup();

    act(() => result.current.setAvailability([...SLOTS], true));
    await waitFor(() => expect(showError).toHaveBeenCalled());
    const firstOptions = post.mock.calls[0]?.[1] as unknown as {
      headers?: Record<string, string>;
    };
    const firstKey = firstOptions?.headers?.['Idempotency-Key'];
    expect(firstKey).toEqual(expect.any(String));

    act(() => result.current.setAvailability([...SLOTS], true));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    const retryOptions = post.mock.calls[1]?.[1] as unknown as {
      headers?: Record<string, string>;
    };
    expect(retryOptions?.headers?.['Idempotency-Key']).toBe(firstKey);
  });

  it('invalidates the list, detail, and map caches after saving', async () => {
    const { result, invalidate } = setup();

    act(() => result.current.setAvailability([...SLOTS], false));
    await waitFor(() => expect(showSuccess).toHaveBeenCalled());

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['appointments'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['appointments', 'appt-1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['appointments-map'] });
  });
});
