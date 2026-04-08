import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditRetentionWorker } from '../../../src/modules/audit/infrastructure/workers/audit-retention.worker';
import type { Logger } from '../../../src/shared/infrastructure/logger';

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    silent: vi.fn(),
    level: 'info',
  } as unknown as Logger;
}

function makePrisma() {
  return {
    $queryRawUnsafe: vi.fn(),
  };
}

describe('AuditRetentionWorker', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let logger: Logger;
  let worker: AuditRetentionWorker;

  beforeEach(() => {
    prisma = makePrisma();
    logger = makeLogger();
    worker = new AuditRetentionWorker(prisma as any, logger);
  });

  it('returns zero counts when no actions exist', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([]); // distinct actions

    const result = await worker.execute();

    expect(result).toEqual({ deletedCount: 0, preservedCount: 0 });
  });

  it('deletes eligible entries past retention period', async () => {
    // Distinct actions
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      { action: 'auth.loginSuccess' },
    ]);

    // Candidate count
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ count: 5 }]);

    // First batch delete
    prisma.$queryRawUnsafe.mockResolvedValueOnce([1, 1, 1, 1, 1]); // 5 deleted

    // Second batch (empty - no more)
    prisma.$queryRawUnsafe.mockResolvedValueOnce([]); // 0 deleted

    const result = await worker.execute();

    expect(result.deletedCount).toBe(5);
    expect(result.preservedCount).toBe(0);
  });

  it('preserves cross-check-protected appointment.statusTransition entries', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      { action: 'appointment.statusTransition' },
    ]);

    // Candidate count
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ count: 10 }]);

    // Protected IDs query
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      { id: 'protected-1' },
      { id: 'protected-2' },
    ]);

    // First batch delete (excluding protected) - 8 deleted
    prisma.$queryRawUnsafe.mockResolvedValueOnce([1, 1, 1, 1, 1, 1, 1, 1]);

    // Second batch (empty)
    prisma.$queryRawUnsafe.mockResolvedValueOnce([]);

    const result = await worker.execute();

    expect(result.deletedCount).toBe(8);
    expect(result.preservedCount).toBe(2);

    // Verify the protected IDs were passed to the delete query
    const deleteCalls = prisma.$queryRawUnsafe.mock.calls;
    // The delete call should include the protected IDs array
    const deleteCall = deleteCalls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('to_delete') && call[0].includes('ALL'),
    );
    expect(deleteCall).toBeDefined();
    expect(deleteCall![3]).toEqual(['protected-1', 'protected-2']);
  });

  it('retains financial entries for 7 years', async () => {
    const now = new Date('2030-01-01T00:00:00Z');

    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      { action: 'financial.entryCreated' },
    ]);

    // Candidate count - entries within 7 years
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ count: 0 }]);

    const result = await worker.execute(now);

    expect(result.deletedCount).toBe(0);

    // Verify the cutoff date is ~7 years ago from now
    const countCall = prisma.$queryRawUnsafe.mock.calls[1];
    const cutoffDate = countCall[2] as Date;
    // 7 years ago from 2030-01-01 is approximately 2023-01-01 (7 * 365.25 = 2556.75 days)
    expect(cutoffDate.getFullYear()).toBe(2023);
  });

  it('skips actions with zero candidates', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      { action: 'user.created' },
    ]);

    // Zero candidates
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ count: 0 }]);

    const result = await worker.execute();

    expect(result.deletedCount).toBe(0);
    // Should not have attempted any delete queries
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
  });
});
