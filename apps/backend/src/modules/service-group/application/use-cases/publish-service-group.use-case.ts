import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { IServiceRegionRepository } from '../../../service-region/domain/service-region.repository';
import {
  ServiceGroupNotFoundError,
  ServiceGroupInvalidStatusError,
  AppointmentInvalidStatusError,
  PriorityExpiredError,
  ServiceRegionRequiredError,
  ServiceRegionInactiveError,
} from '../../domain/service-group.errors';

export interface PublishServiceGroupInput {
  groupId: string;
  actor: AuthContext;
}

export interface PublishServiceGroupOutput {
  id: string;
  tenantId: string;
  serviceTypeId: string;
  status: string;
  groupSize: number;
  offeredCount: number;
  confirmedCount: number;
  scheduledDate: Date;
  timeWindow: string;
  name: string | null;
  regionName: string | null;
  description: string | null;
  priorityMode: string;
  priorityExpiresAt: Date | null;
  assignedInspectorId: string | null;
  serviceRegionId: string | null;
  publishedAt: Date | null;
  assignedAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class PublishServiceGroupUseCase {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly auditService: AuditService,
    private readonly serviceRegionRepo: IServiceRegionRepository,
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
      return mapGroupToOutput(group);
    }

    if (!group.canPublish()) {
      throw new ServiceGroupInvalidStatusError('DRAFT', group.status);
    }

    // Validate service region is assigned and active
    if (!group.serviceRegionId) {
      throw new ServiceRegionRequiredError();
    }

    const region = await this.serviceRegionRepo.findById(group.serviceRegionId);
    if (!region) {
      throw new ServiceRegionInactiveError();
    }
    if (region.status !== 'ACTIVE') {
      throw new ServiceRegionInactiveError();
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

    // Reflect the updates on the in-memory entity for the response
    group.status = 'PUBLISHED';
    group.offeredCount = newOfferedCount;
    group.publishedAt = now;

    return mapGroupToOutput(group);
  }
}

function mapGroupToOutput(group: import('../../domain/service-group.entity').ServiceGroupEntity): PublishServiceGroupOutput {
  return {
    id: group.id,
    tenantId: group.tenantId,
    serviceTypeId: group.serviceTypeId,
    status: group.status,
    groupSize: group.groupSize,
    offeredCount: group.offeredCount,
    confirmedCount: group.confirmedCount,
    scheduledDate: group.scheduledDate,
    timeWindow: group.timeWindow,
    name: group.name,
    regionName: group.regionName,
    description: group.description,
    priorityMode: group.priorityMode,
    priorityExpiresAt: group.priorityExpiresAt,
    assignedInspectorId: group.assignedInspectorId,
    serviceRegionId: group.serviceRegionId,
    publishedAt: group.publishedAt,
    assignedAt: group.assignedAt,
    createdByUserId: group.createdByUserId,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}
