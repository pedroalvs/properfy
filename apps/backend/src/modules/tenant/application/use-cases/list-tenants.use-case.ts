import type { AuthContext } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type {
  ITenantRepository,
  TenantFilters,
  PaginationParams,
} from '../../domain/tenant.repository';
import type { IBranchRepository } from '../../domain/branch.repository';

export interface ListTenantsInput {
  filters: TenantFilters;
  pagination: PaginationParams;
  actor: AuthContext;
}

export interface ListTenantsOutput {
  data: Array<{
    id: string;
    name: string;
    legalName: string;
    status: string;
    timezone: string;
    currency: string;
    appointmentCodePrefix: string | null;
    branchCount: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export class ListTenantsUseCase {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly branchRepo: IBranchRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: ListTenantsInput): Promise<ListTenantsOutput> {
    const { filters, pagination, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'tenant.list',
      entityType: 'Tenant',
    });

    const [data, total] = await Promise.all([
      this.tenantRepo.findAll(filters, pagination),
      this.tenantRepo.count(filters),
    ]);

    const tenantIds = data.map((t) => t.id);
    const branchCounts = await this.branchRepo.countByTenantIds(tenantIds);

    return {
      data: data.map((t) => ({
        id: t.id,
        name: t.name,
        legalName: t.legalName,
        status: t.status,
        timezone: t.timezone,
        currency: t.currency,
        appointmentCodePrefix: t.appointmentCodePrefix,
        branchCount: branchCounts[t.id] ?? 0,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
}
