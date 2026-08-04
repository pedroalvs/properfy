import type { AuthContext, ServiceTypeEntry } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type {
  IInspectorRepository,
  InspectorFilters,
  PaginationParams,
} from '../../domain/inspector.repository';
import type { IServiceRegionRepository } from '../../../service-region/domain/service-region.repository';
import type { IInspectorRatingReader, InspectorRatingAggregate } from '../../domain/inspector-rating.reader';

export interface ListInspectorsInput {
  filters: InspectorFilters;
  pagination: PaginationParams;
  actor: AuthContext;
}

export interface ListInspectorsOutput {
  data: Array<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: string;
    regionIds: string[];
    serviceTypesJson: ServiceTypeEntry[];
    /**
     * Reputation figures. Aggregate only — an inspector reading its own row must
     * never see individual ratings or comments through this endpoint.
     */
    rating: { average: number | null; responseCount: number; doneServicesCount: number };
    createdAt: Date;
    updatedAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export class ListInspectorsUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly serviceRegionRepo: IServiceRegionRepository,
    // Optional so existing two-argument construction keeps working; an unwired
    // deployment reports zero responses rather than throwing.
    private readonly ratingReader?: IInspectorRatingReader,
  ) {}

  private async ratingsFor(inspectorIds: string[]): Promise<Map<string, InspectorRatingAggregate>> {
    if (!this.ratingReader || inspectorIds.length === 0) return new Map();
    return this.ratingReader.getAggregatesByInspectorIds(inspectorIds);
  }

  private static toRating(aggregate: InspectorRatingAggregate | undefined) {
    return {
      // null, never 0: "unrated" is not a bad score, and a 0 would sort above
      // real ratings on an ascending sort.
      average: aggregate?.averageRating ?? null,
      responseCount: aggregate?.responseCount ?? 0,
      doneServicesCount: aggregate?.doneServicesCount ?? 0,
    };
  }

  async execute(input: ListInspectorsInput): Promise<ListInspectorsOutput> {
    const { pagination, actor } = input;
    let { filters } = input;

    if (actor.role === 'INSP') {
      if (!actor.inspectorId) {
        throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
      }
      const inspector = await this.inspectorRepo.findById(actor.inspectorId);
      const item = inspector && !inspector.isDeleted() ? inspector : null;
      if (!item) {
        return { data: [], total: 0, page: pagination.page, pageSize: pagination.pageSize };
      }
      const regionIds = await this.serviceRegionRepo.getInspectorRegionIds(item.id);
      const ratings = await this.ratingsFor([item.id]);
      return {
        data: [
          {
            id: item.id,
            name: item.name,
            email: item.email,
            phone: item.phone,
            status: item.status,
            regionIds,
            serviceTypesJson: item.serviceTypesJson,
            rating: ListInspectorsUseCase.toRating(ratings.get(item.id)),
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          },
        ],
        total: 1,
        page: pagination.page,
        pageSize: pagination.pageSize,
      };
    }

    // CL_ADMIN and CL_USER can only see eligible inspectors for their tenant
    if (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
      if (!actor.tenantId) {
        throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
      }
      filters = { ...filters, tenantId: actor.tenantId };
    }

    const [data, total] = await Promise.all([
      this.inspectorRepo.findAll(filters, pagination),
      this.inspectorRepo.count(filters),
    ]);

    const inspectorIds = data.map((i) => i.id);
    const [regionIdsMap, ratingsMap] = await Promise.all([
      this.serviceRegionRepo.getInspectorRegionIdsBatch(inspectorIds),
      this.ratingsFor(inspectorIds),
    ]);

    return {
      data: data.map((i) => ({
        id: i.id,
        name: i.name,
        email: i.email,
        phone: i.phone,
        status: i.status,
        regionIds: regionIdsMap.get(i.id) ?? [],
        serviceTypesJson: i.serviceTypesJson,
        rating: ListInspectorsUseCase.toRating(ratingsMap.get(i.id)),
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
}
