import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { ITenantRepository } from '../../domain/tenant.repository';
import type { IBranchRepository } from '../../domain/branch.repository';
import { TenantNotFoundError, BranchNotFoundError } from '../../domain/tenant.errors';

export interface GetBranchInput {
  tenantId: string;
  branchId: string;
  actor: AuthContext;
}

export interface GetBranchOutput {
  id: string;
  tenantId: string;
  name: string;
  addressJson: Record<string, unknown> | null;
  contactEmail: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export class GetBranchUseCase {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly branchRepo: IBranchRepository,
  ) {}

  async execute(input: GetBranchInput): Promise<GetBranchOutput> {
    const { tenantId, branchId, actor } = input;

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

    const branch = await this.branchRepo.findById(branchId, tenantId);
    if (!branch || branch.isDeleted()) {
      throw new BranchNotFoundError();
    }

    return {
      id: branch.id,
      tenantId: branch.tenantId,
      name: branch.name,
      addressJson: branch.addressJson,
      contactEmail: branch.contactEmail,
      status: branch.status,
      createdAt: branch.createdAt,
      updatedAt: branch.updatedAt,
    };
  }
}
