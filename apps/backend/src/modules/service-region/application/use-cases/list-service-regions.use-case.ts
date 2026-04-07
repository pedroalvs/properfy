import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type {
  IServiceRegionRepository,
  ServiceRegionFilters,
  PaginationParams,
} from '../../domain/service-region.repository';

export interface ListServiceRegionsInput {
  filters: ServiceRegionFilters;
  pagination: PaginationParams;
  actor: AuthContext;
}

export interface ServiceRegionListItem {
  id: string;
  name: string;
  geojson: Record<string, unknown>;
  color: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListServiceRegionsOutput {
  data: ServiceRegionListItem[];
  total: number;
}

export class ListServiceRegionsUseCase {
  constructor(
    private readonly regionRepo: IServiceRegionRepository,
  ) {}

  async execute(input: ListServiceRegionsInput): Promise<ListServiceRegionsOutput> {
    const { filters, pagination, actor } = input;

    if (
      actor.role !== 'AM' &&
      actor.role !== 'OP' &&
      actor.role !== 'INSP'
    ) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const tenantId = this.resolveTenantId(actor);

    const [data, total] = await Promise.all([
      this.regionRepo.findAll(tenantId, filters, pagination),
      this.regionRepo.count(tenantId, filters),
    ]);

    return {
      data: data.map((region) => ({
        id: region.id,
        name: region.name,
        geojson: region.geojson,
        color: region.color,
        status: region.status,
        createdAt: region.createdAt,
        updatedAt: region.updatedAt,
      })),
      total,
    };
  }

  private resolveTenantId(actor: AuthContext): string {
    if (!actor.tenantId) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Tenant context is required');
    }
    return actor.tenantId;
  }
}
