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
  state: string;
  country: string;
  status: string;
  suburbCount: number;
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

    // INSP sees only their assigned regions -- handled via filters at route level
    // For now, the repository returns all matching regions; the route layer
    // can add inspector-specific filtering if needed.

    const [data, total] = await Promise.all([
      this.regionRepo.findAll(filters, pagination),
      this.regionRepo.count(filters),
    ]);

    return {
      data: data.map((region) => ({
        id: region.id,
        name: region.name,
        state: region.state,
        country: region.country,
        status: region.status,
        suburbCount: region.suburbs.length,
        createdAt: region.createdAt,
        updatedAt: region.updatedAt,
      })),
      total,
    };
  }
}
