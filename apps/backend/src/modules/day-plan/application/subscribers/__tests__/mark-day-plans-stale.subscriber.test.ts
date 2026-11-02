import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DomainEventBus,
  APPOINTMENT_EVENTS,
  SERVICE_GROUP_EVENTS,
  INSPECTOR_FIELD_EVENTS,
} from '../../../../../shared/application/events/domain-event-bus';
import { INSPECTOR_EVENTS } from '../../../../inspector/domain/inspector-events';
import { MarkDayPlansStaleSubscriber } from '../mark-day-plans-stale.subscriber';
import type { IDayPlanRepository } from '../../../domain/day-plan.repository';

function logger(): any { return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }; }

function makeRepo() {
  return {
    markStaleByAppointmentIds: vi.fn(async () => 1),
    markStaleByInspector: vi.fn(async () => 1),
    findByInspectorAndDate: vi.fn(), saveComputed: vi.fn(), clearStale: vi.fn(),
    markNotified: vi.fn(), purgePastRouteData: vi.fn(), getEtaAccuracySamples: vi.fn(),
  } as unknown as IDayPlanRepository & { markStaleByAppointmentIds: ReturnType<typeof vi.fn>; markStaleByInspector: ReturnType<typeof vi.fn> };
}

describe('MarkDayPlansStaleSubscriber', () => {
  let bus: DomainEventBus;
  let repo: ReturnType<typeof makeRepo>;
  let groups: { loadIdsByGroup: ReturnType<typeof vi.fn> };
  const log = logger();

  beforeEach(() => {
    bus = new DomainEventBus();
    repo = makeRepo();
    groups = { loadIdsByGroup: vi.fn(async () => ['A', 'B']) };
    new MarkDayPlansStaleSubscriber(repo, groups as never, log).register(bus);
    log.warn.mockClear();
  });

  it('marks STALE on an appointment status transition', async () => {
    await bus.emit({ type: APPOINTMENT_EVENTS.STATUS_TRANSITION, payload: { appointmentId: 'A' } });
    expect(repo.markStaleByAppointmentIds).toHaveBeenCalledWith(['A'], 'APPOINTMENT_STATUS_CHANGED');
  });

  it('resolves a group to its appointments and marks them STALE', async () => {
    await bus.emit({ type: SERVICE_GROUP_EVENTS.SCHEDULE_CHANGED, payload: { groupId: 'g1', inspectorId: 'i' } });
    expect(groups.loadIdsByGroup).toHaveBeenCalledWith('g1');
    expect(repo.markStaleByAppointmentIds).toHaveBeenCalledWith(['A', 'B'], 'GROUP_CHANGED');
  });

  it('marks STALE on a CANT_DO field event but ignores LATE_NOTICE', async () => {
    await bus.emit({ type: INSPECTOR_FIELD_EVENTS.RECORDED, payload: { type: 'CANT_DO', appointmentId: 'A' } });
    expect(repo.markStaleByAppointmentIds).toHaveBeenCalledWith(['A'], 'INSPECTOR_CANT_DO');
    repo.markStaleByAppointmentIds.mockClear();
    await bus.emit({ type: INSPECTOR_FIELD_EVENTS.RECORDED, payload: { type: 'LATE_NOTICE', appointmentId: 'A', estimatedArrivalAt: new Date() } });
    expect(repo.markStaleByAppointmentIds).not.toHaveBeenCalled();
  });

  it('marks the inspector STALE on BASE_CHANGED with coordinates, no-ops without', async () => {
    await bus.emit({ type: INSPECTOR_EVENTS.BASE_CHANGED, payload: { inspectorId: 'i', hadCoordinates: true, hasCoordinates: true } });
    expect(repo.markStaleByInspector).toHaveBeenCalledWith('i', 'BASE_CHANGED');
    repo.markStaleByInspector.mockClear();
    await bus.emit({ type: INSPECTOR_EVENTS.BASE_CHANGED, payload: { inspectorId: 'i', hadCoordinates: false, hasCoordinates: false } });
    expect(repo.markStaleByInspector).not.toHaveBeenCalled();
  });

  it('logs and does not rethrow on a repository error', async () => {
    repo.markStaleByAppointmentIds.mockRejectedValueOnce(new Error('db down'));
    await expect(bus.emit({ type: APPOINTMENT_EVENTS.STATUS_TRANSITION, payload: { appointmentId: 'A' } })).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ eventType: APPOINTMENT_EVENTS.STATUS_TRANSITION }), 'day_plan.stale_mark_failed');
  });
});
