import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useStartInspection } from '../useStartInspection';
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
  latitude: -33.8688,
  longitude: 151.2093,
  accuracy: 12.4,
  capturedAt: '2026-11-03T09:41:12.000+11:00',
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

describe('useStartInspection', () => {
  beforeEach(() => {
    mockApiPost.mockReset();
    mockEnqueueAction.mockReset();
    mockRefreshQueueSnapshot.mockReset();
    mockUseIsOnline.mockReset();
  });

  it('sends latitude, longitude, accuracy and clientOccurredAt in the online body', async () => {
    mockUseIsOnline.mockReturnValue(true);
    mockApiPost.mockResolvedValue({ data: { status: 'IN_PROGRESS' } });

    const { result } = renderHook(() => useStartInspection(), { wrapper });
    await result.current.mutateAsync({ appointmentId: 'apt-1', location });

    expect(mockApiPost).toHaveBeenCalledWith(
      '/v1/inspector/appointments/apt-1/start',
      {
        latitude: -33.8688,
        longitude: 151.2093,
        accuracy: 12.4,
        clientOccurredAt: '2026-11-03T09:41:12.000+11:00',
      },
      { 'Idempotency-Key': 'start-apt-1-idem' },
    );
  });

  it('stores accuracy and clientOccurredAt in the queued payload when offline', async () => {
    mockUseIsOnline.mockReturnValue(false);
    mockEnqueueAction.mockResolvedValue(undefined);
    mockRefreshQueueSnapshot.mockResolvedValue(undefined);

    const { result } = renderHook(() => useStartInspection(), { wrapper });
    await result.current.mutateAsync({ appointmentId: 'apt-1', location });

    expect(mockApiPost).not.toHaveBeenCalled();
    expect(mockEnqueueAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'START',
        appointmentId: 'apt-1',
        payload: {
          latitude: -33.8688,
          longitude: 151.2093,
          accuracy: 12.4,
          clientOccurredAt: '2026-11-03T09:41:12.000+11:00',
        },
      }),
    );
    await waitFor(() => expect(mockRefreshQueueSnapshot).toHaveBeenCalled());
  });
});
