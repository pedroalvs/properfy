import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import { ServiceGroupNotFoundError } from '../../domain/service-group.errors';

export interface UpdateServiceGroupInput {
  groupId: string;
  name?: string;
  regionName?: string;
  priorityMode?: string;
  description?: string;
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
  assignedInspectorId: string | null;
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

    await this.serviceGroupRepo.update(groupId, {
      name: input.name !== undefined ? input.name : undefined,
      regionName: input.regionName !== undefined ? input.regionName : undefined,
      description: input.description !== undefined ? input.description : undefined,
    });

    this.auditService.log({
      action: 'service_group.updated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceGroup',
      entityId: groupId,
      tenantId: group.tenantId,
      after: {
        name: input.name,
        regionName: input.regionName,
        description: input.description,
      },
    });

    const updated = await this.serviceGroupRepo.findById(groupId, actor.tenantId);
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
      assignedInspectorId: g.assignedInspectorId,
      publishedAt: g.publishedAt,
      assignedAt: g.assignedAt,
      createdByUserId: g.createdByUserId,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    };
  }
}
