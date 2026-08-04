import { describe, it, expect, vi } from 'vitest';
import { TenantCronTick, type ICronJobRunRepository } from '../../../src/shared/application/tenant-cron-tick';

function makeRunRepo(overrides: Partial<ICronJobRunRepository> = {}): ICronJobRunRepository {
  return {
    tryClaim: vi.fn().mockResolvedValue(true),
    releaseClaims: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
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

  it('falls back to the platform timezone for an unparseable tenant timezone', async () => {
    const tick = new TenantCronTick(
      async () => [{ id: 't1', timezone: 'Not/A_Zone' }],
      makeRunRepo(),
    );
    // 10:00Z = 20:00 Sydney → due at 18 under the platform fallback; must not throw.
    const groups = await tick.claimDue('job', 18, new Date('2026-06-15T10:00:00.000Z'));
    expect(groups[0]?.timezone).toBe('Australia/Sydney');
  });

  describe('runDue', () => {
    const now = new Date('2026-06-15T10:00:00.000Z'); // Sydney 20:00, Auckland 22:00

    it('releases the failed group claims, still runs the others, and rethrows', async () => {
      const runRepo = makeRunRepo();
      const tick = new TenantCronTick(
        async () => [
          { id: 'syd-1', timezone: 'Australia/Sydney' },
          { id: 'akl-1', timezone: 'Pacific/Auckland' },
        ],
        runRepo,
      );
      const ran: string[] = [];
      const runner = vi.fn().mockImplementation(async (group: { timezone: string }) => {
        ran.push(group.timezone);
        if (group.timezone === 'Australia/Sydney') throw new Error('db blip');
      });

      await expect(tick.runDue('job', 18, runner, now)).rejects.toThrow(/1\/2 timezone group/);

      // Both groups were attempted despite the first failure...
      expect(ran).toEqual(['Australia/Sydney', 'Pacific/Auckland']);
      // ...and only the failed group's claims were released for the retry.
      expect(runRepo.releaseClaims).toHaveBeenCalledTimes(1);
      expect(runRepo.releaseClaims).toHaveBeenCalledWith('job', ['syd-1'], '2026-06-15');
    });

    it('a pg-boss retry after a failure re-runs ONLY the released group', async () => {
      // Real claim-ledger semantics via an in-memory set.
      const claimed = new Set<string>();
      const runRepo: ICronJobRunRepository = {
        tryClaim: async (job, tenantId, localDate) => {
          const key = `${job}|${tenantId}|${localDate}`;
          if (claimed.has(key)) return false;
          claimed.add(key);
          return true;
        },
        releaseClaims: async (job, tenantIds, localDate) => {
          for (const id of tenantIds) claimed.delete(`${job}|${id}|${localDate}`);
        },
      };
      const tick = new TenantCronTick(
        async () => [
          { id: 'syd-1', timezone: 'Australia/Sydney' },
          { id: 'akl-1', timezone: 'Pacific/Auckland' },
        ],
        runRepo,
      );

      let sydneyFails = true;
      const runner = async (group: { timezone: string }) => {
        if (group.timezone === 'Australia/Sydney' && sydneyFails) throw new Error('db blip');
      };

      await expect(tick.runDue('job', 18, runner, now)).rejects.toThrow();

      // Retry: Sydney recovers; only Sydney is re-claimed and re-run.
      sydneyFails = false;
      const retryGroups = await tick.runDue('job', 18, runner, now);
      expect(retryGroups).toEqual([
        { timezone: 'Australia/Sydney', todayCivil: '2026-06-15', tenantIds: ['syd-1'] },
      ]);
    });

    it('keeps claims and returns the groups when every runner succeeds', async () => {
      const runRepo = makeRunRepo();
      const tick = new TenantCronTick(
        async () => [{ id: 'syd-1', timezone: 'Australia/Sydney' }],
        runRepo,
      );

      const groups = await tick.runDue('job', 18, async () => {}, now);

      expect(groups).toHaveLength(1);
      expect(runRepo.releaseClaims).not.toHaveBeenCalled();
    });
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
