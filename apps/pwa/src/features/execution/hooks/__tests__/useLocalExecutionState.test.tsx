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
});
