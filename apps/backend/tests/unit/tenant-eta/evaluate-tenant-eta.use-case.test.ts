import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvaluateTenantEtaUseCase, type EvaluateTenantEtaJob } from '../../../src/modules/tenant-eta/application/use-cases/evaluate-tenant-eta.use-case';
import { TenantEtaNotifier } from '../../../src/modules/tenant-eta/application/tenant-eta-notifier.service';
import { CreateNotificationUseCase } from '../../../src/modules/notification/application/use-cases/create-notification.use-case';
import { BuildNotificationPayloadService } from '../../../src/modules/notification/domain/build-notification-payload.service';
import { AppointmentCodeFormatter } from '../../../src/modules/appointment/domain/appointment-code.formatter';
import {
  buildLoadedPlan, buildPlan, buildEvents, makeStop, makeAwr, makeAppointment, makeTenant, makeFreshStop,
  makeNotificationRepo, makeNotification, makeLogger, SETTINGS, STOP_DEFS,
  TENANT_ID, INSPECTOR_ID, DAY_PLAN_ID, PLAN_DATE,
} from './fixtures';

const DONE_A_AT = new Date('2026-11-04T21:55:00.000Z'); // A finished 08:55 Sydney
const NOW_085520 = new Date('2026-11-04T21:55:20.000Z');
const NOW_0820 = new Date('2026-11-04T21:20:00.000Z'); // 08:20 Sydney

function harness(opts: {
  loaded?: ReturnType<typeof buildLoadedPlan>;
  appointmentIds?: string[];
  now?: Date;
  freshStop?: unknown;
  morningBands?: Map<string, Date>;
  jobApptScheduledDate?: Date;
} = {}) {
  const repo = makeNotificationRepo();
  const templateRepo = { findByTenantCodeChannel: vi.fn().mockResolvedValue(null), findAll: vi.fn(), upsert: vi.fn() };
  const jobQueueForCreate = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const createNotification = new CreateNotificationUseCase(repo as never, templateRepo as never, jobQueueForCreate as never);
  const metrics = { incrementTenantEtaNoticeCount: vi.fn() };
  const logger = makeLogger();
  const notifier = new TenantEtaNotifier(createNotification, repo as never, new BuildNotificationPayloadService(), new AppointmentCodeFormatter(), 'https://app.properfy.me', metrics, logger as never);

  const loaded = opts.loaded ?? buildLoadedPlan();
  const appointmentIds = opts.appointmentIds ?? loaded.plan.stops.map((s) => s.appointmentId);
  const planReader = {
    findPlanByInspectorDate: vi.fn(async () => ({ dayPlanId: DAY_PLAN_ID, appointmentIds })),
    loadPlan: vi.fn(async () => loaded),
    listSweepCandidates: vi.fn(),
  };
  const getFreshStop = { execute: vi.fn(async () => (opts.freshStop !== undefined ? opts.freshStop : makeFreshStop())) };
  const appointmentRepo = {
    findById: vi.fn(async (id: string) => {
      const base = makeAwr(id) as { appointment: ReturnType<typeof makeAppointment> };
      if (opts.jobApptScheduledDate) {
        return { ...base, appointment: makeAppointment(id, { scheduledDate: opts.jobApptScheduledDate }) };
      }
      return base;
    }),
    findScheduledOnDate: vi.fn(),
  };
  const tenantRepo = { findById: vi.fn(async () => makeTenant()) };
  const noticeLog = {
    findMorningBands: vi.fn(async () => opts.morningBands ?? new Map<string, Date>()),
    countSmsCreatedSince: vi.fn(async () => 0),
  };
  const settingsReader = { get: vi.fn(async () => ({ ...SETTINGS })) };
  const jobQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const clock = { now: vi.fn(() => opts.now ?? NOW_085520) };

  const useCase = new EvaluateTenantEtaUseCase(
    planReader as never, getFreshStop as never, appointmentRepo as never, tenantRepo as never,
    notifier, noticeLog as never, settingsReader as never, jobQueue as never, logger as never, clock as never,
  );
  return { useCase, repo, jobQueue, logger, noticeLog, getFreshStop };
}

const etaRows = (repo: ReturnType<typeof makeNotificationRepo>) => [...repo.store.values()].filter((r) => r.templateCode.startsWith('TENANT_ETA_'));
const byAppt = (repo: ReturnType<typeof makeNotificationRepo>, id: string) => etaRows(repo).filter((r) => r.appointmentId === id);
const hasSkip = (logger: ReturnType<typeof makeLogger>, reason: string) => logger.info.mock.calls.some((c) => c[0]?.reason === reason);

const job = (o: Partial<EvaluateTenantEtaJob> & Pick<EvaluateTenantEtaJob, 'trigger' | 'appointmentId'>): EvaluateTenantEtaJob => ({ tenantId: TENANT_ID, attempt: 1, ...o });

const doneA = () => buildEvents({ executions: new Map([['appt-A', { startedAt: new Date('2026-11-04T21:00:00.000Z'), finishedAt: DONE_A_AT }]]) });

describe('EvaluateTenantEtaUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  // 30
  it('FINISH: sends ON_THE_WAY to the next stop (E2)', async () => {
    const { useCase, repo } = harness({ loaded: buildLoadedPlan({ events: doneA() }), now: NOW_085520 });
    await useCase.execute(job({ trigger: 'FINISH', appointmentId: 'appt-A', occurredAt: DONE_A_AT.toISOString() }));
    expect(byAppt(repo, 'appt-B')).toHaveLength(2);
    expect(byAppt(repo, 'appt-B')[0]!.templateCode).toBe('TENANT_ETA_ON_THE_WAY');
    expect(byAppt(repo, 'appt-B')[0]!.payloadJson['etaFrom']).toBe('9:00 am');
    expect(byAppt(repo, 'appt-B')[0]!.payloadJson['etaTo']).toBe('9:40 am');
    expect(byAppt(repo, 'appt-C')).toHaveLength(0);
  });

  // 31
  it('FINISH: skips when the next stop already started (NEXT_STARTED)', async () => {
    const events = buildEvents({ executions: new Map([
      ['appt-A', { startedAt: new Date('2026-11-04T21:00:00.000Z'), finishedAt: DONE_A_AT }],
      ['appt-B', { startedAt: new Date('2026-11-04T21:50:00.000Z'), finishedAt: null }],
    ]) });
    const { useCase, repo, logger } = harness({ loaded: buildLoadedPlan({ events }), now: NOW_085520 });
    await useCase.execute(job({ trigger: 'FINISH', appointmentId: 'appt-A', occurredAt: DONE_A_AT.toISOString() }));
    expect(byAppt(repo, 'appt-B')).toHaveLength(0);
    expect(hasSkip(logger, 'NEXT_STARTED')).toBe(true);
  });

  // 32
  it('FINISH: when the immediate next left the plan, the following in-plan stop is next', async () => {
    const plan = buildPlan([makeStop(STOP_DEFS.A), makeStop(STOP_DEFS.C, { sequence: 2, travelS: 900, windowStartAt: new Date('2026-11-04T22:00:00.000Z'), windowEndAt: new Date('2026-11-05T01:00:00.000Z') })]);
    const loaded = buildLoadedPlan({ plan, events: doneA() });
    const { useCase, repo } = harness({ loaded, appointmentIds: ['appt-A', 'appt-C'], now: NOW_085520 });
    await useCase.execute(job({ trigger: 'FINISH', appointmentId: 'appt-A', occurredAt: DONE_A_AT.toISOString() }));
    expect(byAppt(repo, 'appt-C').length).toBeGreaterThan(0);
    expect(byAppt(repo, 'appt-C')[0]!.templateCode).toBe('TENANT_ETA_ON_THE_WAY');
  });

  // 33
  it('FINISH: last stop → NO_NEXT_STOP', async () => {
    const plan = buildPlan([makeStop(STOP_DEFS.A)]);
    const events = buildEvents({ executions: new Map([['appt-A', { startedAt: new Date('2026-11-04T21:00:00.000Z'), finishedAt: DONE_A_AT }]]) });
    const { useCase, repo, logger } = harness({ loaded: buildLoadedPlan({ plan, events }), appointmentIds: ['appt-A'], now: NOW_085520 });
    await useCase.execute(job({ trigger: 'FINISH', appointmentId: 'appt-A', occurredAt: DONE_A_AT.toISOString() }));
    expect(etaRows(repo)).toHaveLength(0);
    expect(hasSkip(logger, 'NO_NEXT_STOP')).toBe(true);
  });

  // 34
  it('skips when the appointment is not today (NOT_TODAY)', async () => {
    const { useCase, repo, logger } = harness({ loaded: buildLoadedPlan({ events: doneA() }), now: NOW_085520, jobApptScheduledDate: new Date('2026-11-04T00:00:00.000Z') });
    await useCase.execute(job({ trigger: 'FINISH', appointmentId: 'appt-A', occurredAt: DONE_A_AT.toISOString() }));
    expect(etaRows(repo)).toHaveLength(0);
    expect(hasSkip(logger, 'NOT_TODAY')).toBe(true);
  });

  // 35
  it('STALE: re-enqueues with the next attempt, then gives up at attempt 3', async () => {
    const retry = harness({ freshStop: makeFreshStop({ status: 'STALE' }), now: NOW_085520 });
    await retry.useCase.execute(job({ trigger: 'FINISH', appointmentId: 'appt-A', occurredAt: DONE_A_AT.toISOString(), attempt: 1 }));
    expect(retry.jobQueue.enqueue).toHaveBeenCalledWith('tenant-eta.evaluate', expect.objectContaining({ attempt: 2 }), expect.objectContaining({ startAfter: expect.any(Date) }));

    const giveUp = harness({ freshStop: makeFreshStop({ status: 'STALE' }), now: NOW_085520 });
    await giveUp.useCase.execute(job({ trigger: 'FINISH', appointmentId: 'appt-A', occurredAt: DONE_A_AT.toISOString(), attempt: 3 }));
    expect(giveUp.jobQueue.enqueue).not.toHaveBeenCalled();
    expect(giveUp.logger.info.mock.calls.some((c) => c[1] === 'tenant_eta.evaluate_gave_up')).toBe(true);
  });

  // 36 / 37 — next stop late
  it('FINISH: a late next stop with no DELAY today gets DELAY; with a DELAY already sent gets ON_THE_WAY (D5)', async () => {
    // Make B late: A done 08:55 but B window is 08:00-08:30 (already past) so B projects late.
    const lateB = makeStop(STOP_DEFS.B, { windowStartAt: new Date('2026-11-04T21:00:00.000Z'), windowEndAt: new Date('2026-11-04T21:30:00.000Z'), publishedServiceStartAt: new Date('2026-11-04T21:00:00.000Z'), serviceStartAt: new Date('2026-11-04T21:00:00.000Z') });
    const plan = buildPlan([makeStop(STOP_DEFS.A), lateB]);
    const first = harness({ loaded: buildLoadedPlan({ plan, events: doneA() }), appointmentIds: ['appt-A', 'appt-B'], now: NOW_085520 });
    await first.useCase.execute(job({ trigger: 'FINISH', appointmentId: 'appt-A', occurredAt: DONE_A_AT.toISOString() }));
    expect(byAppt(first.repo, 'appt-B')[0]!.templateCode).toBe('TENANT_ETA_DELAY');

    const second = harness({ loaded: buildLoadedPlan({ plan, events: doneA() }), appointmentIds: ['appt-A', 'appt-B'], now: NOW_085520 });
    second.repo.store.set('pre', makeNotification({ appointmentId: 'appt-B', channel: 'SMS', templateCode: 'TENANT_ETA_DELAY', createdAt: new Date('2026-11-04T21:40:00.000Z') }));
    await second.useCase.execute(job({ trigger: 'FINISH', appointmentId: 'appt-A', occurredAt: DONE_A_AT.toISOString() }));
    expect(byAppt(second.repo, 'appt-B').some((r) => r.templateCode === 'TENANT_ETA_ON_THE_WAY')).toBe(true);
  });

  // 43b
  it('CANT_DO: notifies the first pending stop (the rejected one already left the plan)', async () => {
    const plan = buildPlan([makeStop(STOP_DEFS.A), makeStop(STOP_DEFS.C, { sequence: 2, travelS: 900, windowStartAt: new Date('2026-11-04T22:00:00.000Z'), windowEndAt: new Date('2026-11-05T01:00:00.000Z') })]);
    const { useCase, repo } = harness({ loaded: buildLoadedPlan({ plan, events: doneA() }), appointmentIds: ['appt-A', 'appt-C'], now: NOW_085520 });
    await useCase.execute(job({ trigger: 'CANT_DO', appointmentId: 'appt-REJECTED', inspectorId: INSPECTOR_ID, occurredAt: DONE_A_AT.toISOString() }));
    expect(byAppt(repo, 'appt-C')[0]!.templateCode).toBe('TENANT_ETA_ON_THE_WAY');
  });

  // 43d
  it('CANT_DO: INSPECTOR_BUSY when another stop is in progress', async () => {
    const events = buildEvents({ executions: new Map([['appt-A', { startedAt: new Date('2026-11-04T21:00:00.000Z'), finishedAt: null }]]) });
    const { useCase, repo, logger } = harness({ loaded: buildLoadedPlan({ events }), now: NOW_085520 });
    await useCase.execute(job({ trigger: 'CANT_DO', appointmentId: 'appt-REJECTED', inspectorId: INSPECTOR_ID, occurredAt: DONE_A_AT.toISOString() }));
    expect(etaRows(repo)).toHaveLength(0);
    expect(hasSkip(logger, 'INSPECTOR_BUSY')).toBe(true);
  });

  // 43e
  it('CANT_DO: NO_NEXT_STOP when nothing is pending', async () => {
    const plan = buildPlan([makeStop(STOP_DEFS.A)]);
    const events = buildEvents({ executions: new Map([['appt-A', { startedAt: new Date('2026-11-04T21:00:00.000Z'), finishedAt: DONE_A_AT }]]) });
    const { useCase, repo, logger } = harness({ loaded: buildLoadedPlan({ plan, events }), appointmentIds: ['appt-A'], now: NOW_085520 });
    await useCase.execute(job({ trigger: 'CANT_DO', appointmentId: 'appt-REJECTED', inspectorId: INSPECTOR_ID, occurredAt: DONE_A_AT.toISOString() }));
    expect(etaRows(repo)).toHaveLength(0);
    expect(hasSkip(logger, 'NO_NEXT_STOP')).toBe(true);
  });

  // 40 — LATE_NOTICE E4b
  it('LATE_NOTICE: a 60-minute floor on B pushes C past its window → DELAY for C', async () => {
    const events = buildEvents({
      executions: new Map([['appt-A', { startedAt: new Date('2026-11-04T21:00:00.000Z'), finishedAt: null }]]),
      lateNotices: new Map([['appt-B', { minutesLate: 60, createdAt: NOW_0820, clientOccurredAt: null }]]),
    });
    const { useCase, repo } = harness({ loaded: buildLoadedPlan({ events }), now: NOW_0820 });
    await useCase.execute(job({ trigger: 'LATE_NOTICE', appointmentId: 'appt-B', eventId: 'ev-1' }));
    expect(byAppt(repo, 'appt-C')[0]!.templateCode).toBe('TENANT_ETA_DELAY');
    expect(byAppt(repo, 'appt-B')).toHaveLength(0);
  });

  // 41 — LATE_NOTICE 30 min → nothing
  it('LATE_NOTICE: a 30-minute floor keeps C within the window → nothing', async () => {
    const events = buildEvents({
      executions: new Map([['appt-A', { startedAt: new Date('2026-11-04T21:00:00.000Z'), finishedAt: null }]]),
      lateNotices: new Map([['appt-B', { minutesLate: 30, createdAt: NOW_0820, clientOccurredAt: null }]]),
    });
    const { useCase, repo } = harness({ loaded: buildLoadedPlan({ events }), now: NOW_0820 });
    await useCase.execute(job({ trigger: 'LATE_NOTICE', appointmentId: 'appt-B', eventId: 'ev-2' }));
    expect(etaRows(repo)).toHaveLength(0);
  });

  // disabled → nothing (and never touches the plan reader)
  it('does nothing when the setting is disabled', async () => {
    const repo = makeNotificationRepo();
    const createNotification = new CreateNotificationUseCase(repo as never, { findByTenantCodeChannel: vi.fn().mockResolvedValue(null), findAll: vi.fn(), upsert: vi.fn() } as never, { enqueue: vi.fn() } as never);
    const notifier = new TenantEtaNotifier(createNotification, repo as never, new BuildNotificationPayloadService(), new AppointmentCodeFormatter(), 'x', { incrementTenantEtaNoticeCount: vi.fn() }, makeLogger() as never);
    const findPlanByInspectorDate = vi.fn();
    const useCase = new EvaluateTenantEtaUseCase(
      { findPlanByInspectorDate, loadPlan: vi.fn(), listSweepCandidates: vi.fn() } as never,
      { execute: vi.fn() } as never,
      { findById: vi.fn(), findScheduledOnDate: vi.fn() } as never,
      { findById: vi.fn() } as never,
      notifier,
      { findMorningBands: vi.fn(), countSmsCreatedSince: vi.fn() } as never,
      { get: vi.fn(async () => ({ ...SETTINGS, enabled: false })) } as never,
      { enqueue: vi.fn() } as never, makeLogger() as never, { now: vi.fn(() => NOW_085520) } as never,
    );
    await useCase.execute(job({ trigger: 'FINISH', appointmentId: 'appt-A' }));
    expect(etaRows(repo)).toHaveLength(0);
    expect(findPlanByInspectorDate).not.toHaveBeenCalled();
  });
});
