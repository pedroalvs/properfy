import type { AuthContext } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
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
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: ListServiceRegionsInput): Promise<ListServiceRegionsOutput> {
    const { filters, pagination, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'INSP'], { action: 'service_region.list', entityType: 'ServiceRegion' });

    const tenantId = this.resolveTenantId(actor);
    // When the caller is cross-tenant (AM/OP with null JWT tenantId) a
    // `tenantId` filter on the query string is honoured by the repo; for
    // tenant-scoped roles the repo pins tenant_id to the JWT value, so
    // any filter the client passes is effectively ignored (defense-in-depth).

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

  /**
   * Returns null for platform-wide roles (AM) so the repo queries across
   * every tenant. OP is cross-tenant per CLAUDE.md §6 and also gets null.
   * Client roles (CL_ADMIN, CL_USER) and INSP are pinned to their JWT
   * tenantId — the middleware already rejects those with null tenantId, so
   * `actor.tenantId` is non-null by the time we reach this branch.
   */
  private resolveTenantId(actor: AuthContext): string | null {
    if (actor.role === 'AM' || actor.role === 'OP') {
      return actor.tenantId ?? null;
    }
    return actor.tenantId;
  }
}
