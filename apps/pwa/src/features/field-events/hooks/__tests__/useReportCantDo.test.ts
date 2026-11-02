import type { ReactNode } from 'react';
import { createElement } from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@properfy/shared';
import { useReportCantDo } from '../useReportCantDo';

const mockApiPost = vi.fn();
const mockPurge = vi.fn();
const mockRefresh = vi.fn();
const mockEnqueueAction = vi.fn();

vi.mock('@/hooks/useApiQuery', () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));
vi.mock('@/features/execution/lib/indexeddb', () => ({
  purgeAppointmentFromOfflineQueue: (...args: unknown[]) => mockPurge(...args),
  enqueueAction: (...args: unknown[]) => mockEnqueueAction(...args),
}));
vi.mock('@/features/execution/hooks/useOfflineQueue', () => ({
  refreshQueueSnapshot: (...args: unknown[]) => mockRefresh(...args),
}));

const input = {
  body: { reason: 'KEY_FAILED' as const, note: 'no lockbox' },
  idempotencyKey: 'idem-1',
};

let queryClient: QueryClient;
let invalidateSpy: ReturnType<typeof vi.spyOn>;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useReportCantDo', () => {
  beforeEach(() => {
    mockApiPost.mockReset();
    mockPurge.mockReset().mockResolvedValue(undefined);
    mockRefresh.mockReset().mockResolvedValue(undefined);
    mockEnqueueAction.mockReset();
    queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
  });

  it('posts to the cant-do route (never the offline queue) and cleans up on success', async () => {
    mockApiPost.mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useReportCantDo('apt-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(input);
    });

    expect(mockEnqueueAction).not.toHaveBeenCalled();
    expect(mockApiPost).toHaveBeenCalledWith(
      '/v1/inspector/appointments/apt-1/cant-do',
      { reason: 'KEY_FAILED', note: 'no lockbox' },
      { 'Idempotency-Key': 'idem-1' },
    );
    expect(mockPurge).toHaveBeenCalledWith('apt-1');
    expect(mockRefresh).toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspector', 'schedule'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspector', 'appointment', 'apt-1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspector', 'day-plan'] });
  });

  it('treats a 409 CANT_DO_ALREADY_REPORTED as success and still cleans up', async () => {
    mockApiPost.mockRejectedValue(new ApiError(409, 'Already reported', 'CANT_DO_ALREADY_REPORTED'));
    const { result } = renderHook(() => useReportCantDo('apt-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(input);
    });

    expect(mockPurge).toHaveBeenCalledWith('apt-1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspector', 'schedule'] });
  });

  it('rejects and does not clean up on any other error', async () => {
    mockApiPost.mockRejectedValue(new ApiError(404, 'Not found', 'APPOINTMENT_NOT_FOUND'));
    const { result } = renderHook(() => useReportCantDo('apt-1'), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync(input);
      }),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });

    expect(mockPurge).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
