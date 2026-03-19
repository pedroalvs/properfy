import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import { ServiceGroupNotFoundError } from '../../domain/service-group.errors';

export interface GetServiceGroupInput {
  groupId: string;
  actor: AuthContext;
}

export interface GetServiceGroupOutput {
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
  appointments: Array<{
    id: string;
    status: string;
    propertyId: string;
  }>;
}

export class GetServiceGroupUseCase {
  constructor(private readonly serviceGroupRepo: IServiceGroupRepository) {}

  async execute(input: GetServiceGroupInput): Promise<GetServiceGroupOutput> {
    const { actor, groupId } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const result = await this.serviceGroupRepo.findById(groupId, actor.tenantId);
    if (!result) {
      throw new ServiceGroupNotFoundError();
    }

    const { group, appointments } = result;

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
      publishedAt: group.publishedAt,
      assignedAt: group.assignedAt,
      createdByUserId: group.createdByUserId,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      appointments: appointments.map((a) => ({
        id: a.id,
        status: a.status,
        propertyId: a.propertyId,
      })),
    };
  }
}
