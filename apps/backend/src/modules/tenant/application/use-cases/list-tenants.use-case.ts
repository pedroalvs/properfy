import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type {
  ITenantRepository,
  TenantFilters,
  PaginationParams,
} from '../../domain/tenant.repository';

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
    createdAt: Date;
    updatedAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export class ListTenantsUseCase {
  constructor(private readonly tenantRepo: ITenantRepository) {}

  async execute(input: ListTenantsInput): Promise<ListTenantsOutput> {
    const { filters, pagination, actor } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const [data, total] = await Promise.all([
      this.tenantRepo.findAll(filters, pagination),
      this.tenantRepo.count(filters),
    ]);

    return {
      data: data.map((t) => ({
        id: t.id,
        name: t.name,
        legalName: t.legalName,
        status: t.status,
        timezone: t.timezone,
        currency: t.currency,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
}
