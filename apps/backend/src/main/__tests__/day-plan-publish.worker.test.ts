import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerDayPlanPublishWorker, DAY_PLAN_PUBLISH_JOB } from '../day-plan-publish.worker';
import type { DueTenantGroup } from '../../shared/application/tenant-cron-tick';

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(), child: vi.fn() };
}

function makeBoss() {
  return {
    schedule: vi.fn().mockResolvedValue(undefined),
    work: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    unschedule: vi.fn().mockResolvedValue(undefined),
  };
}

const emptyResult = {
  due: 0, published: 0, notified: 0, deferred: 0, skipped: 0, failed: 0, approximate: 0, infeasible: 0, durationMs: 0, continuation: false,
};

function makeDeps(over: Record<string, unknown> = {}) {
  return {
    tenantCronTick: { runDue: vi.fn().mockResolvedValue([]) },
    cronJobRunRepo: { hasClaim: vi.fn().mockResolvedValue(true), releaseClaims: vi.fn().mockResolvedValue(undefined) },
    publishDayPlans: { execute: vi.fn().mockResolvedValue(emptyResult) },
    logger: makeLogger(),
    ...over,
  };
}

function capturedHandler(boss: ReturnType<typeof makeBoss>) {
  const call = boss.work.mock.calls.find((c: unknown[]) => c[0] === DAY_PLAN_PUBLISH_JOB);
  return call![2] as (job: { id: string; data: Record<string, unknown> }) => Promise<void>;
}

describe('registerDayPlanPublishWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    delete process.env.DAY_PLAN_PUBLISH_ENABLED;
  });

  it("schedules '30 * * * *' in Sydney as a singleton and registers a size-1 worker", async () => {
    const boss = makeBoss();
    const registered = await registerDayPlanPublishWorker(boss as never, makeDeps() as never);

    expect(registered).toBe(true);
    expect(boss.schedule).toHaveBeenCalledWith(
      DAY_PLAN_PUBLISH_JOB,
      '30 * * * *',
      {},
      expect.objectContaining({ tz: 'Australia/Sydney', singletonKey: DAY_PLAN_PUBLISH_JOB, expireInMinutes: 30 }),
    );
    expect(boss.work).toHaveBeenCalledWith(
      DAY_PLAN_PUBLISH_JOB,
      { teamSize: 1, teamConcurrency: 1 },
      expect.any(Function),
    );
  });

  it('unschedules and does not register when DAY_PLAN_PUBLISH_ENABLED=false', async () => {
    process.env.DAY_PLAN_PUBLISH_ENABLED = 'false';
    const boss = makeBoss();
    const registered = await registerDayPlanPublishWorker(boss as never, makeDeps() as never);

    expect(registered).toBe(false);
    expect(boss.unschedule).toHaveBeenCalledWith(DAY_PLAN_PUBLISH_JOB);
    expect(boss.schedule).not.toHaveBeenCalled();
    expect(boss.work).not.toHaveBeenCalled();
  });

  it('runs runDue at hour 19 and then publishes the due set', async () => {
    const boss = makeBoss();
    const deps = makeDeps();
    await registerDayPlanPublishWorker(boss as never, deps as never);

    await capturedHandler(boss)({ id: 'j1', data: {} });

    expect(deps.tenantCronTick.runDue).toHaveBeenCalledWith(DAY_PLAN_PUBLISH_JOB, 19, expect.any(Function));
    expect(deps.publishDayPlans.execute).toHaveBeenCalledWith({ attempt: 1, budgetMs: 25 * 60_000 });
  });

  it('keeps tenants whose T-1 ran and releases the day-plan.publish claim of those it has not', async () => {
    const boss = makeBoss();
    const group: DueTenantGroup = { timezone: 'Australia/Sydney', todayCivil: '2026-11-04', tenantIds: ['ag-syd', 'ag-adl'] };
    const deps = makeDeps({
      tenantCronTick: { runDue: vi.fn().mockImplementation(async (_job, _hour, runner) => { await runner(group); return [group]; }) },
      // ag-syd ran its 19:00 T-1; ag-adl (Adelaide half-hour tick) has not yet → released.
      cronJobRunRepo: { hasClaim: vi.fn().mockImplementation(async (_j, tenantId: string) => tenantId === 'ag-syd'), releaseClaims: vi.fn().mockResolvedValue(undefined) },
    });
    await registerDayPlanPublishWorker(boss as never, deps as never);

    await capturedHandler(boss)({ id: 'j1', data: {} });

    expect(deps.cronJobRunRepo.hasClaim).toHaveBeenCalledWith('appointment.reject-unconfirmed', 'ag-syd', '2026-11-04');
    expect(deps.cronJobRunRepo.hasClaim).toHaveBeenCalledWith('appointment.reject-unconfirmed', 'ag-adl', '2026-11-04');
    expect(deps.cronJobRunRepo.releaseClaims).toHaveBeenCalledWith(DAY_PLAN_PUBLISH_JOB, ['ag-adl'], '2026-11-04');
  });

  it('does not release anything when every tenant has run its T-1', async () => {
    const boss = makeBoss();
    const group: DueTenantGroup = { timezone: 'Australia/Sydney', todayCivil: '2026-11-04', tenantIds: ['ag-syd'] };
    const deps = makeDeps({
      tenantCronTick: { runDue: vi.fn().mockImplementation(async (_j, _h, runner) => { await runner(group); return [group]; }) },
    });
    await registerDayPlanPublishWorker(boss as never, deps as never);

    await capturedHandler(boss)({ id: 'j1', data: {} });

    expect(deps.cronJobRunRepo.releaseClaims).not.toHaveBeenCalled();
  });

  it('enqueues a singleton continuation with attempt + 1 when the batch defers', async () => {
    const boss = makeBoss();
    const deps = makeDeps({
      publishDayPlans: { execute: vi.fn().mockResolvedValue({ ...emptyResult, continuation: true }) },
    });
    await registerDayPlanPublishWorker(boss as never, deps as never);

    await capturedHandler(boss)({ id: 'j1', data: { attempt: 2 } });

    expect(deps.publishDayPlans.execute).toHaveBeenCalledWith({ attempt: 2, budgetMs: 25 * 60_000 });
    expect(boss.send).toHaveBeenCalledWith(
      DAY_PLAN_PUBLISH_JOB,
      { attempt: 3 },
      { singletonKey: DAY_PLAN_PUBLISH_JOB, startAfter: 120, expireInMinutes: 30 },
    );
  });

  it('does not enqueue a continuation when the batch completes', async () => {
    const boss = makeBoss();
    const deps = makeDeps();
    await registerDayPlanPublishWorker(boss as never, deps as never);

    await capturedHandler(boss)({ id: 'j1', data: {} });

    expect(boss.send).not.toHaveBeenCalled();
  });
});
