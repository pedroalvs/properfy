import { renderHook } from '@testing-library/react';
import { useAutoSave } from '../useAutoSave';
import { saveExecutionState } from '../../lib/indexeddb';
import type { ExecutionState } from '../../types';

vi.mock('../../lib/indexeddb', () => ({
  saveExecutionState: vi.fn(),
}));

const mockSave = vi.mocked(saveExecutionState);

function makeState(overrides: Partial<ExecutionState> = {}): ExecutionState {
  return {
    appointmentId: 'apt-1',
    phase: 'IN_PROGRESS',
    pendingSync: false,
    startLocation: null,
    finishLocation: null,
    startedAt: null,
    errorMessage: null,
    lastSavedAt: null,
    ...overrides,
  };
}

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSave.mockClear();
    mockSave.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not save when phase is PRE_START', () => {
    const state = makeState({ phase: 'PRE_START' });
    renderHook(() => useAutoSave(state));
    vi.advanceTimersByTime(5000);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('does not save when phase is DONE', () => {
    const state = makeState({ phase: 'DONE' });
    renderHook(() => useAutoSave(state));
    vi.advanceTimersByTime(5000);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('saves state periodically during IN_PROGRESS', () => {
    const state = makeState({ phase: 'IN_PROGRESS', startedAt: '2026-03-24T09:00:00.000Z' });
    renderHook(() => useAutoSave(state));

    vi.advanceTimersByTime(2000);
    expect(mockSave).toHaveBeenCalledWith(
      'apt-1',
      expect.objectContaining({ startedAt: '2026-03-24T09:00:00.000Z' }),
    );
  });

  it('does not re-save if state has not changed', async () => {
    const state = makeState({ phase: 'IN_PROGRESS' });
    renderHook(() => useAutoSave(state));

    await vi.advanceTimersByTimeAsync(2000);
    const callCount = mockSave.mock.calls.length;

    await vi.advanceTimersByTimeAsync(2000);
    // Should not save again because state hasn't changed
    expect(mockSave).toHaveBeenCalledTimes(callCount);
  });

  it('keeps retrying the same snapshot on rejection, then stops once the save resolves', async () => {
    mockSave.mockReset();
    mockSave.mockRejectedValueOnce(new Error('idb write failed'));
    mockSave.mockResolvedValueOnce(undefined);

    const state = makeState({ phase: 'IN_PROGRESS', startedAt: '2026-03-24T09:00:00.000Z' });
    renderHook(() => useAutoSave(state));

    await vi.advanceTimersByTimeAsync(2000);
    expect(mockSave).toHaveBeenCalledTimes(1);

    // Save rejected, so lastSavedRef must not have advanced: same snapshot is retried.
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockSave).toHaveBeenCalledTimes(2);

    // This save resolves, so lastSavedRef advances and the unchanged snapshot is
    // no longer re-saved on the next tick.
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockSave).toHaveBeenCalledTimes(2);
  });

  it('cleans up interval on unmount', () => {
    const state = makeState({ phase: 'IN_PROGRESS' });
    const { unmount } = renderHook(() => useAutoSave(state));
    unmount();

    mockSave.mockClear();
    vi.advanceTimersByTime(5000);
    expect(mockSave).not.toHaveBeenCalled();
  });
});
