import { openDB } from 'idb';
import { saveExecutionState } from '../indexeddb';
import type { ExecutionState } from '../../types';

vi.mock('idb', () => ({
  openDB: vi.fn(),
}));

const mockOpenDB = vi.mocked(openDB);

function makeState(): ExecutionState {
  return {
    appointmentId: 'apt-1',
    phase: 'IN_PROGRESS',
    pendingSync: false,
    startLocation: null,
    finishLocation: null,
    startedAt: null,
    errorMessage: null,
    lastSavedAt: null,
  };
}

describe('indexeddb getDB retry-after-rejection', () => {
  beforeEach(() => {
    mockOpenDB.mockReset();
  });

  it('does not cache a rejected openDB call: the next getDB() retries opening', async () => {
    mockOpenDB.mockRejectedValueOnce(new Error('open failed'));

    await expect(saveExecutionState('apt-1', makeState())).rejects.toThrow('open failed');
    expect(mockOpenDB).toHaveBeenCalledTimes(1);

    const fakeDb = { put: vi.fn().mockResolvedValue(undefined) };
    mockOpenDB.mockResolvedValueOnce(fakeDb as never);

    await saveExecutionState('apt-1', makeState());
    expect(mockOpenDB).toHaveBeenCalledTimes(2);
  });
});
