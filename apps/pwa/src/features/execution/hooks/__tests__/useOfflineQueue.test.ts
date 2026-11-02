import { renderHook, waitFor, act } from '@testing-library/react';
import type * as ReactQuery from '@tanstack/react-query';
import { ApiError } from '@properfy/shared';
import {
  useOfflineQueue,
  resetQueueSnapshot,
  refreshQueueSnapshot,
  getQueueSnapshot,
} from '../useOfflineQueue';

const mockApiPost = vi.fn();
const mockGetAllQueuedActions = vi.fn();
const mockRemoveQueuedAction = vi.fn();
const mockUpdateQueuedAction = vi.fn();
const mockClearExecutionState = vi.fn();
const mockUseIsOnline = vi.fn();
const mockShowError = vi.fn();
const mockInvalidateQueries = vi.fn();
const mockEmitExecutionStateChange = vi.fn();

vi.mock('@/hooks/useApiQuery', () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactQuery>();
  // One stable client instance: returning a fresh object each render would change
  // the hook's useCallback deps, re-fire its effect and trigger extra queue passes.
  const client = { invalidateQueries: (...args: unknown[]) => mockInvalidateQueries(...args) };
  return { ...actual, useQueryClient: () => client };
});

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

vi.mock('../../lib/execution-state-events', () => ({
  emitExecutionStateChange: (...args: unknown[]) => mockEmitExecutionStateChange(...args),
  subscribeExecutionStateChange: () => () => {},
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
    mockInvalidateQueries.mockReset();
    mockEmitExecutionStateChange.mockReset();
  });

  it('processes queued actions in createdAt order and clears execution state after FINISH sync', async () => {
    mockUseIsOnline.mockReturnValue(true);
    mockGetAllQueuedActions.mockResolvedValue([
      {
        id: 'b',
        type: 'FINISH',
        appointmentId: 'apt-1',
        payload: { latitude: -33.8688, longitude: 151.2093 },
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
        payload: { latitude: -33.8688, longitude: 151.2093 },
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
        payload: { latitude: -33.8688, longitude: 151.2093 },
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
        payload: { latitude: -33.8688, longitude: 151.2093 },
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

  it('stops sending queued actions once a logout wipes the queue mid-run (PWA-7)', async () => {
    mockUseIsOnline.mockReturnValue(true);
    // Two actions in the same appointment group, processed sequentially.
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
        status: 'PENDING',
      },
      {
        id: 'b',
        type: 'FINISH',
        appointmentId: 'apt-1',
        payload: { latitude: 3, longitude: 4 },
        idempotencyKey: 'finish-key',
        createdAt: '2026-03-25T10:05:00.000Z',
        retryCount: 0,
        lastError: null,
        status: 'PENDING',
      },
    ]);

    // Hold the first (START) send open until the test releases it, then simulate a
    // logout before releasing so the FINISH iteration sees the bumped generation.
    let releaseStart!: () => void;
    const startInFlight = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });
    mockApiPost.mockImplementation(async (path: string) => {
      if (path.endsWith('/start')) {
        await startInFlight;
        return { data: { ok: true } };
      }
      return { data: { ok: true } };
    });

    renderHook(() => useOfflineQueue());

    await waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(1));
    expect(mockApiPost.mock.calls[0][0]).toBe('/v1/inspector/appointments/apt-1/start');

    await act(async () => {
      resetQueueSnapshot(); // logout
      releaseStart();
      // Let the run settle: the post-await guard fires, the loop breaks, the
      // allSettled resolves and the finally runs.
      await new Promise((r) => setTimeout(r, 0));
    });

    // The in-flight START's write-backs are skipped (the queue was wiped) and the
    // FINISH is never sent after the logout invalidated the run.
    expect(mockApiPost).toHaveBeenCalledTimes(1);
    expect(mockRemoveQueuedAction).not.toHaveBeenCalled();
    expect(mockApiPost).not.toHaveBeenCalledWith(
      '/v1/inspector/appointments/apt-1/finish',
      expect.anything(),
      expect.anything(),
    );
  });

  it('does not resurrect a failed action in IndexedDB when it fails after logout (PWA-7)', async () => {
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
        status: 'PENDING',
      },
    ]);

    // Hold the send open, log out while it is in flight, then let it reject the way
    // a post-logout request would (tokens cleared → 401 / network error).
    let rejectStart!: (err: Error) => void;
    const startInFlight = new Promise<void>((_resolve, reject) => {
      rejectStart = reject;
    });
    mockApiPost.mockReturnValue(startInFlight);

    renderHook(() => useOfflineQueue());
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(1));

    await act(async () => {
      resetQueueSnapshot(); // logout
      rejectStart(new Error('Unauthorized'));
      await new Promise((r) => setTimeout(r, 0));
    });

    // The catch block must not re-put the previous inspector's action.
    expect(mockUpdateQueuedAction).not.toHaveBeenCalled();
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('does not repopulate the badge snapshot when a logout lands during the read (PWA-7)', async () => {
    resetQueueSnapshot();
    expect(getQueueSnapshot()).toEqual([]);

    // The IndexedDB read is in flight when the logout fires.
    let resolveRead!: (actions: unknown[]) => void;
    mockGetAllQueuedActions.mockReturnValue(
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    );

    const refreshing = refreshQueueSnapshot();
    resetQueueSnapshot(); // logout bumps the generation mid-read
    resolveRead([{ id: 'stale', status: 'PENDING' }]); // old inspector's actions arrive late
    await refreshing;

    // The late read is discarded; the badge stays empty.
    expect(getQueueSnapshot()).toEqual([]);
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

  describe('permanent START failure (L-F03-02 / D21)', () => {
    const startAction = {
      id: 'a',
      type: 'START' as const,
      appointmentId: 'apt-1',
      payload: { latitude: 1, longitude: 2 },
      idempotencyKey: 'start-key',
      createdAt: '2026-03-25T10:00:00.000Z',
      retryCount: 0,
      lastError: null,
      status: 'PENDING' as const,
    };
    const finishAction = {
      id: 'b',
      type: 'FINISH' as const,
      appointmentId: 'apt-1',
      payload: { latitude: 3, longitude: 4 },
      idempotencyKey: 'finish-key',
      createdAt: '2026-03-25T10:05:00.000Z',
      retryCount: 0,
      lastError: null,
      status: 'PENDING' as const,
    };

    it('fails a 422 GEOFENCE check-in on the first response, drops the chained FINISH and clears local state', async () => {
      mockUseIsOnline.mockReturnValue(true);
      mockGetAllQueuedActions.mockResolvedValue([startAction, finishAction]);
      mockApiPost.mockRejectedValue(
        new ApiError(
          422,
          'You are 640 m from the property. Check-in is only allowed within 300 m. If you are at the right address, contact operations.',
          'GEOFENCE_OUT_OF_RADIUS',
        ),
      );

      renderHook(() => useOfflineQueue());

      await waitFor(() =>
        expect(mockUpdateQueuedAction).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'a', status: 'FAILED' }),
        ),
      );
      // No retry: apiPost hit once for the START and the FINISH was never sent.
      expect(mockApiPost).toHaveBeenCalledTimes(1);
      expect(mockApiPost.mock.calls[0][0]).toBe('/v1/inspector/appointments/apt-1/start');
      // The chained FINISH is removed so it can never be sent for a rejected job.
      expect(mockRemoveQueuedAction).toHaveBeenCalledWith('b');
      expect(mockClearExecutionState).toHaveBeenCalledWith('apt-1');
      expect(mockEmitExecutionStateChange).toHaveBeenCalledWith('apt-1');
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['inspector', 'schedule'] });
      expect(mockShowError).toHaveBeenCalledWith(
        "A queued inspection sync failed: You are 640 m from the property. Check-in is only allowed within 300 m. If you are at the right address, contact operations. Check in again when you're at the property.",
      );
    });

    it('fails a 404 APPOINTMENT_NOT_FOUND check-in the same way, without the geofence hint', async () => {
      mockUseIsOnline.mockReturnValue(true);
      mockGetAllQueuedActions.mockResolvedValue([startAction, finishAction]);
      mockApiPost.mockRejectedValue(
        new ApiError(404, 'This appointment is no longer assigned to you.', 'APPOINTMENT_NOT_FOUND'),
      );

      renderHook(() => useOfflineQueue());

      await waitFor(() =>
        expect(mockUpdateQueuedAction).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'a', status: 'FAILED' }),
        ),
      );
      expect(mockRemoveQueuedAction).toHaveBeenCalledWith('b');
      expect(mockClearExecutionState).toHaveBeenCalledWith('apt-1');
      expect(mockShowError).toHaveBeenCalledWith(
        'A queued inspection sync failed: This appointment is no longer assigned to you.',
      );
    });

    it('fails a 403 EXECUTION_T1_BLOCKED check-in the same way', async () => {
      mockUseIsOnline.mockReturnValue(true);
      mockGetAllQueuedActions.mockResolvedValue([startAction]);
      mockApiPost.mockRejectedValue(
        new ApiError(403, 'You can only start on the inspection day.', 'EXECUTION_T1_BLOCKED'),
      );

      renderHook(() => useOfflineQueue());

      await waitFor(() =>
        expect(mockUpdateQueuedAction).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'a', status: 'FAILED' }),
        ),
      );
      expect(mockClearExecutionState).toHaveBeenCalledWith('apt-1');
    });

    it('keeps a 503 check-in PENDING with retryCount+1 and leaves local state + FINISH intact', async () => {
      mockUseIsOnline.mockReturnValue(true);
      mockGetAllQueuedActions.mockResolvedValue([startAction, finishAction]);
      mockApiPost.mockRejectedValue(new ApiError(503, 'Service unavailable', 'SERVICE_UNAVAILABLE'));

      renderHook(() => useOfflineQueue());

      await waitFor(() =>
        expect(mockUpdateQueuedAction).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'a', retryCount: 1, status: 'PENDING' }),
        ),
      );
      expect(mockClearExecutionState).not.toHaveBeenCalled();
      expect(mockEmitExecutionStateChange).not.toHaveBeenCalled();
      expect(mockRemoveQueuedAction).not.toHaveBeenCalledWith('b');
    });

    it('does not clear anything on a 401 (logout flow handles it)', async () => {
      mockUseIsOnline.mockReturnValue(true);
      mockGetAllQueuedActions.mockResolvedValue([startAction]);
      mockApiPost.mockRejectedValue(new ApiError(401, 'Unauthorized', 'UNAUTHORIZED'));

      renderHook(() => useOfflineQueue());

      await waitFor(() =>
        expect(mockUpdateQueuedAction).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'a', retryCount: 1, status: 'PENDING' }),
        ),
      );
      expect(mockClearExecutionState).not.toHaveBeenCalled();
    });

    it('leaves a FINISH for another appointment intact when a START fails permanently', async () => {
      mockUseIsOnline.mockReturnValue(true);
      const otherFinish = {
        ...finishAction,
        id: 'c',
        appointmentId: 'apt-2',
        idempotencyKey: 'finish-key-2',
        createdAt: '2026-03-25T10:01:00.000Z',
      };
      mockGetAllQueuedActions.mockResolvedValue([startAction, finishAction, otherFinish]);
      mockApiPost.mockImplementation((path: string) => {
        if (path === '/v1/inspector/appointments/apt-1/start') {
          return Promise.reject(new ApiError(422, 'Out of radius', 'GEOFENCE_OUT_OF_RADIUS'));
        }
        return Promise.resolve({ data: { ok: true } });
      });

      renderHook(() => useOfflineQueue());

      await waitFor(() => expect(mockRemoveQueuedAction).toHaveBeenCalledWith('c'));
      // apt-1 FINISH removed (chained), apt-2 FINISH sent and removed on success.
      expect(mockRemoveQueuedAction).toHaveBeenCalledWith('b');
      expect(mockApiPost).toHaveBeenCalledWith(
        '/v1/inspector/appointments/apt-2/finish',
        { latitude: 3, longitude: 4 },
        { 'Idempotency-Key': 'finish-key-2' },
      );
    });
  });
});
