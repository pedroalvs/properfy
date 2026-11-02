import type { ReactNode } from 'react';
import { createElement } from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useReportLateNotice } from '../useReportLateNotice';

const mockApiPost = vi.fn();
const mockEnqueueAction = vi.fn();

vi.mock('@/hooks/useApiQuery', () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));
// Guard: the late-notice hook must never enqueue an offline action (D7).
vi.mock('@/features/execution/lib/indexeddb', () => ({
  enqueueAction: (...args: unknown[]) => mockEnqueueAction(...args),
}));

let queryClient: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useReportLateNotice', () => {
  beforeEach(() => {
    mockApiPost.mockReset();
    mockEnqueueAction.mockReset();
    queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  });

  it('posts to the late-notice route and returns the server ETA, never enqueuing', async () => {
    mockApiPost.mockResolvedValue({
      data: {
        eventId: 'e1',
        appointmentId: 'apt-1',
        occurredAt: '2026-11-03T09:00:00.000Z',
        reason: 'TRAFFIC',
        minutesLate: 20,
        referenceAt: '2026-11-03T09:00:00.000Z',
        referenceSource: 'WINDOW_START',
        estimatedArrivalAt: '2026-11-03T09:20:00.000Z',
      },
    });

    const { result } = renderHook(() => useReportLateNotice('apt-1'), { wrapper });

    let response: unknown;
    await act(async () => {
      response = await result.current.mutateAsync({
        body: { reason: 'TRAFFIC', minutesLate: 20 },
        idempotencyKey: 'idem-late',
      });
    });

    expect(mockEnqueueAction).not.toHaveBeenCalled();
    expect(mockApiPost).toHaveBeenCalledWith(
      '/v1/inspector/appointments/apt-1/late-notice',
      { reason: 'TRAFFIC', minutesLate: 20 },
      { 'Idempotency-Key': 'idem-late' },
    );
    expect(response).toMatchObject({ estimatedArrivalAt: '2026-11-03T09:20:00.000Z', minutesLate: 20 });
  });
});
