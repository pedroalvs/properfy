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

export interface RejectServiceGroupInput {
  groupId: string;
  reason: string;
  actor: AuthContext;
}

export interface RejectServiceGroupOutput {
  id: string;
  status: string;
}

export class RejectServiceGroupUseCase {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly eventBus?: DomainEventBus,
  ) {}

  async execute(input: RejectServiceGroupInput): Promise<RejectServiceGroupOutput> {
    const { actor, groupId, reason } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], { action: 'service_group.manage', entityType: 'ServiceGroup' });

    const result = await this.serviceGroupRepo.findById(groupId, actor.tenantId);
    if (!result) {
      throw new ServiceGroupNotFoundError();
    }

    const { group, primaryTenantId } = result;

    if (!group.canReject()) {
      throw new ServiceGroupInvalidStatusError('PUBLISHED or ACCEPTED', group.status);
    }

    // If group was ACCEPTED, revert SCHEDULED appointments back to AWAITING_INSPECTOR
    if (group.status === 'ACCEPTED') {
      await this.serviceGroupRepo.revertScheduledAppointments(groupId);
    }

    // Move the group to REJECTED (read-only, kept for tracing) and drop the
    // group-level inspector assignment.
    await this.serviceGroupRepo.update(groupId, {
      status: 'REJECTED',
      assignedInspectorId: null,
      assignedAt: null,
    });

    // Unlink appointments: they leave the group and return to the map (AWAITING_INSPECTOR).
    await this.serviceGroupRepo.unlinkAppointments(groupId);

    this.auditService.log({
      action: 'service_group.rejected',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceGroup',
      entityId: groupId,
      tenantId: primaryTenantId,
      before: { status: group.status },
      after: { status: 'REJECTED' },
      reason,
    });

    this.eventBus?.emit({
      type: SERVICE_GROUP_EVENTS.REJECTED,
      payload: { groupId, tenantId: primaryTenantId },
      occurredAt: new Date(),
    });

    return {
      id: groupId,
      status: 'REJECTED',
    };
  }
}
