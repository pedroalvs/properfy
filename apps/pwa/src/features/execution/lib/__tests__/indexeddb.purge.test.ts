import { openDB } from 'idb';
import { purgeAppointmentFromOfflineQueue } from '../indexeddb';

// Own file so the module-level getDB() cache starts fresh (Vitest isolates
// modules per file); the sibling indexeddb.test.ts resolves a put-only fake db.
vi.mock('idb', () => ({
  openDB: vi.fn(),
}));

const mockOpenDB = vi.mocked(openDB);

describe('purgeAppointmentFromOfflineQueue', () => {
  beforeEach(() => {
    mockOpenDB.mockReset();
  });

  it('removes every queued action for the appointment and clears its execution draft', async () => {
    const getAll = vi.fn().mockResolvedValue([
      { id: 'a', appointmentId: 'apt-1', type: 'START' },
      { id: 'b', appointmentId: 'apt-1', type: 'FINISH' },
      { id: 'c', appointmentId: 'apt-2', type: 'START' },
    ]);
    const del = vi.fn().mockResolvedValue(undefined);
    mockOpenDB.mockResolvedValue({ getAll, delete: del } as never);

    await purgeAppointmentFromOfflineQueue('apt-1');

    // Both apt-1 queued actions removed; apt-2's left alone.
    expect(del).toHaveBeenCalledWith('queued-actions', 'a');
    expect(del).toHaveBeenCalledWith('queued-actions', 'b');
    expect(del).not.toHaveBeenCalledWith('queued-actions', 'c');
    // The local execution draft for apt-1 is cleared.
    expect(del).toHaveBeenCalledWith('execution-states', 'apt-1');
  });
});
