import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import {
  ServiceGroupNotFoundError,
  ServiceGroupInvalidStatusError,
  AppointmentInvalidStatusError,
  PriorityExpiredError,
} from '../../domain/service-group.errors';

export interface PublishServiceGroupInput {
  groupId: string;
  actor: AuthContext;
}

export interface PublishServiceGroupOutput {
  id: string;
  status: string;
  offeredCount: number;
  publishedAt: Date;
}

export class PublishServiceGroupUseCase {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: PublishServiceGroupInput): Promise<PublishServiceGroupOutput> {
    const { actor, groupId } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const result = await this.serviceGroupRepo.findById(groupId, actor.tenantId);
    if (!result) {
      throw new ServiceGroupNotFoundError();
    }

    const { group, appointments } = result;

    // Idempotency: if already PUBLISHED, return current state without side effects
    if (group.status === 'PUBLISHED') {
      return {
        id: groupId,
        status: 'PUBLISHED',
        offeredCount: group.offeredCount,
        publishedAt: group.publishedAt!,
      };
    }

    if (!group.canPublish()) {
      throw new ServiceGroupInvalidStatusError('DRAFT', group.status);
    }

    // Verify all appointments are still AWAITING_INSPECTOR
    for (const appt of appointments) {
      if (appt.status !== 'AWAITING_INSPECTOR') {
        throw new AppointmentInvalidStatusError(appt.appointmentNumber);
      }
    }

    // Check priority expiry
    if (group.isPriorityExpired()) {
      throw new PriorityExpiredError();
    }

    const now = new Date();
    const newOfferedCount = group.offeredCount + 1;

    await this.serviceGroupRepo.update(groupId, {
      status: 'PUBLISHED',
      offeredCount: newOfferedCount,
      publishedAt: now,
    });

    this.auditService.log({
      action: 'service_group.published',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceGroup',
      entityId: groupId,
      tenantId: group.tenantId,
      before: { status: 'DRAFT', offeredCount: group.offeredCount },
      after: { status: 'PUBLISHED', offeredCount: newOfferedCount },
    });

    return {
      id: groupId,
      status: 'PUBLISHED',
      offeredCount: newOfferedCount,
      publishedAt: now,
    };
  }
}
