import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLocalExecutionState } from '../useLocalExecutionState';
import { saveExecutionState, getExecutionState, clearExecutionState } from '../../lib/indexeddb';

vi.mock('../../lib/indexeddb', () => ({
  saveExecutionState: vi.fn(),
  getExecutionState: vi.fn(),
  clearExecutionState: vi.fn(),
}));

const mockSave = vi.mocked(saveExecutionState);
const mockGet = vi.mocked(getExecutionState);
const mockClear = vi.mocked(clearExecutionState);

function strictWrapper({ children }: { children: ReactNode }) {
  return <StrictMode>{children}</StrictMode>;
}

describe('useLocalExecutionState', () => {
  beforeEach(() => {
    mockSave.mockReset();
    mockSave.mockResolvedValue(undefined);
    mockGet.mockReset();
    mockGet.mockResolvedValue(undefined);
    mockClear.mockReset();
    mockClear.mockResolvedValue(undefined);
  });

  it('persists exactly once per state update, even under StrictMode double-invoke', async () => {
    const { result } = renderHook(() => useLocalExecutionState('apt-1'), { wrapper: strictWrapper });

    await waitFor(() => expect(result.current.isRestored).toBe(true));
    mockSave.mockClear();

    act(() => {
      result.current.updateState({ phase: 'IN_PROGRESS' });
    });

    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave).toHaveBeenCalledTimes(1);
    // This hook owns the save-time stamp now that useAutoSave is gone (PWA-13).
    expect(mockSave).toHaveBeenCalledWith(
      'apt-1',
      expect.objectContaining({ phase: 'IN_PROGRESS', lastSavedAt: expect.any(String) }),
    );
  });

  // Regression: the persist effect must not resurrect the row clearState just
  // deleted. clearState commits DEFAULT_STATE, which is keyed by the effect —
  // without the ref gate the effect would re-save DEFAULT right after the delete.
  it('clearState deletes without the persist effect re-saving the default row', async () => {
    const { result } = renderHook(() => useLocalExecutionState('apt-1'));

    await waitFor(() => expect(result.current.isRestored).toBe(true));
    mockSave.mockClear();
    mockClear.mockClear();

    act(() => {
      result.current.clearState();
    });

    await waitFor(() => expect(mockClear).toHaveBeenCalledWith('apt-1'));
    // Give the persist effect a chance to (wrongly) fire.
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockSave).not.toHaveBeenCalled();
  });

  // Regression: a fresh mount with no saved state must not write a DEFAULT row.
  it('does not persist a default row on mount when nothing was restored', async () => {
    const { result } = renderHook(() => useLocalExecutionState('apt-1'));
    await waitFor(() => expect(result.current.isRestored).toBe(true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockSave).not.toHaveBeenCalled();
  });

  // Regression (PR-02): when the appointment id changes to one with no saved row,
  // the hook must reset to the default state. The Today screen reuses the single
  // Next card in place as the plan advances, so a leaked DONE/IN_PROGRESS state
  // from the previous stop would hide the next stop's "Check in" button.
  it('resets to the default state when the appointment id changes to one without a saved row', async () => {
    mockGet.mockImplementation((id: string) =>
      Promise.resolve(
        id === 'apt-1'
          ? {
              appointmentId: 'apt-1',
              phase: 'DONE',
              pendingSync: false,
              startLocation: null,
              finishLocation: null,
              startedAt: null,
              errorMessage: null,
              lastSavedAt: null,
            }
          : undefined,
      ),
    );

    const { result, rerender } = renderHook(({ id }) => useLocalExecutionState(id), {
      initialProps: { id: 'apt-1' },
    });

    await waitFor(() => expect(result.current.state.phase).toBe('DONE'));

    rerender({ id: 'apt-2' });

    await waitFor(() => expect(result.current.state.appointmentId).toBe('apt-2'));
    expect(result.current.isRestored).toBe(true);
    expect(result.current.state.phase).toBe('PRE_START');
  });
});
