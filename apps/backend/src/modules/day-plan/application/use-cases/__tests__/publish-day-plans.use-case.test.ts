import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatShortDayLabel } from '@properfy/shared';
import { PublishDayPlansUseCase } from '../publish-day-plans.use-case';
import { RoutingDeferredError } from '../../../domain/routing.service';
import type { DayPlanRecord, DayPlanStopRecord } from '../../../domain/day-plan.entity';
import type { DayPlanCandidate } from '../../../domain/day-plan-input.reader';

const TZ = 'Australia/Sydney';
// 2026-11-04 19:30 AEDT (publication window open in both inspector + platform tz).
const NOW = new Date('2026-11-04T08:30:00.000Z');
const START_0800 = new Date('2026-11-04T21:00:00.000Z'); // 08:00 Sydney on 2026-11-05
const FINISH_1035 = new Date('2026-11-04T23:35:00.000Z'); // 10:35 Sydney
// Derived through the same helper the notice uses, so the assertion stays stable
// across ICU/Node versions rather than pinning the raw "Thu 5 Nov" string.
const DAY_LABEL = formatShortDayLabel(new Date('2026-11-05T00:00:00.000Z'), TZ);

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(), child: vi.fn() };
}

function stop(appointmentId: string, sequence: number, over: Partial<DayPlanStopRecord> = {}): DayPlanStopRecord {
  return {
    id: `s-${appointmentId}`,
    appointmentId,
    sequence,
    eta: START_0800,
    serviceStartAt: START_0800,
    serviceEndAt: START_0800,
    publishedEta: START_0800,
    publishedServiceStartAt: START_0800,
    publishedPredictedAt: START_0800,
    publishedApproximate: false,
    travelS: 0,
    distanceM: 0,
    waitS: 0,
    lateS: 0,
    windowStartAt: START_0800,
    windowEndAt: START_0800,
    windowTimezone: TZ,
    durationMinutes: 60,
    lat: -33.88,
    lng: 151.2,
    manual: false,
    executed: false,
    approximate: false,
    missingCoordinates: false,
    ...over,
  };
}

function makeRecord(id: string, inspectorId: string, over: Partial<DayPlanRecord> = {}): DayPlanRecord {
  const defaults: DayPlanRecord = {
    id,
    inspectorId,
    planDate: '2026-11-05',
    timezone: TZ,
    status: 'PUBLISHED',
    version: 1,
    inputFingerprint: 'fp',
    publishedAt: NOW,
    notifiedAt: null,
    computedAt: NOW,
    computedByUserId: null,
    lastTrigger: 'SCHEDULED_PUBLISH',
    staleAt: null,
    staleReason: null,
    originSource: 'BASE',
    originLat: -33.8,
    originLng: 151.2,
    originOverride: null,
    originOverrideLat: null,
    originOverrideLng: null,
    originOverrideSetAt: null,
    departureAt: START_0800,
    finishEta: FINISH_1035,
    totalDriveS: 1000,
    totalWaitS: 0,
    totalServiceS: 10_800,
    totalLateS: 0,
    totalDistanceM: 5000,
    feasible: true,
    manualOrder: false,
    suggestedOrder: [],
    weights: { travel: 1, windowWait: 1, baseProximity: 1 },
    optimizerMethod: 'EXACT',
    routingProvider: 'MAPBOX',
    matrixProfile: 'driving-traffic',
    approximate: false,
    approximateReason: null,
    routeGeometry: null,
    routingMatrix: null,
    legTravel: null,
   
    stops: [stop('a-1', 1), stop('a-2', 2), stop('a-3', 3)],
  };
  return { ...defaults, ...over };
}

function cand(appointmentId: string, suburb: string, over: Partial<DayPlanCandidate> = {}): DayPlanCandidate {
  return {
    appointmentId,
    appointmentCode: `AP-${appointmentId}`,
    appointmentStatus: 'SCHEDULED',
    agencyName: 'Agency',
    tenantTimezone: TZ,
    scheduledDate: '2026-11-05',
    timeSlotStart: '08:00',
    timeSlotEnd: '17:00',
    windowStartAt: START_0800,
    windowEndAt: START_0800,
    durationMinutes: 60,
    serviceTypeName: 'Routine',
    lat: -33.88,
    lng: 151.2,
    propertyAddress: '12 King St',
    suburb,
    keyRequired: true,
    meetingLocation: 'Lockbox 4321',
    rentalTenantConfirmationStatus: 'CONFIRMED',
    contacts: [],
    startedAt: null,
    finishedAt: null,
    abandonedAt: null,
    ...over,
  };
}

interface Harness {
  uc: PublishDayPlansUseCase;
  repo: { loadPublishDue: ReturnType<typeof vi.fn>; findByInspectorAndDate: ReturnType<typeof vi.fn>; markNotified: ReturnType<typeof vi.fn> };
  reader: { loadCandidates: ReturnType<typeof vi.fn> };
  compute: { execute: ReturnType<typeof vi.fn> };
  notices: { execute: ReturnType<typeof vi.fn> };
  audit: { log: ReturnType<typeof vi.fn> };
  metrics: { incrementDayPlansApproximate: ReturnType<typeof vi.fn> };
  logger: ReturnType<typeof makeLogger>;
}

function build(opts: { clockValues?: Date[] } = {}): Harness {
  const repo = {
    loadPublishDue: vi.fn().mockResolvedValue([]),
    findByInspectorAndDate: vi.fn().mockResolvedValue(null),
    markNotified: vi.fn().mockResolvedValue(undefined),
  };
  const reader = { loadCandidates: vi.fn().mockResolvedValue([]) };
  const compute = { execute: vi.fn() };
  const notices = { execute: vi.fn().mockResolvedValue({ noticeId: 'n', created: true }) };
  const audit = { log: vi.fn() };
  const metrics = { incrementDayPlansApproximate: vi.fn() };
  const logger = makeLogger();
  let i = 0;
  const clock = { now: () => (opts.clockValues ? opts.clockValues[Math.min(i++, opts.clockValues.length - 1)]! : NOW) };
  const uc = new PublishDayPlansUseCase(
    reader as never,
    repo as never,
    compute as never,
    notices as never,
    audit as never,
    metrics as never,
    logger as never,
    clock,
  );
  return { uc, repo, reader, compute, notices, audit, metrics, logger };
}

function findLog(logger: ReturnType<typeof makeLogger>, level: 'info' | 'warn' | 'error', event: string) {
  return logger[level].mock.calls.find((c: unknown[]) => c[1] === event);
}

describe('PublishDayPlansUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes each due inspector and sends one ROUTE_PUBLISHED notice with the lock-screen-safe body', async () => {
    const h = build();
    h.repo.loadPublishDue.mockResolvedValue([
      { inspectorId: 'insp-1', date: '2026-11-05' },
      { inspectorId: 'insp-2', date: '2026-11-05' },
    ]);
    h.compute.execute.mockImplementation(({ inspectorId }: { inspectorId: string }) =>
      Promise.resolve(makeRecord(`plan-${inspectorId}`, inspectorId)),
    );
    h.reader.loadCandidates.mockResolvedValue([cand('a-1', 'Surry Hills'), cand('a-2', 'Bondi'), cand('a-3', 'Newtown')]);

    const result = await h.uc.execute({ now: NOW });

    expect(result).toMatchObject({ due: 2, published: 2, notified: 2, deferred: 0, skipped: 0, failed: 0, continuation: false });
    expect(h.compute.execute).toHaveBeenNthCalledWith(1, expect.objectContaining({ inspectorId: 'insp-1', trigger: 'SCHEDULED_PUBLISH', attempt: 1 }));
    expect(h.compute.execute).toHaveBeenNthCalledWith(2, expect.objectContaining({ inspectorId: 'insp-2' }));
    expect(h.notices.execute).toHaveBeenCalledTimes(2);
    const call = h.notices.execute.mock.calls[0]![0];
    expect(call).toMatchObject({
      type: 'ROUTE_PUBLISHED',
      inspectorIds: ['insp-1'],
      dedupeKey: 'route-published:insp-1:2026-11-05',
      title: 'Your route for tomorrow is ready',
      body: `3 inspections on ${DAY_LABEL}. First stop at 08:00 in Surry Hills; finish around 10:35. Open Properfy to see the order.`,
      targetPath: '/today',
    });
    expect(h.repo.markNotified).toHaveBeenCalledWith('plan-insp-1');
    // R-F02: no contact name/phone, no lockbox code, no street number — only the suburb.
    const blob = `${call.title} ${call.body}`;
    for (const leak of ['Lockbox', '4321', '12 King St', '+61']) expect(blob).not.toContain(leak);
  });

  it('writes a SYSTEM day_plan.published audit with feasible + lateS and no tenant', async () => {
    const h = build();
    h.repo.loadPublishDue.mockResolvedValue([{ inspectorId: 'insp-1', date: '2026-11-05' }]);
    h.compute.execute.mockResolvedValue(makeRecord('plan-1', 'insp-1'));
    h.reader.loadCandidates.mockResolvedValue([cand('a-1', 'Surry Hills'), cand('a-2', 'Bondi'), cand('a-3', 'Newtown')]);

    await h.uc.execute({ now: NOW });

    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'day_plan.published',
        actorType: 'SYSTEM',
        entityType: 'DayPlan',
        entityId: 'plan-1',
        tenantId: null,
        metadata: expect.objectContaining({ inspectorId: 'insp-1', date: '2026-11-05', feasible: true, lateS: 0 }),
      }),
    );
  });

  it('does not recompute or re-notify a plan already published and notified (race-safe skip)', async () => {
    const h = build();
    h.repo.loadPublishDue.mockResolvedValue([{ inspectorId: 'insp-1', date: '2026-11-05' }]);
    h.repo.findByInspectorAndDate.mockResolvedValue(makeRecord('plan-1', 'insp-1', { notifiedAt: NOW }));

    const result = await h.uc.execute({ now: NOW });

    expect(h.compute.execute).not.toHaveBeenCalled();
    expect(h.notices.execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ published: 0, notified: 0, skipped: 1 });
  });

  it('only notifies a plan the inspector already opened (published, not yet notified)', async () => {
    const h = build();
    h.repo.loadPublishDue.mockResolvedValue([{ inspectorId: 'insp-1', date: '2026-11-05' }]);
    h.repo.findByInspectorAndDate.mockResolvedValue(makeRecord('plan-1', 'insp-1', { notifiedAt: null }));
    h.reader.loadCandidates.mockResolvedValue([cand('a-1', 'Surry Hills'), cand('a-2', 'Bondi'), cand('a-3', 'Newtown')]);

    const result = await h.uc.execute({ now: NOW });

    expect(h.compute.execute).not.toHaveBeenCalled();
    expect(h.notices.execute).toHaveBeenCalledTimes(1);
    expect(h.repo.markNotified).toHaveBeenCalledWith('plan-1');
    expect(result).toMatchObject({ published: 0, notified: 1 });
  });

  it('recomputes and publishes a DRAFT/STALE plan without published_at', async () => {
    const h = build();
    h.repo.loadPublishDue.mockResolvedValue([{ inspectorId: 'insp-1', date: '2026-11-05' }]);
    h.repo.findByInspectorAndDate.mockResolvedValue(makeRecord('plan-1', 'insp-1', { status: 'STALE', publishedAt: null, notifiedAt: null }));
    h.compute.execute.mockResolvedValue(makeRecord('plan-1', 'insp-1'));
    h.reader.loadCandidates.mockResolvedValue([cand('a-1', 'Surry Hills'), cand('a-2', 'Bondi'), cand('a-3', 'Newtown')]);

    const result = await h.uc.execute({ now: NOW });

    expect(h.compute.execute).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'SCHEDULED_PUBLISH' }));
    expect(result).toMatchObject({ published: 1, notified: 1 });
  });

  it('stops the batch and asks for a continuation when the provider defers (rate limit)', async () => {
    const h = build();
    h.repo.loadPublishDue.mockResolvedValue([
      { inspectorId: 'insp-1', date: '2026-11-05' },
      { inspectorId: 'insp-2', date: '2026-11-05' },
      { inspectorId: 'insp-3', date: '2026-11-05' },
    ]);
    h.reader.loadCandidates.mockResolvedValue([cand('a-1', 'Surry Hills'), cand('a-2', 'Bondi'), cand('a-3', 'Newtown')]);
    h.compute.execute.mockImplementation(({ inspectorId }: { inspectorId: string }) => {
      if (inspectorId === 'insp-2') return Promise.reject(new RoutingDeferredError('RATE_LIMITED'));
      return Promise.resolve(makeRecord(`plan-${inspectorId}`, inspectorId));
    });

    const result = await h.uc.execute({ now: NOW });

    expect(result).toMatchObject({ published: 1, deferred: 2, continuation: true });
    expect(h.repo.markNotified).toHaveBeenCalledTimes(1);
    expect(h.compute.execute).toHaveBeenCalledTimes(2); // insp-3 never attempted
    expect(findLog(h.logger, 'info', 'day_plan.publish_deferred')).toBeTruthy();
  });

  it('stops with a continuation when the time budget is exhausted', async () => {
    const h = build({
      clockValues: [
        new Date('2026-11-04T08:30:00.000Z'),
        new Date('2026-11-04T08:40:00.000Z'),
        new Date('2026-11-04T08:50:00.000Z'),
        new Date('2026-11-04T09:05:00.000Z'), // +35 min > 25-min budget → break before 4th
      ],
    });
    h.repo.loadPublishDue.mockResolvedValue([
      { inspectorId: 'insp-1', date: '2026-11-05' },
      { inspectorId: 'insp-2', date: '2026-11-05' },
      { inspectorId: 'insp-3', date: '2026-11-05' },
      { inspectorId: 'insp-4', date: '2026-11-05' },
    ]);
    h.reader.loadCandidates.mockResolvedValue([cand('a-1', 'Surry Hills'), cand('a-2', 'Bondi'), cand('a-3', 'Newtown')]);
    h.compute.execute.mockImplementation(({ inspectorId }: { inspectorId: string }) => Promise.resolve(makeRecord(`plan-${inspectorId}`, inspectorId)));

    const result = await h.uc.execute({ now: NOW, budgetMs: 25 * 60_000 });

    expect(result).toMatchObject({ published: 3, continuation: true });
    expect(h.compute.execute).toHaveBeenCalledTimes(3);
  });

  it('publishes approximate with the "Travel times are approximate." suffix on attempt 3 and logs at error', async () => {
    const h = build();
    h.repo.loadPublishDue.mockResolvedValue([{ inspectorId: 'insp-1', date: '2026-11-05' }]);
    h.reader.loadCandidates.mockResolvedValue([cand('a-1', 'Surry Hills'), cand('a-2', 'Bondi'), cand('a-3', 'Newtown')]);
    h.compute.execute.mockResolvedValue(makeRecord('plan-1', 'insp-1', { approximate: true, approximateReason: 'PROVIDER_ERROR' }));

    const result = await h.uc.execute({ now: NOW, attempt: 3 });

    expect(result).toMatchObject({ published: 1, approximate: 1 });
    expect(h.compute.execute).toHaveBeenCalledWith(expect.objectContaining({ attempt: 3 }));
    expect(h.notices.execute.mock.calls[0]![0].body).toContain('Travel times are approximate.');
    expect(h.metrics.incrementDayPlansApproximate).toHaveBeenCalledWith('PROVIDER_ERROR');
    expect(findLog(h.logger, 'error', 'day_plan.publish_completed')).toBeTruthy();
    expect(findLog(h.logger, 'info', 'day_plan.publish_completed')).toBeFalsy();
  });

  it('publishes approximate NO_PROVIDER on attempt 1 and keeps publish_completed at info', async () => {
    const h = build();
    h.repo.loadPublishDue.mockResolvedValue([{ inspectorId: 'insp-1', date: '2026-11-05' }]);
    h.reader.loadCandidates.mockResolvedValue([cand('a-1', 'Surry Hills'), cand('a-2', 'Bondi'), cand('a-3', 'Newtown')]);
    h.compute.execute.mockResolvedValue(makeRecord('plan-1', 'insp-1', { approximate: true, approximateReason: 'NO_PROVIDER' }));

    const result = await h.uc.execute({ now: NOW, attempt: 1 });

    expect(result).toMatchObject({ published: 1, approximate: 1 });
    expect(h.metrics.incrementDayPlansApproximate).toHaveBeenCalledWith('NO_PROVIDER');
    expect(findLog(h.logger, 'info', 'day_plan.publish_completed')).toBeTruthy();
    expect(findLog(h.logger, 'error', 'day_plan.publish_completed')).toBeFalsy();
  });

  it('logs publish_completed at error when a deferral happens on attempt 3', async () => {
    const h = build();
    h.repo.loadPublishDue.mockResolvedValue([{ inspectorId: 'insp-1', date: '2026-11-05' }]);
    h.reader.loadCandidates.mockResolvedValue([cand('a-1', 'Surry Hills')]);
    h.compute.execute.mockRejectedValue(new RoutingDeferredError('PROVIDER_ERROR'));

    const result = await h.uc.execute({ now: NOW, attempt: 3 });

    expect(result).toMatchObject({ deferred: 1, continuation: true });
    expect(findLog(h.logger, 'error', 'day_plan.publish_completed')).toBeTruthy();
  });

  it('marks an infeasible plan and warns without blocking the batch', async () => {
    const h = build();
    h.repo.loadPublishDue.mockResolvedValue([{ inspectorId: 'insp-1', date: '2026-11-05' }]);
    h.reader.loadCandidates.mockResolvedValue([cand('a-1', 'Surry Hills'), cand('b-1', 'Bondi')]);
    h.compute.execute.mockResolvedValue(
      makeRecord('plan-1', 'insp-1', {
        feasible: false,
        totalLateS: 1500,
        finishEta: new Date('2026-11-04T22:40:00.000Z'), // 09:40 Sydney
        stops: [stop('a-1', 1), stop('b-1', 2, { lateS: 1500 })],
      }),
    );

    const result = await h.uc.execute({ now: NOW });

    expect(result).toMatchObject({ published: 1, infeasible: 1 });
    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'day_plan.published', metadata: expect.objectContaining({ feasible: false, lateS: 1500 }) }),
    );
    const warn = findLog(h.logger, 'warn', 'day_plan.published_infeasible');
    expect(warn).toBeTruthy();
    expect(warn![0]).toMatchObject({ inspectorId: 'insp-1', date: '2026-11-05', violations: [{ appointmentId: 'b-1', lateS: 1500 }] });
    expect(h.notices.execute.mock.calls[0]![0].body).toBe(
      `2 inspections on ${DAY_LABEL}. First stop at 08:00 in Surry Hills; finish around 09:40, 1 stop may arrive after its window. Open Properfy to see the order.`,
    );
  });

  it('logs publish_failed and keeps going on an unexpected error', async () => {
    const h = build();
    h.repo.loadPublishDue.mockResolvedValue([
      { inspectorId: 'insp-1', date: '2026-11-05' },
      { inspectorId: 'insp-2', date: '2026-11-05' },
    ]);
    h.reader.loadCandidates.mockResolvedValue([cand('a-1', 'Surry Hills'), cand('a-2', 'Bondi'), cand('a-3', 'Newtown')]);
    h.compute.execute.mockImplementation(({ inspectorId }: { inspectorId: string }) => {
      if (inspectorId === 'insp-1') return Promise.reject(new Error('boom'));
      return Promise.resolve(makeRecord('plan-2', 'insp-2'));
    });

    const result = await h.uc.execute({ now: NOW });

    expect(result).toMatchObject({ published: 1, failed: 1, continuation: false });
    expect(findLog(h.logger, 'error', 'day_plan.publish_failed')).toBeTruthy();
  });

  it('logs the publish_completed summary with the full counter shape', async () => {
    const h = build();
    h.repo.loadPublishDue.mockResolvedValue([{ inspectorId: 'insp-1', date: '2026-11-05' }]);
    h.compute.execute.mockResolvedValue(makeRecord('plan-1', 'insp-1'));
    h.reader.loadCandidates.mockResolvedValue([cand('a-1', 'Surry Hills'), cand('a-2', 'Bondi'), cand('a-3', 'Newtown')]);

    await h.uc.execute({ now: NOW });

    const done = findLog(h.logger, 'info', 'day_plan.publish_completed');
    expect(done![0]).toEqual(
      expect.objectContaining({
        due: 1,
        published: 1,
        notified: 1,
        deferred: 0,
        skipped: 0,
        failed: 0,
        approximate: 0,
        infeasible: 0,
        continuation: false,
        durationMs: expect.any(Number),
      }),
    );
  });

  it('does nothing and logs no completion when the due set is empty', async () => {
    const h = build();
    h.repo.loadPublishDue.mockResolvedValue([]);

    const result = await h.uc.execute({ now: NOW });

    expect(result).toMatchObject({ due: 0, published: 0, continuation: false });
    expect(h.compute.execute).not.toHaveBeenCalled();
  });
});
