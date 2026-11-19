import {
  APPOINTMENT_EVENTS,
  SERVICE_GROUP_EVENTS,
  INSPECTOR_FIELD_EVENTS,
  type DomainEvent,
  type DomainEventBus,
} from '../../../../shared/application/events/domain-event-bus';
import { INSPECTOR_EVENTS } from '../../../inspector/domain/inspector-events';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { IDayPlanRepository } from '../../domain/day-plan.repository';
import type { IGroupAppointmentReader } from '../../domain/group-appointment.reader';

const GROUP_EVENTS = [
  SERVICE_GROUP_EVENTS.ACCEPTED,
  SERVICE_GROUP_EVENTS.MANUALLY_ASSIGNED,
  SERVICE_GROUP_EVENTS.INSPECTOR_CHANGED,
  SERVICE_GROUP_EVENTS.SCHEDULE_CHANGED,
  SERVICE_GROUP_EVENTS.MEMBERS_ADDED,
];

/**
 * Marks day plans STALE when their inputs change (idempotent; first reason wins;
 * tz-correct; only today/future plans). A STALE flag is only a hint — the fresh
 * fingerprint check on read decides whether to recompute (L-F04-01).
 */
export class MarkDayPlansStaleSubscriber {
  constructor(
    private readonly repo: IDayPlanRepository,
    private readonly groups: IGroupAppointmentReader,
    private readonly logger: Logger,
  ) {}

  register(bus: DomainEventBus): void {
    bus.subscribe(APPOINTMENT_EVENTS.STATUS_TRANSITION, (e) => this.onAppointment(e));
    for (const type of GROUP_EVENTS) bus.subscribe(type, (e) => this.onGroup(e));
    bus.subscribe(INSPECTOR_FIELD_EVENTS.RECORDED, (e) => this.onFieldEvent(e));
    bus.subscribe(INSPECTOR_EVENTS.BASE_CHANGED, (e) => this.onBaseChanged(e));
  }

  private async onAppointment(event: DomainEvent): Promise<void> {
    const appointmentId = event.payload['appointmentId'];
    if (typeof appointmentId !== 'string') return;
    await this.safe(() => this.repo.markStaleByAppointmentIds([appointmentId], 'APPOINTMENT_STATUS_CHANGED'), event.type);
  }

  private async onGroup(event: DomainEvent): Promise<void> {
    const groupId = event.payload['groupId'];
    if (typeof groupId !== 'string') return;
    await this.safe(async () => {
      const ids = await this.groups.loadIdsByGroup(groupId);
      if (ids.length > 0) await this.repo.markStaleByAppointmentIds(ids, 'GROUP_CHANGED');
    }, event.type);
  }

  private async onFieldEvent(event: DomainEvent): Promise<void> {
    if (event.payload['type'] !== 'CANT_DO') return; // LATE_NOTICE never affects the plan
    const appointmentId = event.payload['appointmentId'];
    if (typeof appointmentId !== 'string') return;
    await this.safe(() => this.repo.markStaleByAppointmentIds([appointmentId], 'INSPECTOR_CANT_DO'), event.type);
  }

  private async onBaseChanged(event: DomainEvent): Promise<void> {
    const inspectorId = event.payload['inspectorId'];
    const had = event.payload['hadCoordinates'] === true;
    const has = event.payload['hasCoordinates'] === true;
    if (typeof inspectorId !== 'string' || (!had && !has)) return; // no coordinates either side → origin unchanged
    await this.safe(() => this.repo.markStaleByInspector(inspectorId, 'BASE_CHANGED'), event.type);
  }

  private async safe(fn: () => Promise<unknown>, eventType: string): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.warn({ eventType, errorName: err instanceof Error ? err.name : 'unknown' }, 'day_plan.stale_mark_failed');
    }
  }
}
