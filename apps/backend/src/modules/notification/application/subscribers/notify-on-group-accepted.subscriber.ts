import type {
  DomainEvent,
  DomainEventBus,
} from '../../../../shared/application/events/domain-event-bus';
import { SERVICE_GROUP_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import type { IServiceGroupRepository } from '../../../service-group/domain/service-group.repository';
import type { NotifyOnStatusTransitionHandler } from '../handlers/notify-on-status-transition.handler';

interface Logger {
  warn(obj: unknown, msg?: string): void;
}

/**
 * Bridges group-level acceptance events (marketplace accept + manual assign)
 * to per-appointment rental-tenant notifications. Both flows schedule
 * appointments via a bulk repository update that bypasses
 * ExecuteStatusTransitionUseCase, so NotifyOnStatusTransitionHandler (which
 * sends INSPECTION_NOTICE email/SMS and mints the portal token) would
 * otherwise never fire. Events are emitted only after the acceptance saga
 * fully succeeds, so this subscriber never runs for a compensated acceptance.
 */
export class NotifyOnGroupAcceptedSubscriber {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly notifyHandler: NotifyOnStatusTransitionHandler,
    private readonly logger?: Logger,
  ) {}

  register(eventBus: DomainEventBus): void {
    eventBus.subscribe(SERVICE_GROUP_EVENTS.ACCEPTED, (event) => this.onGroupAccepted(event));
    eventBus.subscribe(SERVICE_GROUP_EVENTS.MANUALLY_ASSIGNED, (event) =>
      this.onGroupAccepted(event),
    );
  }

  private async onGroupAccepted(event: DomainEvent): Promise<void> {
    try {
      const { groupId } = event.payload as { groupId: string };

      // Groups are tenant-agnostic; re-query fresh post-commit state.
      const result = await this.serviceGroupRepo.findById(groupId, null);
      if (!result) return;

      for (const appointment of result.appointments) {
        // Only rows still SCHEDULED — skip anything that raced to another status.
        if (appointment.status !== 'SCHEDULED') continue;
        // Per-row isolation: one failed notification must not starve the rest.
        try {
          await this.notifyHandler.execute({
            appointmentId: appointment.id,
            tenantId: appointment.tenantId,
            previousStatus: 'AWAITING_INSPECTOR',
            targetStatus: 'SCHEDULED',
          });
        } catch (err) {
          this.logger?.warn(
            { err, appointmentId: appointment.id, groupId },
            'Failed to notify rental tenant on group acceptance',
          );
        }
      }
    } catch (err) {
      this.logger?.warn({ err, eventType: event.type }, 'Group acceptance notification failed');
    }
  }
}
