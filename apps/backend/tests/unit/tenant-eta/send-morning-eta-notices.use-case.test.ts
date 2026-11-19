import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SendMorningEtaNoticesUseCase } from '../../../src/modules/tenant-eta/application/use-cases/send-morning-eta-notices.use-case';
import { TenantEtaNotifier } from '../../../src/modules/tenant-eta/application/tenant-eta-notifier.service';
import { CreateNotificationUseCase } from '../../../src/modules/notification/application/use-cases/create-notification.use-case';
import { BuildNotificationPayloadService } from '../../../src/modules/notification/domain/build-notification-payload.service';
import { AppointmentCodeFormatter } from '../../../src/modules/appointment/domain/appointment-code.formatter';
import {
  buildLoadedPlan, buildPlan, buildEvents, makeStop, makeAwr, makeTenant, makeFreshStop,
  makeNotificationRepo, makeNotification, makeLogger, SETTINGS, STOP_DEFS,
  TENANT_ID, INSPECTOR_ID, DAY_PLAN_ID, PLAN_DATE, TZ, NOW_0700,
} from './fixtures';
import type { DueTenantGroup } from '../../../src/shared/application/tenant-cron-tick';

const GROUP: DueTenantGroup = { timezone: TZ, todayCivil: PLAN_DATE, tenantIds: [TENANT_ID] };

function harness(opts: {
  loaded?: ReturnType<typeof buildLoadedPlan>;
  appointmentIds?: string[];
  freshStop?: (appointmentId: string) => unknown;
  nowSeq?: Date[];
  settings?: Record<string, unknown>;
} = {}) {
  const repo = makeNotificationRepo();
  const templateRepo = { findByTenantCodeChannel: vi.fn().mockResolvedValue(null), findAll: vi.fn(), upsert: vi.fn() };
  const jobQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const createNotification = new CreateNotificationUseCase(repo as never, templateRepo as never, jobQueue as never);
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
  const getFreshStop = { execute: vi.fn(async ({ appointmentId }: { appointmentId: string }) => (opts.freshStop ? opts.freshStop(appointmentId) : makeFreshStop())) };
  const appointmentRepo = {
    findScheduledOnDate: vi.fn(async () => loaded.plan.stops.map((s) => makeAwr(s.appointmentId))),
    findById: vi.fn(async (id: string) => makeAwr(id)),
  };
  const tenantRepo = { findById: vi.fn(async () => makeTenant()) };
  const settingsReader = { get: vi.fn(async () => ({ ...SETTINGS, ...(opts.settings ?? {}) })) };

  const seq = opts.nowSeq ? [...opts.nowSeq] : null;
  const clock = { now: vi.fn(() => (seq && seq.length > 1 ? seq.shift()! : seq ? seq[0]! : NOW_0700)) };

  const useCase = new SendMorningEtaNoticesUseCase(
    planReader as never, getFreshStop as never, appointmentRepo as never, tenantRepo as never,
    notifier, settingsReader as never, logger as never, clock as never,
  );
  return { useCase, repo, logger, metrics, planReader, getFreshStop, appointmentRepo, notifier, clock };
}

const rows = (repo: ReturnType<typeof makeNotificationRepo>) => [...repo.store.values()];
const etaRows = (repo: ReturnType<typeof makeNotificationRepo>) => rows(repo).filter((r) => r.templateCode.startsWith('TENANT_ETA_'));
const logArg = (logger: ReturnType<typeof makeLogger>, event: string) => logger.info.mock.calls.find((c) => c[1] === event)?.[0];

describe('SendMorningEtaNoticesUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  // 11
  it('sends MORNING for A/B/C with the exact bands and logs morning_completed', async () => {
    const { useCase, repo, logger } = harness();
    await useCase.execute(GROUP);
    const all = etaRows(repo);
    expect(all).toHaveLength(5); // A 2, B 2, C 1 (phone only)
    const byAppt = (id: string) => all.filter((r) => r.appointmentId === id);
    expect(byAppt('appt-A')).toHaveLength(2);
    expect(byAppt('appt-B')).toHaveLength(2);
    expect(byAppt('appt-C')).toHaveLength(1);
    expect(all.every((r) => r.templateCode === 'TENANT_ETA_MORNING')).toBe(true);
    expect(byAppt('appt-A')[0]!.payloadJson['etaFrom']).toBe('8:00 am');
    expect(byAppt('appt-A')[0]!.payloadJson['etaTo']).toBe('8:30 am');
    expect(byAppt('appt-B')[0]!.payloadJson['etaFrom']).toBe('9:00 am');
    expect(byAppt('appt-C')[0]!.payloadJson['etaFrom']).toBe('10:00 am');
    expect(byAppt('appt-C')[0]!.payloadJson['etaTo']).toBe('10:55 am');
    expect(logArg(logger, 'tenant_eta.morning_completed')).toEqual({ stops: 3, created: 5, skipped: 0 });
  });

  // 12
  it('sends nothing at/after the 09:00 cutoff and logs morning_skipped_after_cutoff', async () => {
    const nineAm = new Date('2026-11-04T22:00:00.000Z'); // 09:00 Sydney
    const { useCase, repo, logger } = harness({ nowSeq: [nineAm] });
    await useCase.execute(GROUP);
    expect(etaRows(repo)).toHaveLength(0);
    expect(logArg(logger, 'tenant_eta.morning_skipped_after_cutoff')).toMatchObject({ localTime: '09:00' });
  });

  // 13
  it('skips the rest of the batch when the cutoff is crossed mid-run', async () => {
    const before = new Date('2026-11-04T21:59:59.000Z'); // 08:59:59
    const after = new Date('2026-11-04T22:00:00.000Z'); // 09:00:00
    // calls: start(before), before A(before), before B(after), before C(after)
    const { useCase, repo } = harness({ nowSeq: [before, before, after, after] });
    await useCase.execute(GROUP);
    const all = etaRows(repo);
    expect(all.every((r) => r.appointmentId === 'appt-A')).toBe(true);
    expect(all).toHaveLength(2);
  });

  // 14
  it('skips a stop already started (STARTED)', async () => {
    const loaded = buildLoadedPlan({ events: buildEvents({ executions: new Map([['appt-A', { startedAt: new Date('2026-11-04T20:55:00.000Z'), finishedAt: null }]]) }) });
    const { useCase, repo } = harness({ loaded });
    await useCase.execute(GROUP);
    expect(etaRows(repo).some((r) => r.appointmentId === 'appt-A')).toBe(false);
    expect(etaRows(repo).some((r) => r.appointmentId === 'appt-B')).toBe(true);
  });

  // 15
  it('skips a stop whose window already passed (WINDOW_PASSED)', async () => {
    const past = makeStop({ ...STOP_DEFS.A, id: 'appt-past' }, { windowStartAt: new Date('2026-11-04T18:30:00.000Z'), windowEndAt: new Date('2026-11-04T19:30:00.000Z'), publishedServiceStartAt: new Date('2026-11-04T18:30:00.000Z'), serviceStartAt: new Date('2026-11-04T18:30:00.000Z') });
    const loaded = buildLoadedPlan({ plan: buildPlan([past]) });
    const { useCase, repo, logger } = harness({ loaded });
    await useCase.execute(GROUP);
    expect(etaRows(repo)).toHaveLength(0);
    expect(logger.info.mock.calls.some((c) => c[1] === 'tenant_eta.notice_skipped' && c[0].reason === 'WINDOW_PASSED')).toBe(true);
  });

  // 16
  it('logs NO_PLAN / PLAN_STALE and sends nothing', async () => {
    const noPlan = harness();
    noPlan.planReader.findPlanByInspectorDate.mockResolvedValue(null);
    await noPlan.useCase.execute(GROUP);
    expect(etaRows(noPlan.repo)).toHaveLength(0);
    expect(noPlan.logger.info.mock.calls.some((c) => c[1] === 'tenant_eta.notice_skipped' && c[0].reason === 'NO_PLAN')).toBe(true);

    const stale = harness({ freshStop: () => makeFreshStop({ status: 'STALE' }) });
    await stale.useCase.execute(GROUP);
    expect(etaRows(stale.repo)).toHaveLength(0);
    expect(stale.logger.info.mock.calls.some((c) => c[1] === 'tenant_eta.notice_skipped' && c[0].reason === 'PLAN_STALE')).toBe(true);
  });

  // 16b
  it('does not skip the inspector when the first seed appointment left the plan', async () => {
    let n = 0;
    const { useCase, repo } = harness({ freshStop: () => (n++ === 0 ? null : makeFreshStop()) });
    await useCase.execute(GROUP);
    expect(etaRows(repo)).toHaveLength(5);
  });

  // 17
  it('sends normally for an approximate plan', async () => {
    const loaded = buildLoadedPlan({ plan: buildPlan(undefined, { approximate: true }) });
    const { useCase, repo } = harness({ loaded });
    await useCase.execute(GROUP);
    expect(etaRows(repo)).toHaveLength(5);
    expect(etaRows(repo)[0]!.payloadJson['approximate']).toBe('true');
  });

  // 18
  it('sends DELAY (not MORNING) for a stop already projected late in the morning', async () => {
    const lateC = makeStop(STOP_DEFS.C, {
      windowStartAt: new Date('2026-11-04T23:00:00.000Z'), windowEndAt: new Date('2026-11-04T23:30:00.000Z'), // 10:00-10:30
      publishedServiceStartAt: new Date('2026-11-04T23:00:00.000Z'), serviceStartAt: new Date('2026-11-04T23:00:00.000Z'),
    });
    const plan = buildPlan([lateC], { departureAt: new Date('2026-11-04T23:30:00.000Z') }); // depart 10:30 + 25min travel → 10:55
    const loaded = buildLoadedPlan({ plan });
    const { useCase, repo } = harness({ loaded, appointmentIds: ['appt-C'] });
    await useCase.execute(GROUP);
    const all = etaRows(repo);
    expect(all).toHaveLength(1);
    expect(all[0]!.templateCode).toBe('TENANT_ETA_DELAY');
    expect(all[0]!.payloadJson['etaFrom']).toBe('10:25 am');
    expect(all[0]!.payloadJson['etaTo']).toBe('11:25 am');
  });

  // 19
  it('sends neither MORNING nor DELAY when a DELAY was already sent today', async () => {
    const { useCase, repo } = harness();
    // pre-seed a DELAY for C today (after Sydney midnight 2026-11-04T13:00Z).
    repo.store.set('pre', makeNotification({ appointmentId: 'appt-C', channel: 'SMS', templateCode: 'TENANT_ETA_DELAY', createdAt: new Date('2026-11-04T19:00:00.000Z') }));
    await useCase.execute(GROUP);
    expect(etaRows(repo).some((r) => r.appointmentId === 'appt-C' && r.templateCode === 'TENANT_ETA_MORNING')).toBe(false);
  });

  // 20
  it('is idempotent across a group re-run', async () => {
    const { useCase, repo } = harness();
    await useCase.execute(GROUP);
    await useCase.execute(GROUP);
    expect(etaRows(repo)).toHaveLength(5);
  });

  // Failure isolation + retry: a per-inspector throw is logged and rethrown so the
  // TenantCronTick claim releases and the group retries (dedupe-safe).
  it('rethrows a per-inspector failure so the group is retried', async () => {
    const h = harness();
    h.getFreshStop.execute.mockRejectedValue(new Error('boom'));
    await expect(h.useCase.execute(GROUP)).rejects.toBeInstanceOf(AggregateError);
    expect(h.logger.error.mock.calls.some((c) => c[1] === 'tenant_eta.morning_inspector_failed')).toBe(true);
  });

  // 20b
  it('skips an unavailable tenant but keeps the others (L-F06-02)', async () => {
    const loaded = buildLoadedPlan();
    loaded.stopMeta.set('appt-B', { rentalTenantConfirmationStatus: 'UNAVAILABLE', keyRequired: true, requiresRentalTenantConfirmation: true });
    const { useCase, repo } = harness({ loaded });
    await useCase.execute(GROUP);
    const all = etaRows(repo);
    expect(all.some((r) => r.appointmentId === 'appt-B')).toBe(false);
    expect(all.filter((r) => r.appointmentId === 'appt-A')).toHaveLength(2);
    expect(all.filter((r) => r.appointmentId === 'appt-C')).toHaveLength(1);
  });

  // 21
  it('only notifies the group\'s own agencies (D9 projection, per-agency send)', async () => {
    // B belongs to another agency; the Sydney group must not notify it.
    const loaded = buildLoadedPlan();
    const otherB = { ...loaded.plan.stops[1]!, tenantId: 'ag-perth' };
    loaded.plan.stops[1] = otherB;
    loaded.stopMeta.set('appt-B', { rentalTenantConfirmationStatus: 'CONFIRMED', keyRequired: false, requiresRentalTenantConfirmation: true });
    const { useCase, repo } = harness({ loaded });
    await useCase.execute(GROUP);
    expect(etaRows(repo).some((r) => r.appointmentId === 'appt-B')).toBe(false);
    expect(etaRows(repo).some((r) => r.appointmentId === 'appt-A')).toBe(true);
  });
});
