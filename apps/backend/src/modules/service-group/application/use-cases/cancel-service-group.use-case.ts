import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { SERVICE_GROUP_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { IAvailabilitySlotRepository } from '../../../inspector/domain/availability-slot.repository';
import {
  ServiceGroupNotFoundError,
  ServiceGroupInvalidStatusError,
} from '../../domain/service-group.errors';

export interface CancelServiceGroupInput {
  groupId: string;
  reason: string;
  actor: AuthContext;
}

export interface CancelServiceGroupOutput {
  id: string;
  status: string;
}

export class CancelServiceGroupUseCase {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly eventBus?: DomainEventBus,
    private readonly availabilitySlotRepo?: IAvailabilitySlotRepository,
  ) {}

  async execute(input: CancelServiceGroupInput): Promise<CancelServiceGroupOutput> {
    const { actor, groupId, reason } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], { action: 'service_group.manage', entityType: 'ServiceGroup' });

    const result = await this.serviceGroupRepo.findById(groupId, actor.tenantId);
    if (!result) {
      throw new ServiceGroupNotFoundError();
    }

    const { group } = result;

    if (!group.canCancel()) {
      throw new ServiceGroupInvalidStatusError('DRAFT, PUBLISHED, or ACCEPTED', group.status);
    }

    // If group was ACCEPTED, revert SCHEDULED appointments back to AWAITING_INSPECTOR
    // and restore the availability slot capacity
    if (group.status === 'ACCEPTED') {
      await this.serviceGroupRepo.revertScheduledAppointments(groupId);

      // Restore availability slot capacity
      if (this.availabilitySlotRepo && group.assignedInspectorId) {
        const parts = group.timeWindow.split('-');
        const slotStart = parts[0] ?? '';
        const slotEnd = parts[1] ?? '';
        const slot = await this.availabilitySlotRepo.findSlotForRestore(
          group.assignedInspectorId,
          group.scheduledDate,
          slotStart,
          slotEnd,
        );
        if (slot) {
          await this.availabilitySlotRepo.incrementCapacity(slot.id);
        }
      }
    }

    // Update group status
    await this.serviceGroupRepo.update(groupId, {
      status: 'CANCELLED',
    });

    // Unlink appointments (clear service_group_id, they stay in AWAITING_INSPECTOR)
    await this.serviceGroupRepo.unlinkAppointments(groupId);

    this.auditService.log({
      action: 'service_group.cancelled',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceGroup',
      entityId: groupId,
      tenantId: group.tenantId,
      before: { status: group.status },
      after: { status: 'CANCELLED' },
      reason,
    });

    this.eventBus?.emit({
      type: SERVICE_GROUP_EVENTS.CANCELLED,
      payload: { groupId, tenantId: group.tenantId },
      occurredAt: new Date(),
    });

    return {
      id: groupId,
      status: 'CANCELLED',
    };
  }
}
