import type { AppointmentTransitionEvent } from '@properfy/shared';
import type {
  DomainEvent,
  DomainEventBus,
} from '../../../../shared/application/events/domain-event-bus';
import { APPOINTMENT_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import type { CancelEmptyGroupService } from '../services/cancel-empty-group.service';
import type { Logger } from '../../../../shared/infrastructure/logger';

/**
 * Only these can empty a group. A transition to DONE cannot: a DONE member keeps
 * the group alive by design, so checking it would be wasted work.
 */
const GROUP_EMPTYING_STATUSES = new Set(['CANCELLED', 'REJECTED']);

/**
 * Cancels a released service group as soon as its last remaining appointment dies.
 *
 * Hooks the single appointment-transition event rather than each call site, which
 * covers the manual cancel/reject, both bulk endpoints and the daily overdue sweep
 * — all of them route through ExecuteStatusTransitionUseCase.
 *
 * Two paths it cannot see, by design:
 *  - soft delete, which emits no transition event
 *  - the portal group change, whose event carries the *new* group; that flow calls
 *    CancelEmptyGroupService directly for the group it vacated
 * The daily sweep is the backstop for the first.
 */
export class CancelEmptyGroupOnTransitionSubscriber {
  constructor(
    private readonly cancelEmptyGroup: CancelEmptyGroupService,
    private readonly logger?: Logger,
  ) {}

  register(eventBus: DomainEventBus): void {
    eventBus.subscribe(APPOINTMENT_EVENTS.STATUS_TRANSITION, (event) =>
      this.onTransition(event),
    );
  }

  private async onTransition(event: DomainEvent): Promise<void> {
    const { toStatus, serviceGroupId } = event.payload as unknown as AppointmentTransitionEvent;

    // Guard early and cheaply: this event fires on every transition in the system.
    if (!serviceGroupId) return;
    if (!GROUP_EMPTYING_STATUSES.has(toStatus)) return;

    try {
      await this.cancelEmptyGroup.cancelIfDead(serviceGroupId);
    } catch (err) {
      // The appointment transition is already committed and must stand.
      this.logger?.warn(
        { err, serviceGroupId, toStatus },
        'Empty-group cleanup failed after appointment transition',
      );
    }
  }
}
