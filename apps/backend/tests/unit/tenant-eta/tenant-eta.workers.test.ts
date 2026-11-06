import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Worker-level behaviour of the F06-2 jobs (tests 23/26/27/53): schedule
 * registration, the enabled-gate (a disabled feature spends no claim and lists no
 * plans), and the evaluate handler delegating job.data to the use case.
 */
const mockBoss = {
  work: vi.fn().mockResolvedValue(undefined),
  schedule: vi.fn().mockResolvedValue(undefined),
  unschedule: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue(undefined),
};
const prismaTenantFindMany = vi.fn().mockResolvedValue([]);

vi.mock('../../../src/shared/infrastructure/queue', () => ({
  getQueue: vi.fn().mockResolvedValue(mockBoss),
  resolvePgBossSchema: vi.fn().mockReturnValue('pgboss'),
  assertQueueDbConsistency: vi.fn(),
}));
vi.mock('../../../src/shared/infrastructure/prisma', () => ({
  prisma: {
    $executeRaw: vi.fn().mockResolvedValue(1),
    property: { findMany: vi.fn().mockResolvedValue([]) },
    tenant: { findMany: prismaTenantFindMany },
  },
}));

function makeLogger() {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(), child: vi.fn() };
}

async function register(opts: { enabled: boolean; sendMorning: any; evaluate: any; sweep: any }) {
  const { registerWorkers } = await import('../../../src/main/workers');
  const stub = () => ({ execute: vi.fn().mockResolvedValue({}) }) as any;
  await registerWorkers(
    stub(), stub(), stub(), { execute: vi.fn().mockResolvedValue({ delivered: 0, failed: 0, unchanged: 0, errors: 0 }) } as any,
    stub(), stub(), stub(), { execute: vi.fn().mockReturnValue({ daysRemaining: 90, level: 'OK' }) } as any,
    stub(), stub(), stub(), stub(), stub(), stub(), stub(), stub(), stub(), stub(), stub(),
    { deliver: vi.fn().mockResolvedValue(undefined) } as any, stub(), stub(), stub(), stub(),
    stub(), // publishDayPlansUseCase
    opts.sendMorning, opts.evaluate, opts.sweep,
    { get: vi.fn().mockResolvedValue({ enabled: opts.enabled, channelMode: 'BOTH', morningHour: 7, morningCutoffHour: 9, delayThresholdMinutes: 20, smsBudgetSharePercent: 80 }) } as any,
    makeLogger() as any,
  );
}

const handlerFor = (name: string): (job: any) => Promise<void> => {
  const call = mockBoss.work.mock.calls.find((c) => c[0] === name)!;
  return (call[2] ?? call[1]) as (job: any) => Promise<void>; // 3-arg (with options) or 2-arg form
};

describe('tenant-eta workers', () => {
  beforeEach(() => { vi.clearAllMocks(); prismaTenantFindMany.mockResolvedValue([]); });

  it('registers the three jobs with the expected schedules', async () => {
    await register({ enabled: true, sendMorning: { execute: vi.fn() }, evaluate: { execute: vi.fn() }, sweep: { execute: vi.fn() } });
    expect(mockBoss.schedule).toHaveBeenCalledWith('tenant-eta.morning', '0 * * * *', {}, { tz: 'Australia/Sydney' });
    expect(mockBoss.schedule).toHaveBeenCalledWith('tenant-eta.sweep-delays', '*/30 * * * *', {}, { tz: 'Australia/Sydney' });
    expect(mockBoss.work).toHaveBeenCalledWith('tenant-eta.evaluate', expect.any(Function));
    expect(mockBoss.work).toHaveBeenCalledWith('tenant-eta.sweep-delays', { teamSize: 1, teamConcurrency: 1 }, expect.any(Function));
  });

  it('the evaluate handler delegates job.data to the use case', async () => {
    const evaluate = { execute: vi.fn().mockResolvedValue(undefined) };
    await register({ enabled: true, sendMorning: { execute: vi.fn() }, evaluate, sweep: { execute: vi.fn() } });
    await handlerFor('tenant-eta.evaluate')({ id: 'j', data: { trigger: 'FINISH', appointmentId: 'a1' } });
    expect(evaluate.execute).toHaveBeenCalledWith({ trigger: 'FINISH', appointmentId: 'a1' });
  });

  it('the morning handler does not spend a claim when disabled (runDue not reached)', async () => {
    const sendMorning = { execute: vi.fn() };
    await register({ enabled: false, sendMorning, evaluate: { execute: vi.fn() }, sweep: { execute: vi.fn() } });
    await handlerFor('tenant-eta.morning')({ id: 'j', data: {} });
    expect(prismaTenantFindMany).not.toHaveBeenCalled();
    expect(sendMorning.execute).not.toHaveBeenCalled();
  });

  it('the morning handler reaches runDue when enabled', async () => {
    await register({ enabled: true, sendMorning: { execute: vi.fn() }, evaluate: { execute: vi.fn() }, sweep: { execute: vi.fn() } });
    await handlerFor('tenant-eta.morning')({ id: 'j', data: {} });
    expect(prismaTenantFindMany).toHaveBeenCalled(); // runDue listed active tenants
  });

  it('the sweep handler runs only when enabled', async () => {
    const disabledSweep = { execute: vi.fn() };
    await register({ enabled: false, sendMorning: { execute: vi.fn() }, evaluate: { execute: vi.fn() }, sweep: disabledSweep });
    await handlerFor('tenant-eta.sweep-delays')({ id: 'j', data: {} });
    expect(disabledSweep.execute).not.toHaveBeenCalled();

    vi.clearAllMocks();
    prismaTenantFindMany.mockResolvedValue([]);
    const enabledSweep = { execute: vi.fn().mockResolvedValue(undefined) };
    await register({ enabled: true, sendMorning: { execute: vi.fn() }, evaluate: { execute: vi.fn() }, sweep: enabledSweep });
    await handlerFor('tenant-eta.sweep-delays')({ id: 'j', data: {} });
    expect(enabledSweep.execute).toHaveBeenCalled();
  });
});
