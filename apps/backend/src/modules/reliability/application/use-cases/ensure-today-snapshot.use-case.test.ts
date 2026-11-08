import { describe, expect, it, vi } from 'vitest';
import { EnsureTodaySnapshotUseCase } from './ensure-today-snapshot.use-case';

const NOW = new Date('2026-12-01T20:00:00.000Z'); // 2026-12-02 07:00 AEDT
const COMPUTED_AT = new Date('2026-12-01T17:16:00.000Z'); // 04:16 AEDT

function makeLogger() {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as never;
}

function make(opts: { computedAt: Date | null; settingsUpdatedAt: Date | null }) {
  const enqueue = vi.fn(async () => {});
  const logger = makeLogger();
  const uc = new EnsureTodaySnapshotUseCase(
    { enqueue },
    async () => opts.computedAt,
    async () => opts.settingsUpdatedAt,
    logger,
  );
  return { uc, enqueue, logger };
}

describe('EnsureTodaySnapshotUseCase', () => {
  it('enqueues a BACKFILL and returns ENQUEUED_MISSING when today has no row', async () => {
    const { uc, enqueue } = make({ computedAt: null, settingsUpdatedAt: null });
    const outcome = await uc.execute({ now: NOW });
    expect(outcome).toBe('ENQUEUED_MISSING');
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith('reliability.compute-snapshots', { trigger: 'BACKFILL' }, expect.any(Object));
  });

  it('returns UP_TO_DATE when the weights have not changed since the compute', async () => {
    const { uc, enqueue } = make({ computedAt: COMPUTED_AT, settingsUpdatedAt: new Date('2026-11-30T10:00:00Z') });
    expect(await uc.execute({ now: NOW })).toBe('UP_TO_DATE');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('returns UP_TO_DATE when the weights were never saved', async () => {
    const { uc, enqueue } = make({ computedAt: COMPUTED_AT, settingsUpdatedAt: null });
    expect(await uc.execute({ now: NOW })).toBe('UP_TO_DATE');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('returns PENDING when the weights changed less than 15 minutes ago', async () => {
    const tenMinAgo = new Date(NOW.getTime() - 10 * 60_000); // 06:50 AEDT, after the 04:16 compute
    const { uc, enqueue, logger } = make({ computedAt: COMPUTED_AT, settingsUpdatedAt: tenMinAgo });
    expect(await uc.execute({ now: NOW })).toBe('PENDING');
    expect(enqueue).not.toHaveBeenCalled();
    expect((logger as unknown as { error: ReturnType<typeof vi.fn> }).error).not.toHaveBeenCalled();
  });

  it('logs recompute_overdue and enqueues SETTINGS_CHANGED when the recompute is 20 minutes overdue', async () => {
    const twentyMinAgo = new Date(NOW.getTime() - 20 * 60_000); // 06:40 AEDT
    const { uc, enqueue, logger } = make({ computedAt: COMPUTED_AT, settingsUpdatedAt: twentyMinAgo });
    expect(await uc.execute({ now: NOW })).toBe('ENQUEUED_OVERDUE');
    expect((logger as unknown as { error: ReturnType<typeof vi.fn> }).error).toHaveBeenCalledWith(
      { settingsUpdatedAt: twentyMinAgo.toISOString(), computedAt: COMPUTED_AT.toISOString() },
      'reliability.recompute_overdue',
    );
    expect(enqueue).toHaveBeenCalledWith('reliability.compute-snapshots', { trigger: 'SETTINGS_CHANGED' }, expect.any(Object));
  });

  it('enqueues up to two jobs when called twice with no row (lock/idempotency resolve the rest)', async () => {
    const { uc, enqueue } = make({ computedAt: null, settingsUpdatedAt: null });
    await uc.execute({ now: NOW });
    await uc.execute({ now: NOW });
    expect(enqueue).toHaveBeenCalledTimes(2);
  });
});
