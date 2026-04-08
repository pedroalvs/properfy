import type { AuthContext, PriorityMode, ServiceGroupExceptionType } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import {
  ServiceGroupNotFoundError,
  ServiceGroupNotDraftError,
  PriorityDateTooCloseError,
} from '../../domain/service-group.errors';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';

/** Fields that can only be updated when the group is in DRAFT status. */
const DRAFT_ONLY_FIELDS = [
  'scheduledDate',
  'timeWindow',
  'priorityMode',
  'exceptionType',
  'exceptionReason',
] as const;

export interface UpdateServiceGroupInput {
  groupId: string;
  name?: string;
  regionName?: string;
  description?: string;
  serviceRegionId?: string | null;
  scheduledDate?: string;
  timeWindow?: string;
  priorityMode?: PriorityMode;
  exceptionType?: ServiceGroupExceptionType | null;
  exceptionReason?: string | null;
  actor: AuthContext;
}

export interface UpdateServiceGroupOutput {
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
  exceptionType: string | null;
  exceptionReason: string | null;
  assignedInspectorId: string | null;
  serviceRegionId: string | null;
  publishedAt: Date | null;
  assignedAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class UpdateServiceGroupUseCase {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly auditService: AuditService,
    private readonly tenantRepo?: ITenantRepository,
  ) {}

  async execute(input: UpdateServiceGroupInput): Promise<UpdateServiceGroupOutput> {
    const { actor, groupId } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const result = await this.serviceGroupRepo.findById(groupId, actor.tenantId);
    if (!result) {
      throw new ServiceGroupNotFoundError();
    }

    const { group } = result;

    // Guard: draft-only fields require DRAFT status
    const hasDraftOnlyFields = DRAFT_ONLY_FIELDS.some(
      (field) => input[field] !== undefined,
    );
    if (hasDraftOnlyFields && group.status !== 'DRAFT') {
      throw new ServiceGroupNotDraftError();
    }

    // Build the update payload
    const updateData: Parameters<IServiceGroupRepository['update']>[1] = {};

    // Fields editable in any status
    if (input.name !== undefined) updateData.name = input.name;
    if (input.regionName !== undefined) updateData.regionName = input.regionName;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.serviceRegionId !== undefined) updateData.serviceRegionId = input.serviceRegionId;

    // Draft-only fields
    if (input.scheduledDate !== undefined) {
      updateData.scheduledDate = new Date(input.scheduledDate);
    }
    if (input.timeWindow !== undefined) {
      updateData.timeWindow = input.timeWindow;
    }
    if (input.priorityMode !== undefined) {
      updateData.priorityMode = input.priorityMode;
    }
    if (input.exceptionType !== undefined) {
      updateData.exceptionType = input.exceptionType;
    }
    if (input.exceptionReason !== undefined) {
      updateData.exceptionReason = input.exceptionReason;
    }

    // Recalculate priorityExpiresAt when priorityMode changes
    if (input.priorityMode !== undefined) {
      if (input.priorityMode === 'PRIORITY_24H') {
        const priorityOfferHours = await this.resolvePriorityOfferHours(group.tenantId);
        const scheduledDateStr = input.scheduledDate ?? group.scheduledDate.toISOString().slice(0, 10);
        const scheduledDate = new Date(scheduledDateStr);
        const priorityExpiresAt = new Date(scheduledDate.getTime() - priorityOfferHours * 60 * 60 * 1000);

        // Validate scheduled date is at least priorityOfferHours from now
        const now = new Date();
        if (priorityExpiresAt <= now) {
          throw new PriorityDateTooCloseError();
        }

        updateData.priorityExpiresAt = priorityExpiresAt;
      } else {
        // STANDARD mode: clear priority expiry
        updateData.priorityExpiresAt = null;
      }
    } else if (input.scheduledDate !== undefined && group.priorityMode === 'PRIORITY_24H') {
      // scheduledDate changed but priorityMode stays PRIORITY_24H: recalculate
      const priorityOfferHours = await this.resolvePriorityOfferHours(group.tenantId);
      const scheduledDate = new Date(input.scheduledDate);
      const priorityExpiresAt = new Date(scheduledDate.getTime() - priorityOfferHours * 60 * 60 * 1000);

      const now = new Date();
      if (priorityExpiresAt <= now) {
        throw new PriorityDateTooCloseError();
      }

      updateData.priorityExpiresAt = priorityExpiresAt;
    }

    await this.serviceGroupRepo.update(groupId, updateData);

    this.auditService.log({
      action: 'service_group.updated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceGroup',
      entityId: groupId,
      tenantId: group.tenantId,
      after: updateData,
    });

    const updated = await this.serviceGroupRepo.findById(groupId, actor.tenantId);
    /* istanbul ignore next -- defensive: findById should always return after successful update */
    const g = updated!.group;

    return {
      id: g.id,
      tenantId: g.tenantId,
      serviceTypeId: g.serviceTypeId,
      status: g.status,
      groupSize: g.groupSize,
      offeredCount: g.offeredCount,
      confirmedCount: g.confirmedCount,
      scheduledDate: g.scheduledDate,
      timeWindow: g.timeWindow,
      name: g.name,
      regionName: g.regionName,
      description: g.description,
      priorityMode: g.priorityMode,
      priorityExpiresAt: g.priorityExpiresAt,
      exceptionType: g.exceptionType,
      exceptionReason: g.exceptionReason,
      assignedInspectorId: g.assignedInspectorId,
      serviceRegionId: g.serviceRegionId,
      publishedAt: g.publishedAt,
      assignedAt: g.assignedAt,
      createdByUserId: g.createdByUserId,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    };
  }

  private async resolvePriorityOfferHours(tenantId: string): Promise<number> {
    const DEFAULT_PRIORITY_HOURS = 24;
    if (!this.tenantRepo) return DEFAULT_PRIORITY_HOURS;
    const tenant = await this.tenantRepo.findById(tenantId);
    if (tenant?.settingsJson && typeof tenant.settingsJson.priorityOfferHours === 'number') {
      return tenant.settingsJson.priorityOfferHours;
    }
    return DEFAULT_PRIORITY_HOURS;
  }
}
