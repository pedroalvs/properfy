import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { SERVICE_GROUP_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
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
  ) {}

  async execute(input: CancelServiceGroupInput): Promise<CancelServiceGroupOutput> {
    const { actor, groupId, reason } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], { action: 'service_group.manage', entityType: 'ServiceGroup' });

    const result = await this.serviceGroupRepo.findById(groupId, actor.tenantId);
    if (!result) {
      throw new ServiceGroupNotFoundError();
    }

    const { group, primaryTenantId } = result;

    if (!group.canCancel()) {
      throw new ServiceGroupInvalidStatusError('ACCEPTED', group.status);
    }

    // Release the accepted inspector's scheduled visits back to AWAITING_INSPECTOR.
    // The appointments stay linked to the group — Cancel keeps the batch intact so
    // it can be republished to DRAFT later. (Guard above guarantees status ACCEPTED.)
    await this.serviceGroupRepo.revertScheduledAppointments(groupId);

    // Move the group to CANCELLED and drop the group-level inspector assignment.
    await this.serviceGroupRepo.update(groupId, {
      status: 'CANCELLED',
      assignedInspectorId: null,
      assignedAt: null,
    });

    this.auditService.log({
      action: 'service_group.cancelled',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceGroup',
      entityId: groupId,
      tenantId: primaryTenantId,
      before: { status: group.status },
      after: { status: 'CANCELLED' },
      reason,
    });

    this.eventBus?.emit({
      type: SERVICE_GROUP_EVENTS.CANCELLED,
      payload: { groupId, tenantId: primaryTenantId },
      occurredAt: new Date(),
    });

    return {
      id: groupId,
      status: 'CANCELLED',
    };
  }
}
