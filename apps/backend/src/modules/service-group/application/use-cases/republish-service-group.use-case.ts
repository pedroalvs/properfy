import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import {
  ServiceGroupNotFoundError,
  ServiceGroupInvalidStatusError,
} from '../../domain/service-group.errors';

export interface RepublishServiceGroupInput {
  groupId: string;
  reason?: string;
  actor: AuthContext;
}

export interface RepublishServiceGroupOutput {
  id: string;
  status: string;
}

export class RepublishServiceGroupUseCase {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: RepublishServiceGroupInput): Promise<RepublishServiceGroupOutput> {
    const { actor, groupId, reason } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], { action: 'service_group.publish', entityType: 'ServiceGroup' });

    const result = await this.serviceGroupRepo.findById(groupId, actor.tenantId);
    if (!result) {
      throw new ServiceGroupNotFoundError();
    }

    const { group } = result;

    if (!group.canBeRepublished()) {
      throw new ServiceGroupInvalidStatusError('CANCELLED', group.status);
    }

    // Transition to DRAFT and clear assignment-related fields
    await this.serviceGroupRepo.update(groupId, {
      status: 'DRAFT',
      assignedInspectorId: null,
      assignedAt: null,
      priorityExpiresAt: null,
      publishedAt: null,
    });

    this.auditService.log({
      action: 'service_group.republished',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceGroup',
      entityId: groupId,
      tenantId: group.tenantId,
      before: {
        status: 'CANCELLED',
        assignedInspectorId: group.assignedInspectorId,
        priorityExpiresAt: group.priorityExpiresAt,
      },
      after: {
        status: 'DRAFT',
        assignedInspectorId: null,
        priorityExpiresAt: null,
      },
      ...(reason ? { reason } : {}),
    });

    return {
      id: groupId,
      status: 'DRAFT',
    };
  }
}
