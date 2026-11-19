import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SweepTenantEtaDelaysUseCase } from '../../../src/modules/tenant-eta/application/use-cases/sweep-tenant-eta-delays.use-case';
import { TenantEtaNotifier } from '../../../src/modules/tenant-eta/application/tenant-eta-notifier.service';
import { CreateNotificationUseCase } from '../../../src/modules/notification/application/use-cases/create-notification.use-case';
import { BuildNotificationPayloadService } from '../../../src/modules/notification/domain/build-notification-payload.service';
import { AppointmentCodeFormatter } from '../../../src/modules/appointment/domain/appointment-code.formatter';
import {
  buildLoadedPlan, buildPlan, buildEvents, makeStop, makeAwr, makeTenant, makeFreshStop,
  makeNotificationRepo, makeLogger, SETTINGS, STOP_DEFS,
  DAY_PLAN_ID, INSPECTOR_ID, PLAN_DATE,
} from './fixtures';

// E3: A done 08:55, B in progress (check-in 09:12).
const E3_EVENTS = () => buildEvents({
  executions: new Map([
    ['appt-A', { startedAt: new Date('2026-11-04T21:00:00.000Z'), finishedAt: new Date('2026-11-04T21:55:00.000Z') }],
    ['appt-B', { startedAt: new Date('2026-11-04T22:12:00.000Z'), finishedAt: null }],
  ]),
});
const NOW_1030 = new Date('2026-11-04T23:30:00.000Z'); // 10:30 Sydney
const NOW_1100 = new Date('2026-11-05T00:00:00.000Z'); // 11:00 Sydney

function harness(opts: {
  loaded?: ReturnType<typeof buildLoadedPlan>;
  now?: Date;
  candidates?: Array<{ dayPlanId: string; inspectorId: string; planDate: string }>;
  freshStop?: unknown;
  settings?: Record<string, unknown>;
  morningBands?: Map<string, Date>;
  smsCreatedToday?: number;
} = {}) {
  const repo = makeNotificationRepo();
  const createNotification = new CreateNotificationUseCase(repo as never, { findByTenantCodeChannel: vi.fn().mockResolvedValue(null), findAll: vi.fn(), upsert: vi.fn() } as never, { enqueue: vi.fn().mockResolvedValue(undefined) } as never);
  const metrics = { incrementTenantEtaNoticeCount: vi.fn() };
  const logger = makeLogger();
  const notifier = new TenantEtaNotifier(createNotification, repo as never, new BuildNotificationPayloadService(), new AppointmentCodeFormatter(), 'https://app.properfy.me', metrics, logger as never);

  const loaded = opts.loaded ?? buildLoadedPlan({ events: E3_EVENTS() });
  const planReader = {
    findPlanByInspectorDate: vi.fn(async () => ({ dayPlanId: DAY_PLAN_ID, appointmentIds: loaded.plan.stops.map((s) => s.appointmentId) })),
    loadPlan: vi.fn(async () => loaded),
    listSweepCandidates: vi.fn(async () => opts.candidates ?? [{ dayPlanId: DAY_PLAN_ID, inspectorId: INSPECTOR_ID, planDate: PLAN_DATE }]),
  };
  const getFreshStop = { execute: vi.fn(async () => (opts.freshStop !== undefined ? opts.freshStop : makeFreshStop())) };
  const appointmentRepo = { findById: vi.fn(async (id: string) => makeAwr(id)), findScheduledOnDate: vi.fn() };
  const tenantRepo = { findById: vi.fn(async () => makeTenant()) };
  const noticeLog = {
    findMorningBands: vi.fn(async () => opts.morningBands ?? new Map<string, Date>()),
    countSmsCreatedSince: vi.fn(async () => opts.smsCreatedToday ?? 0),
  };
  const settingsReader = { get: vi.fn(async () => ({ ...SETTINGS, ...(opts.settings ?? {}) })) };
  const clock = { now: vi.fn(() => opts.now ?? NOW_1100) };

  const useCase = new SweepTenantEtaDelaysUseCase(
    planReader as never, getFreshStop as never, appointmentRepo as never, tenantRepo as never,
    notifier, noticeLog as never, settingsReader as never, logger as never, clock as never,
  );
  return { useCase, repo, logger, planReader, noticeLog };
}

const etaRows = (repo: ReturnType<typeof makeNotificationRepo>) => [...repo.store.values()].filter((r) => r.templateCode.startsWith('TENANT_ETA_'));
const sweepLog = (logger: ReturnType<typeof makeLogger>) => logger.info.mock.calls.find((c) => c[1] === 'tenant_eta.sweep_completed')?.[0];

describe('SweepTenantEtaDelaysUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  // 44
  it('sends no DELAY at 10:30 (E3a) and a DELAY for C at 11:00 (E3b)', async () => {
    const early = harness({ now: NOW_1030 });
    await early.useCase.execute();
    expect(etaRows(early.repo)).toHaveLength(0);

    const late = harness({ now: NOW_1100 });
    await late.useCase.execute();
    const c = etaRows(late.repo).filter((r) => r.appointmentId === 'appt-C');
    expect(c).toHaveLength(1); // C has phone only
    expect(c[0]!.templateCode).toBe('TENANT_ETA_DELAY');
    expect(c[0]!.payloadJson['etaFrom']).toBe('11:00 am');
    expect(c[0]!.payloadJson['etaTo']).toBe('11:55 am');
  });

  // 44 (continued): a second sweep does not re-send (one per day)
  it('does not re-send a DELAY already sent today', async () => {
    const h = harness({ now: NOW_1100 });
    await h.useCase.execute();
    await h.useCase.execute();
    expect(etaRows(h.repo).filter((r) => r.appointmentId === 'appt-C')).toHaveLength(1);
  });

  // 45 — 01.A5
  it('respects the configured delay threshold (30 → nothing, 20 → DELAY)', async () => {
    const t30 = harness({ now: NOW_1100, settings: { delayThresholdMinutes: 30 } });
    await t30.useCase.execute();
    expect(etaRows(t30.repo)).toHaveLength(0);

    const t20 = harness({ now: NOW_1100, settings: { delayThresholdMinutes: 20 } });
    await t20.useCase.execute();
    expect(etaRows(t20.repo).length).toBeGreaterThan(0);
  });

  // 46
  it('counts a STALE plan as skippedStale and sends nothing for it', async () => {
    const h = harness({ now: NOW_1100, freshStop: makeFreshStop({ status: 'STALE' }) });
    await h.useCase.execute();
    expect(etaRows(h.repo)).toHaveLength(0);
    expect(sweepLog(h.logger)).toMatchObject({ skippedStale: 1, evaluated: 0 });
  });

  // 49
  it('logs sweep_completed with the full counter set', async () => {
    const h = harness({ now: NOW_1100 });
    await h.useCase.execute();
    const log = sweepLog(h.logger);
    expect(log).toMatchObject({ plans: 1, evaluated: 1, delayed: 1 });
    expect(log).toHaveProperty('earlyChanged');
    expect(log).toHaveProperty('created');
    expect(log).toHaveProperty('smsCreatedToday');
    expect(log).toHaveProperty('durationMs');
  });

  // 49b — L-F06-11 volume warn
  it('warns daily_volume_high above the threshold, not at it', async () => {
    const at = harness({ now: NOW_1100, smsCreatedToday: 500 });
    await at.useCase.execute();
    expect(at.logger.warn.mock.calls.some((c) => c[1] === 'tenant_eta.daily_volume_high')).toBe(false);

    const over = harness({ now: NOW_1100, smsCreatedToday: 501 });
    await over.useCase.execute();
    expect(over.logger.warn.mock.calls.some((c) => c[1] === 'tenant_eta.daily_volume_high')).toBe(true);
  });

  // 49c — L-F06-05 early change
  it('sends ONE EARLY_CHANGE when the projection moved ≥ 30 min before the morning band', async () => {
    // Single wide-window stop reordered to first → projected 08:00; morning band was 10:00.
    const wide = makeStop(STOP_DEFS.A, { appointmentId: 'appt-C', sequence: 1, travelS: 1200, windowStartAt: new Date('2026-11-04T21:00:00.000Z'), windowEndAt: new Date('2026-11-05T03:00:00.000Z'), publishedServiceStartAt: new Date('2026-11-04T21:00:00.000Z'), serviceStartAt: new Date('2026-11-04T21:00:00.000Z') });
    const loaded = buildLoadedPlan({ plan: buildPlan([wide], { departureAt: new Date('2026-11-04T20:40:00.000Z') }) });
    const morningBands = new Map([['appt-C', new Date('2026-11-04T23:00:00.000Z')]]); // band was 10:00 Sydney
    const h = harness({ now: new Date('2026-11-04T20:30:00.000Z'), loaded, morningBands }); // 07:30 Sydney
    await h.useCase.execute();
    const rows = etaRows(h.repo).filter((r) => r.appointmentId === 'appt-C');
    expect(rows.every((r) => r.templateCode === 'TENANT_ETA_ON_THE_WAY')).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.payloadJson['etaFrom']).toBe('8:00 am');
    expect(sweepLog(h.logger)).toMatchObject({ earlyChanged: 1 });
  });

  // early change requires a morning band today
  it('does not early-change a stop with no morning band today', async () => {
    const wide = makeStop(STOP_DEFS.A, { appointmentId: 'appt-C', sequence: 1, travelS: 1200, windowStartAt: new Date('2026-11-04T21:00:00.000Z'), windowEndAt: new Date('2026-11-05T03:00:00.000Z') });
    const loaded = buildLoadedPlan({ plan: buildPlan([wide], { departureAt: new Date('2026-11-04T20:40:00.000Z') }) });
    const h = harness({ now: new Date('2026-11-04T20:30:00.000Z'), loaded, morningBands: new Map() });
    await h.useCase.execute();
    expect(etaRows(h.repo)).toHaveLength(0);
  });

  it('returns early when the setting is disabled (no plan reads)', async () => {
    const h = harness({ now: NOW_1100, settings: { enabled: false } });
    await h.useCase.execute();
    expect(h.planReader.listSweepCandidates).not.toHaveBeenCalled();
  });
});
