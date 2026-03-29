import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type {
  IServiceGroupRepository,
  ServiceGroupFilters,
  PaginationParams,
} from '../../domain/service-group.repository';

export interface ListServiceGroupsInput {
  filters: {
    tenantId?: string;
    status?: string;
    serviceTypeId?: string;
    scheduledDateFrom?: string;
    scheduledDateTo?: string;
    priorityMode?: string;
  };
  pagination: PaginationParams;
  actor: AuthContext;
}

export interface ServiceGroupSummary {
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
  assignedInspectorName: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListServiceGroupsOutput {
  data: ServiceGroupSummary[];
  total: number;
}

export class ListServiceGroupsUseCase {
  constructor(private readonly serviceGroupRepo: IServiceGroupRepository) {}

  async execute(input: ListServiceGroupsInput): Promise<ListServiceGroupsOutput> {
    const { actor, filters, pagination } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const repoFilters: ServiceGroupFilters = { ...filters };

    // OP is scoped to their tenant
    if (actor.role === 'OP' && actor.tenantId) {
      repoFilters.tenantId = actor.tenantId;
    }

    const [data, total] = await Promise.all([
      this.serviceGroupRepo.findAll(repoFilters, pagination),
      this.serviceGroupRepo.count(repoFilters),
    ]);

    return {
      data: data.map(({ group: g, assignedInspectorName }) => ({
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
        assignedInspectorName,
        publishedAt: g.publishedAt,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
      })),
      total,
    };
  }
}
