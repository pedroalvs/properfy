import { renderHook, waitFor } from '@testing-library/react';
import { useOfflineQueue } from '../useOfflineQueue';

const mockApiPost = vi.fn();
const mockGetAllQueuedActions = vi.fn();
const mockRemoveQueuedAction = vi.fn();
const mockUpdateQueuedAction = vi.fn();
const mockClearExecutionState = vi.fn();
const mockUseIsOnline = vi.fn();

vi.mock('@/hooks/useApiQuery', () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
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
});
