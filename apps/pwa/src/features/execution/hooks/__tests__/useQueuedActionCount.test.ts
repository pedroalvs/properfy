import { renderHook, act } from '@testing-library/react';
import { useQueuedActionCount } from '../useQueuedActionCount';

const mockGetAllQueuedActions = vi.fn();

vi.mock('../../lib/indexeddb', () => ({
  getAllQueuedActions: (...args: unknown[]) => mockGetAllQueuedActions(...args),
}));

describe('useQueuedActionCount', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetAllQueuedActions.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns 0 when the queue is empty', async () => {
    const { result } = renderHook(() => useQueuedActionCount());

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current).toBe(0);
  });

  it('returns the number of queued actions', async () => {
    mockGetAllQueuedActions.mockResolvedValue([
      { id: '1' },
      { id: '2' },
      { id: '3' },
    ]);

    const { result } = renderHook(() => useQueuedActionCount());

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current).toBe(3);
  });

  it('updates count on polling interval', async () => {
    mockGetAllQueuedActions.mockResolvedValue([{ id: '1' }]);

    const { result } = renderHook(() => useQueuedActionCount());

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current).toBe(1);

    mockGetAllQueuedActions.mockResolvedValue([{ id: '1' }, { id: '2' }]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(result.current).toBe(2);
  });
});
