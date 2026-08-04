import { describe, it, expect, vi } from 'vitest';
import { TenantCronTick, type ICronJobRunRepository } from '../../../src/shared/application/tenant-cron-tick';

function makeRunRepo(overrides: Partial<ICronJobRunRepository> = {}): ICronJobRunRepository {
  return { tryClaim: vi.fn().mockResolvedValue(true), ...overrides };
}

describe('TenantCronTick', () => {
  it('claims only tenants whose local hour has reached the target', async () => {
    // 2026-06-15T08:30Z: Sydney (UTC+10, AEST) = 18:30 → due at 18;
    // Perth (UTC+8) = 16:30 → not due.
    const tick = new TenantCronTick(
      async () => [
        { id: 'syd', timezone: 'Australia/Sydney' },
        { id: 'per', timezone: 'Australia/Perth' },
      ],
      makeRunRepo(),
    );

    const groups = await tick.claimDue('job', 18, new Date('2026-06-15T08:30:00.000Z'));

    expect(groups).toEqual([
      { timezone: 'Australia/Sydney', todayCivil: '2026-06-15', tenantIds: ['syd'] },
    ]);
  });

  it('groups tenants sharing a timezone into one entry', async () => {
    const runRepo = makeRunRepo();
    const tick = new TenantCronTick(
      async () => [
        { id: 't1', timezone: 'Australia/Sydney' },
        { id: 't2', timezone: 'Australia/Sydney' },
        { id: 't3', timezone: 'Pacific/Auckland' },
      ],
      runRepo,
    );

    // 10:00Z: Sydney 20:00, Auckland 22:00 — all due at 18.
    const groups = await tick.claimDue('job', 18, new Date('2026-06-15T10:00:00.000Z'));

    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.timezone === 'Australia/Sydney')?.tenantIds).toEqual(['t1', 't2']);
    expect(groups.find((g) => g.timezone === 'Pacific/Auckland')?.tenantIds).toEqual(['t3']);
  });

  it('skips tenants whose (job, tenant, local date) was already claimed', async () => {
    const runRepo = makeRunRepo({
      tryClaim: vi.fn().mockImplementation(async (_job, tenantId) => tenantId === 't2'),
    });
    const tick = new TenantCronTick(
      async () => [
        { id: 't1', timezone: 'Australia/Sydney' },
        { id: 't2', timezone: 'Australia/Sydney' },
      ],
      runRepo,
    );

    const groups = await tick.claimDue('job', 18, new Date('2026-06-15T10:00:00.000Z'));
    expect(groups).toEqual([
      { timezone: 'Australia/Sydney', todayCivil: '2026-06-15', tenantIds: ['t2'] },
    ]);
  });

  it('defaults a missing tenant timezone to the platform timezone', async () => {
    const tick = new TenantCronTick(async () => [{ id: 't1', timezone: null }], makeRunRepo());
    const groups = await tick.claimDue('job', 18, new Date('2026-06-15T10:00:00.000Z'));
    expect(groups[0]?.timezone).toBe('Australia/Sydney');
  });

  it('runs exactly once per local day when ticked every hour (>= catch-up, PK dedupe)', async () => {
    // Simulate the real claim ledger with an in-memory set.
    const claimed = new Set<string>();
    const runRepo: ICronJobRunRepository = {
      tryClaim: async (job, tenantId, localDate) => {
        const key = `${job}|${tenantId}|${localDate}`;
        if (claimed.has(key)) return false;
        claimed.add(key);
        return true;
      },
    };
    const tick = new TenantCronTick(
      async () => [{ id: 't1', timezone: 'Australia/Sydney' }],
      runRepo,
    );

    // Walk 48 hourly ticks across the 2026-10-04 Sydney DST start (02:00 local
    // is skipped). Count how many groups fire per local civil date.
    const runsPerDate = new Map<string, number>();
    const start = Date.UTC(2026, 9, 2, 12, 0, 0); // 2026-10-02T12:00Z
    for (let h = 0; h < 48; h++) {
      const groups = await tick.claimDue('job', 18, new Date(start + h * 3_600_000));
      for (const g of groups) {
        runsPerDate.set(g.todayCivil, (runsPerDate.get(g.todayCivil) ?? 0) + 1);
      }
    }

    // Every covered local day fires exactly once — never zero, never twice.
    expect([...runsPerDate.values()].every((count) => count === 1)).toBe(true);
    expect(runsPerDate.size).toBeGreaterThanOrEqual(2);
  });

  it('catches up the same local day when the target-hour tick was missed', async () => {
    const runRepo = makeRunRepo();
    const tick = new TenantCronTick(
      async () => [{ id: 't1', timezone: 'Australia/Sydney' }],
      runRepo,
    );

    // 12:30Z = 22:30 Sydney — well past 18:00, still the same civil day.
    const groups = await tick.claimDue('job', 18, new Date('2026-06-15T12:30:00.000Z'));
    expect(groups).toHaveLength(1);
    expect(groups[0]?.todayCivil).toBe('2026-06-15');
  });
});
