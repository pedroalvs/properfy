import { renderHook, act } from '@testing-library/react';
import { useQueuedActionCount } from '../useQueuedActionCount';
import { refreshQueueSnapshot, resetQueueSnapshot } from '../useOfflineQueue';

const mockGetAllQueuedActions = vi.fn();

vi.mock('../../lib/indexeddb', () => ({
  getAllQueuedActions: (...args: unknown[]) => mockGetAllQueuedActions(...args),
}));

describe('useQueuedActionCount', () => {
  beforeEach(() => {
    mockGetAllQueuedActions.mockResolvedValue([]);
    resetQueueSnapshot();
  });

  afterEach(() => {
    resetQueueSnapshot();
    vi.restoreAllMocks();
  });

  it('returns 0 when the queue is empty', () => {
    const { result } = renderHook(() => useQueuedActionCount());
    expect(result.current).toBe(0);
  });

  it('reflects the shared queue snapshot', async () => {
    mockGetAllQueuedActions.mockResolvedValue([{ id: '1' }, { id: '2' }, { id: '3' }]);

    const { result } = renderHook(() => useQueuedActionCount());

    await act(async () => {
      await refreshQueueSnapshot();
    });

    expect(result.current).toBe(3);
  });

  it('updates when the snapshot changes (no polling)', async () => {
    mockGetAllQueuedActions.mockResolvedValue([{ id: '1' }]);
    const { result } = renderHook(() => useQueuedActionCount());

    await act(async () => {
      await refreshQueueSnapshot();
    });
    expect(result.current).toBe(1);

    mockGetAllQueuedActions.mockResolvedValue([{ id: '1' }, { id: '2' }]);
    await act(async () => {
      await refreshQueueSnapshot();
    });
    expect(result.current).toBe(2);
  });
});
