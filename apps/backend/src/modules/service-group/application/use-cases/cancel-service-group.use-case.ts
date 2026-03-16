import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
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
  ) {}

  async execute(input: CancelServiceGroupInput): Promise<CancelServiceGroupOutput> {
    const { actor, groupId, reason } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const result = await this.serviceGroupRepo.findById(groupId, actor.tenantId);
    if (!result) {
      throw new ServiceGroupNotFoundError();
    }

    const { group } = result;

    if (!group.canCancel()) {
      throw new ServiceGroupInvalidStatusError('DRAFT or PUBLISHED', group.status);
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

    return {
      id: groupId,
      status: 'CANCELLED',
    };
  }
}
