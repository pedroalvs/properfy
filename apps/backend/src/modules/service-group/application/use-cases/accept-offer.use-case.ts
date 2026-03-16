import type { AuthContext } from '@properfy/shared';
import { ForbiddenError, NotFoundError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import {
  ServiceGroupNotFoundError,
  ServiceGroupInvalidStatusError,
  GroupAlreadyAcceptedError,
  InspectorIneligibleError,
  InspectorServiceTypeIneligibleError,
  InspectorInactiveError,
  PriorityExpiredError,
} from '../../domain/service-group.errors';

export interface AcceptOfferInput {
  groupId: string;
  inspectorId: string;
  actor: AuthContext;
}

export interface AcceptOfferOutput {
  groupId: string;
  status: string;
  assignedInspectorId: string;
  appointmentsScheduled: number;
  acceptedAt: Date;
}

export class AcceptOfferUseCase {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly inspectorRepo: IInspectorRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: AcceptOfferInput): Promise<AcceptOfferOutput> {
    const { actor, groupId, inspectorId } = input;

    if (actor.role !== 'INSP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Only inspectors can accept offers');
    }

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector) {
      throw new NotFoundError('INSPECTOR_NOT_FOUND', 'Inspector not found');
    }

    if (!inspector.isActive()) {
      throw new InspectorInactiveError();
    }

    const result = await this.serviceGroupRepo.findById(groupId, null);
    if (!result) {
      throw new ServiceGroupNotFoundError();
    }
    const { group } = result;

    if (!group.canAccept()) {
      if (group.status === 'ACCEPTED') {
        throw new GroupAlreadyAcceptedError();
      }
      throw new ServiceGroupInvalidStatusError('PUBLISHED', group.status);
    }

    if (!inspector.supportsServiceType(group.serviceTypeId)) {
      throw new InspectorServiceTypeIneligibleError();
    }

    if (!inspector.isEligibleForTenant(group.tenantId)) {
      throw new InspectorIneligibleError();
    }

    if (group.isPriorityExpired()) {
      throw new PriorityExpiredError();
    }

    const now = new Date();
    const updatedCount = await this.serviceGroupRepo.acceptOptimistic(groupId, inspectorId, now);
    if (updatedCount === 0) {
      throw new GroupAlreadyAcceptedError();
    }

    const scheduledCount = await this.serviceGroupRepo.scheduleAppointments(groupId, inspectorId);

    await this.serviceGroupRepo.update(groupId, {
      confirmedCount: scheduledCount,
    });

    this.auditService.log({
      action: 'service_group.accepted',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceGroup',
      entityId: groupId,
      tenantId: group.tenantId,
      before: { status: 'PUBLISHED' },
      after: {
        status: 'ACCEPTED',
        assignedInspectorId: inspectorId,
        appointmentsScheduled: scheduledCount,
      },
    });

    return {
      groupId,
      status: 'ACCEPTED',
      assignedInspectorId: inspectorId,
      appointmentsScheduled: scheduledCount,
      acceptedAt: now,
    };
  }
}
