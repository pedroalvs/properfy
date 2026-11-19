import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useFinishInspection } from '../useFinishInspection';
import type { CapturedLocation } from '../../types';

const mockApiPost = vi.fn();
const mockEnqueueAction = vi.fn();
const mockRefreshQueueSnapshot = vi.fn();
const mockUseIsOnline = vi.fn();

vi.mock('@/hooks/useApiQuery', () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));
vi.mock('../../lib/indexeddb', () => ({
  enqueueAction: (...args: unknown[]) => mockEnqueueAction(...args),
}));
vi.mock('../useOfflineQueue', () => ({
  refreshQueueSnapshot: (...args: unknown[]) => mockRefreshQueueSnapshot(...args),
}));
vi.mock('@/hooks/useIsOnline', () => ({
  useIsOnline: () => mockUseIsOnline(),
}));
vi.mock('@/lib/idempotency', () => ({
  getOrCreateIdempotencyKey: (base: string) => `${base}-idem`,
}));

const location: CapturedLocation = {
  latitude: -33.87,
  longitude: 151.21,
  accuracy: 8,
  capturedAt: '2026-11-03T11:02:00.000+11:00',
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

describe('useFinishInspection', () => {
  beforeEach(() => {
    mockApiPost.mockReset();
    mockEnqueueAction.mockReset();
    mockRefreshQueueSnapshot.mockReset();
    mockUseIsOnline.mockReset();
  });

  it('sends latitude, longitude, accuracy and clientOccurredAt in the online body', async () => {
    mockUseIsOnline.mockReturnValue(true);
    mockApiPost.mockResolvedValue({ data: {} });

    const { result } = renderHook(() => useFinishInspection(), { wrapper });
    const outcome = await result.current.mutateAsync({ appointmentId: 'apt-9', location });

    expect(outcome).toEqual({ queued: false });
    expect(mockApiPost).toHaveBeenCalledWith(
      '/v1/inspector/appointments/apt-9/finish',
      {
        latitude: -33.87,
        longitude: 151.21,
        accuracy: 8,
        clientOccurredAt: '2026-11-03T11:02:00.000+11:00',
      },
      { 'Idempotency-Key': 'finish-apt-9-idem' },
    );
  });

  it('queues accuracy and clientOccurredAt when offline', async () => {
    mockUseIsOnline.mockReturnValue(false);
    mockEnqueueAction.mockResolvedValue(undefined);
    mockRefreshQueueSnapshot.mockResolvedValue(undefined);

    const { result } = renderHook(() => useFinishInspection(), { wrapper });
    const outcome = await result.current.mutateAsync({ appointmentId: 'apt-9', location });

    expect(outcome).toEqual({ queued: true });
    expect(mockApiPost).not.toHaveBeenCalled();
    expect(mockEnqueueAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'FINISH',
        appointmentId: 'apt-9',
        payload: { latitude: -33.87, longitude: 151.21, accuracy: 8, clientOccurredAt: '2026-11-03T11:02:00.000+11:00' },
      }),
    );
    await waitFor(() => expect(mockRefreshQueueSnapshot).toHaveBeenCalled());
  });
});
