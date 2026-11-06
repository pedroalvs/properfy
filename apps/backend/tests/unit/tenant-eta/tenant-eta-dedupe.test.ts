import { describe, it, expect, vi } from 'vitest';
import { EvaluateTenantEtaUseCase } from '../../../src/modules/tenant-eta/application/use-cases/evaluate-tenant-eta.use-case';
import { SweepTenantEtaDelaysUseCase } from '../../../src/modules/tenant-eta/application/use-cases/sweep-tenant-eta-delays.use-case';
import { TenantEtaNotifier } from '../../../src/modules/tenant-eta/application/tenant-eta-notifier.service';
import { CreateNotificationUseCase } from '../../../src/modules/notification/application/use-cases/create-notification.use-case';
import { BuildNotificationPayloadService } from '../../../src/modules/notification/domain/build-notification-payload.service';
import { AppointmentCodeFormatter } from '../../../src/modules/appointment/domain/appointment-code.formatter';
import {
  buildLoadedPlan, buildPlan, buildEvents, makeStop, makeAwr, makeTenant, makeFreshStop,
  makeNotificationRepo, makeNotification, makeLogger, SETTINGS, STOP_DEFS,
  DAY_PLAN_ID, INSPECTOR_ID, PLAN_DATE,
} from './fixtures';

const DONE_A = new Date('2026-11-04T21:55:00.000Z');
const NOW = new Date('2026-11-04T21:55:20.000Z');

// A done; C is next and already past its window (08:00–08:30) → projected late.
function lateCPlan() {
  const a = makeStop(STOP_DEFS.A);
  const c = makeStop(STOP_DEFS.C, { sequence: 2, travelS: 900, windowStartAt: new Date('2026-11-04T21:00:00.000Z'), windowEndAt: new Date('2026-11-04T21:30:00.000Z'), publishedServiceStartAt: new Date('2026-11-04T21:00:00.000Z'), serviceStartAt: new Date('2026-11-04T21:00:00.000Z') });
  return buildLoadedPlan({
    plan: buildPlan([a, c]),
    events: buildEvents({ executions: new Map([['appt-A', { startedAt: new Date('2026-11-04T21:00:00.000Z'), finishedAt: DONE_A }]]) }),
  });
}

function sharedSetup(loaded = lateCPlan()) {
  const repo = makeNotificationRepo();
  const createNotification = new CreateNotificationUseCase(repo as never, { findByTenantCodeChannel: vi.fn().mockResolvedValue(null), findAll: vi.fn(), upsert: vi.fn() } as never, { enqueue: vi.fn().mockResolvedValue(undefined) } as never);
  const notifier = new TenantEtaNotifier(createNotification, repo as never, new BuildNotificationPayloadService(), new AppointmentCodeFormatter(), 'x', { incrementTenantEtaNoticeCount: vi.fn() }, makeLogger() as never);

  const planReader = {
    findPlanByInspectorDate: vi.fn(async () => ({ dayPlanId: DAY_PLAN_ID, appointmentIds: loaded.plan.stops.map((s) => s.appointmentId) })),
    loadPlan: vi.fn(async () => loaded),
    listSweepCandidates: vi.fn(async () => [{ dayPlanId: DAY_PLAN_ID, inspectorId: INSPECTOR_ID, planDate: PLAN_DATE }]),
  };
  const getFreshStop = { execute: vi.fn(async () => makeFreshStop()) };
  const appointmentRepo = { findById: vi.fn(async (id: string) => makeAwr(id)), findScheduledOnDate: vi.fn() };
  const tenantRepo = { findById: vi.fn(async () => makeTenant()) };
  const noticeLog = { findMorningBands: vi.fn(async () => new Map()), countSmsCreatedSince: vi.fn(async () => 0) };
  const settingsReader = { get: vi.fn(async () => ({ ...SETTINGS })) };
  const jobQueue = { enqueue: vi.fn() };
  const clock = { now: vi.fn(() => NOW) };

  const evaluate = new EvaluateTenantEtaUseCase(planReader as never, getFreshStop as never, appointmentRepo as never, tenantRepo as never, notifier, noticeLog as never, settingsReader as never, jobQueue as never, makeLogger() as never, clock as never);
  const sweep = new SweepTenantEtaDelaysUseCase(planReader as never, getFreshStop as never, appointmentRepo as never, tenantRepo as never, notifier, noticeLog as never, settingsReader as never, makeLogger() as never, clock as never);
  return { repo, evaluate, sweep };
}

const cDelayRows = (repo: ReturnType<typeof makeNotificationRepo>) => [...repo.store.values()].filter((r) => r.appointmentId === 'appt-C' && r.templateCode === 'TENANT_ETA_DELAY');

describe('tenant-eta dedupe (01.A7)', () => {
  it('three triggers racing on the same late stop create exactly one DELAY per channel', async () => {
    const { repo, evaluate, sweep } = sharedSetup();
    await Promise.all([
      evaluate.execute({ trigger: 'FINISH', appointmentId: 'appt-A', tenantId: 'ag-syd', attempt: 1, occurredAt: DONE_A.toISOString() }),
      evaluate.execute({ trigger: 'LATE_NOTICE', appointmentId: 'appt-C', tenantId: 'ag-syd', attempt: 1, eventId: 'ev-1' }),
      sweep.execute(),
    ]);
    // C has a phone only → exactly one SMS DELAY row despite three triggers.
    expect(cDelayRows(repo)).toHaveLength(1);
    expect(cDelayRows(repo)[0]!.channel).toBe('SMS');
  });

  it('a DELAY row from before today\'s agency midnight does not block today\'s DELAY (day boundary)', async () => {
    const { repo, sweep } = sharedSetup();
    // Yesterday's DELAY (different scheduledDate → different id), created before Sydney midnight 2026-11-04T13:00Z.
    repo.store.set('yesterday', makeNotification({ appointmentId: 'appt-C', channel: 'SMS', templateCode: 'TENANT_ETA_DELAY', createdAt: new Date('2026-11-04T12:59:00.000Z') }));
    await sweep.execute();
    expect(cDelayRows(repo)).toHaveLength(2); // the stale yesterday row + a fresh one today
  });

  it('a DELAY already sent today blocks a second one', async () => {
    const { repo, sweep } = sharedSetup();
    repo.store.set('today', makeNotification({ appointmentId: 'appt-C', channel: 'SMS', templateCode: 'TENANT_ETA_DELAY', createdAt: new Date('2026-11-04T21:00:00.000Z') }));
    await sweep.execute();
    expect(cDelayRows(repo)).toHaveLength(1); // the existing today row; no new one
  });
});
