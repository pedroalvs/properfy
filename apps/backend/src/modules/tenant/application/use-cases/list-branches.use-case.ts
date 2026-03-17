import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { ITenantRepository } from '../../domain/tenant.repository';
import type {
  IBranchRepository,
  BranchFilters,
  PaginationParams,
} from '../../domain/branch.repository';
import { TenantNotFoundError } from '../../domain/tenant.errors';

export interface ListBranchesInput {
  tenantId: string;
  filters: BranchFilters;
  pagination: PaginationParams;
  actor: AuthContext;
}

export interface ListBranchesOutput {
  data: Array<{
    id: string;
    tenantId: string;
    name: string;
    addressJson: Record<string, unknown> | null;
    contactEmail: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export class ListBranchesUseCase {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly branchRepo: IBranchRepository,
  ) {}

  async execute(input: ListBranchesInput): Promise<ListBranchesOutput> {
    const { tenantId, filters, pagination, actor } = input;

    // RBAC: AM/OP any; CL_ADMIN/CL_USER own tenant only
    if (actor.role !== 'AM' && actor.role !== 'OP') {
      if (
        (actor.role !== 'CL_ADMIN' && actor.role !== 'CL_USER') ||
        actor.tenantId !== tenantId
      ) {
        throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
      }
    }

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant || tenant.isDeleted()) {
      throw new TenantNotFoundError();
    }

    const [data, total] = await Promise.all([
      this.branchRepo.findAll(tenantId, filters, pagination),
      this.branchRepo.count(tenantId, filters),
    ]);

    return {
      data: data.map((b) => ({
        id: b.id,
        tenantId: b.tenantId,
        name: b.name,
        addressJson: b.addressJson,
        contactEmail: b.contactEmail,
        status: b.status,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
}
