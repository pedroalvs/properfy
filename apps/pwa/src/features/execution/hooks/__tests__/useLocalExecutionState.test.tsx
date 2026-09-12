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
});
