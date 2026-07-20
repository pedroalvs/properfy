import { renderHook, waitFor, act } from '@testing-library/react';
import { useOfflineQueue } from '../useOfflineQueue';

const mockApiPost = vi.fn();
const mockGetAllQueuedActions = vi.fn();
const mockRemoveQueuedAction = vi.fn();
const mockUpdateQueuedAction = vi.fn();
const mockClearExecutionState = vi.fn();
const mockUseIsOnline = vi.fn();
const mockShowError = vi.fn();

vi.mock('@/hooks/useApiQuery', () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({
    showSuccess: vi.fn(),
    showError: mockShowError,
    showInfo: vi.fn(),
    dismiss: vi.fn(),
    messages: [],
  }),
}));

vi.mock('@/hooks/useIsOnline', () => ({
  useIsOnline: () => mockUseIsOnline(),
}));

vi.mock('../../lib/indexeddb', () => ({
  getAllQueuedActions: (...args: unknown[]) => mockGetAllQueuedActions(...args),
  removeQueuedAction: (...args: unknown[]) => mockRemoveQueuedAction(...args),
  updateQueuedAction: (...args: unknown[]) => mockUpdateQueuedAction(...args),
  clearExecutionState: (...args: unknown[]) => mockClearExecutionState(...args),
}));

describe('useOfflineQueue', () => {
  beforeEach(() => {
    mockApiPost.mockReset();
    mockGetAllQueuedActions.mockReset();
    mockRemoveQueuedAction.mockReset();
    mockUpdateQueuedAction.mockReset();
    mockClearExecutionState.mockReset();
    mockUseIsOnline.mockReset();
    mockShowError.mockReset();
  });

  it('processes queued actions in createdAt order and clears execution state after FINISH sync', async () => {
    mockUseIsOnline.mockReturnValue(true);
    mockGetAllQueuedActions.mockResolvedValue([
      {
        id: 'b',
        type: 'FINISH',
        appointmentId: 'apt-1',
        payload: { notes: 'done' },
        idempotencyKey: 'finish-key',
        createdAt: '2026-03-25T10:05:00.000Z',
        retryCount: 0,
        lastError: null,
      },
      {
        id: 'a',
        type: 'START',
        appointmentId: 'apt-1',
        payload: { latitude: 1, longitude: 2 },
        idempotencyKey: 'start-key',
        createdAt: '2026-03-25T10:00:00.000Z',
        retryCount: 0,
        lastError: null,
      },
    ]);
    mockApiPost.mockResolvedValue({ data: { ok: true } });

    renderHook(() => useOfflineQueue());

    await waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(2));
    expect(mockApiPost.mock.calls[0][0]).toBe('/v1/inspector/appointments/apt-1/start');
    expect(mockApiPost.mock.calls[1][0]).toBe('/v1/inspector/appointments/apt-1/finish');
    expect(mockRemoveQueuedAction).toHaveBeenCalledWith('a');
    expect(mockRemoveQueuedAction).toHaveBeenCalledWith('b');
    expect(mockClearExecutionState).toHaveBeenCalledWith('apt-1');
  });

  it('increments retryCount and stops processing only for the failing appointment group', async () => {
    mockUseIsOnline.mockReturnValue(true);
    mockGetAllQueuedActions.mockResolvedValue([
      {
        id: 'a',
        type: 'START',
        appointmentId: 'apt-1',
        payload: { latitude: 1, longitude: 2 },
        idempotencyKey: 'start-key',
        createdAt: '2026-03-25T10:00:00.000Z',
        retryCount: 0,
        lastError: null,
      },
      {
        id: 'b',
        type: 'FINISH',
        appointmentId: 'apt-1',
        payload: { notes: 'done' },
        idempotencyKey: 'finish-key',
        createdAt: '2026-03-25T10:05:00.000Z',
        retryCount: 0,
        lastError: null,
      },
      {
        id: 'c',
        type: 'START',
        appointmentId: 'apt-2',
        payload: { latitude: 3, longitude: 4 },
        idempotencyKey: 'start-key-2',
        createdAt: '2026-03-25T10:02:00.000Z',
        retryCount: 0,
        lastError: null,
      },
    ]);
    mockApiPost.mockImplementation((path: string) => {
      if (path === '/v1/inspector/appointments/apt-1/start') {
        return Promise.reject(new Error('Network down'));
      }
      return Promise.resolve({ data: { ok: true } });
    });

    renderHook(() => useOfflineQueue());

    await waitFor(() => expect(mockUpdateQueuedAction).toHaveBeenCalledTimes(1));
    expect(mockUpdateQueuedAction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'a',
        retryCount: 1,
        lastError: 'Network down',
      }),
    );
    expect(mockApiPost).toHaveBeenCalledWith(
      '/v1/inspector/appointments/apt-2/start',
      { latitude: 3, longitude: 4 },
      { 'Idempotency-Key': 'start-key-2' },
    );
    expect(mockApiPost).not.toHaveBeenCalledWith(
      '/v1/inspector/appointments/apt-1/finish',
      expect.anything(),
      expect.anything(),
    );
    expect(mockRemoveQueuedAction).toHaveBeenCalledWith('c');
    expect(mockClearExecutionState).not.toHaveBeenCalled();
  });

  it('marks an action FAILED and shows a toast when retries are exhausted', async () => {
    mockUseIsOnline.mockReturnValue(true);
    mockGetAllQueuedActions.mockResolvedValue([
      {
        id: 'a',
        type: 'START',
        appointmentId: 'apt-1',
        payload: { latitude: 1, longitude: 2 },
        idempotencyKey: 'start-key',
        createdAt: '2026-03-25T10:00:00.000Z',
        retryCount: 3,
        lastError: 'Previous failure',
        status: 'PENDING',
      },
    ]);
    mockApiPost.mockRejectedValue(new Error('Geofence mismatch'));

    renderHook(() => useOfflineQueue());

    await waitFor(() =>
      expect(mockUpdateQueuedAction).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'a',
          retryCount: 4,
          lastError: 'Geofence mismatch',
          status: 'FAILED',
        }),
      ),
    );
    expect(mockShowError).toHaveBeenCalledWith(
      'A queued inspection sync failed: Geofence mismatch',
    );
  });

  it('promotes legacy exhausted records (no status field) to FAILED without retrying them', async () => {
    mockUseIsOnline.mockReturnValue(true);
    mockGetAllQueuedActions.mockResolvedValue([
      {
        id: 'a',
        type: 'START',
        appointmentId: 'apt-1',
        payload: { latitude: 1, longitude: 2 },
        idempotencyKey: 'start-key',
        createdAt: '2026-03-25T10:00:00.000Z',
        retryCount: 4,
        lastError: 'Old failure',
      },
    ]);

    renderHook(() => useOfflineQueue());

    await waitFor(() =>
      expect(mockUpdateQueuedAction).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'a', status: 'FAILED' }),
      ),
    );
    expect(mockApiPost).not.toHaveBeenCalled();
    expect(mockShowError).toHaveBeenCalledWith('A queued inspection sync failed: Old failure');
  });

  it('exposes FAILED actions and retryAction resets and reprocesses them', async () => {
    let store = [
      {
        id: 'a',
        type: 'START' as const,
        appointmentId: 'apt-1',
        payload: { latitude: 1, longitude: 2 },
        idempotencyKey: 'start-key',
        createdAt: '2026-03-25T10:00:00.000Z',
        retryCount: 4,
        lastError: 'Geofence mismatch',
        status: 'FAILED' as const,
      },
    ];
    mockUseIsOnline.mockReturnValue(true);
    mockGetAllQueuedActions.mockImplementation(async () => store.map((a) => ({ ...a })));
    mockUpdateQueuedAction.mockImplementation(async (action: (typeof store)[number]) => {
      store = store.map((a) => (a.id === action.id ? action : a));
    });
    mockRemoveQueuedAction.mockImplementation(async (id: string) => {
      store = store.filter((a) => a.id !== id);
    });
    mockApiPost.mockResolvedValue({ data: { ok: true } });

    const { result } = renderHook(() => useOfflineQueue());

    await waitFor(() => expect(result.current.failedActions).toHaveLength(1));
    expect(result.current.failedActions[0].lastError).toBe('Geofence mismatch');
    expect(mockApiPost).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.retryAction('a');
    });

    expect(mockUpdateQueuedAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a', retryCount: 0, status: 'PENDING' }),
    );
    expect(mockApiPost).toHaveBeenCalledWith(
      '/v1/inspector/appointments/apt-1/start',
      { latitude: 1, longitude: 2 },
      { 'Idempotency-Key': 'start-key' },
    );
    await waitFor(() => expect(result.current.failedActions).toHaveLength(0));
  });

  it('reprocesses a retried action exactly once even when a run is already in flight', async () => {
    let store = [
      {
        id: 'a',
        type: 'START' as const,
        appointmentId: 'apt-1',
        payload: { latitude: 1, longitude: 2 },
        idempotencyKey: 'start-key',
        createdAt: '2026-03-25T10:00:00.000Z',
        retryCount: 4,
        lastError: 'Geofence mismatch',
        status: 'FAILED' as const,
      },
    ];
    mockUseIsOnline.mockReturnValue(true);

    // First read (mount-triggered run) hangs until we release it, holding a
    // stale snapshot where the action is still FAILED.
    let releaseFirstRead!: (actions: unknown[]) => void;
    const firstRead = new Promise<unknown[]>((resolve) => {
      releaseFirstRead = resolve;
    });
    let readCount = 0;
    mockGetAllQueuedActions.mockImplementation(async () => {
      readCount += 1;
      if (readCount === 1) return firstRead;
      return store.map((a) => ({ ...a }));
    });
    mockUpdateQueuedAction.mockImplementation(async (action: (typeof store)[number]) => {
      store = store.map((a) => (a.id === action.id ? action : a));
    });
    mockRemoveQueuedAction.mockImplementation(async (id: string) => {
      store = store.filter((a) => a.id !== id);
    });
    mockApiPost.mockResolvedValue({ data: { ok: true } });

    const { result } = renderHook(() => useOfflineQueue());

    // Retry while the mount-triggered run is still blocked on its stale read.
    await act(async () => {
      const retried = result.current.retryAction('a');
      releaseFirstRead(store.map((a) => ({ ...a, status: 'FAILED', retryCount: 4 })));
      await retried;
    });

    await waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(1));
    expect(mockApiPost).toHaveBeenCalledWith(
      '/v1/inspector/appointments/apt-1/start',
      { latitude: 1, longitude: 2 },
      { 'Idempotency-Key': 'start-key' },
    );
    await waitFor(() => expect(result.current.failedActions).toHaveLength(0));
  });

  it('does not send a FINISH after its START is already FAILED, but still processes other appointments', async () => {
    mockUseIsOnline.mockReturnValue(true);
    mockGetAllQueuedActions.mockResolvedValue([
      {
        id: 'a',
        type: 'START',
        appointmentId: 'apt-1',
        payload: { latitude: 1, longitude: 2 },
        idempotencyKey: 'start-key',
        createdAt: '2026-03-25T10:00:00.000Z',
        retryCount: 4,
        lastError: 'Geofence mismatch',
        status: 'FAILED',
      },
      {
        id: 'b',
        type: 'FINISH',
        appointmentId: 'apt-1',
        payload: { notes: 'done' },
        idempotencyKey: 'finish-key',
        createdAt: '2026-03-25T10:05:00.000Z',
        retryCount: 0,
        lastError: null,
        status: 'PENDING',
      },
      {
        id: 'c',
        type: 'START',
        appointmentId: 'apt-2',
        payload: { latitude: 3, longitude: 4 },
        idempotencyKey: 'start-key-2',
        createdAt: '2026-03-25T10:02:00.000Z',
        retryCount: 0,
        lastError: null,
        status: 'PENDING',
      },
    ]);
    mockApiPost.mockResolvedValue({ data: { ok: true } });

    renderHook(() => useOfflineQueue());

    await waitFor(() => expect(mockRemoveQueuedAction).toHaveBeenCalledWith('c'));
    expect(mockApiPost).toHaveBeenCalledTimes(1);
    expect(mockApiPost).toHaveBeenCalledWith(
      '/v1/inspector/appointments/apt-2/start',
      { latitude: 3, longitude: 4 },
      { 'Idempotency-Key': 'start-key-2' },
    );
    expect(mockApiPost).not.toHaveBeenCalledWith(
      '/v1/inspector/appointments/apt-1/finish',
      expect.anything(),
      expect.anything(),
    );
  });

  it('does not send a FINISH after a legacy-exhausted START in the same appointment', async () => {
    mockUseIsOnline.mockReturnValue(true);
    mockGetAllQueuedActions.mockResolvedValue([
      {
        id: 'a',
        type: 'START',
        appointmentId: 'apt-1',
        payload: { latitude: 1, longitude: 2 },
        idempotencyKey: 'start-key',
        createdAt: '2026-03-25T10:00:00.000Z',
        retryCount: 4,
        lastError: 'Old failure',
      },
      {
        id: 'b',
        type: 'FINISH',
        appointmentId: 'apt-1',
        payload: { notes: 'done' },
        idempotencyKey: 'finish-key',
        createdAt: '2026-03-25T10:05:00.000Z',
        retryCount: 0,
        lastError: null,
        status: 'PENDING',
      },
    ]);
    mockApiPost.mockResolvedValue({ data: { ok: true } });

    renderHook(() => useOfflineQueue());

    await waitFor(() =>
      expect(mockUpdateQueuedAction).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'a', status: 'FAILED' }),
      ),
    );
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('surfaces an error toast when retryAction hits an IndexedDB failure', async () => {
    mockUseIsOnline.mockReturnValue(false);
    mockGetAllQueuedActions.mockRejectedValue(new Error('IDB unavailable'));

    const { result } = renderHook(() => useOfflineQueue());

    await act(async () => {
      await result.current.retryAction('a');
    });

    expect(mockShowError).toHaveBeenCalledWith('Unable to retry this sync right now.');
  });
});
