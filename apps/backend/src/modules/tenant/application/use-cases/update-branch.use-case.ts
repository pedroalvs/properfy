import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { ITenantRepository } from '../../domain/tenant.repository';
import type { IBranchRepository } from '../../domain/branch.repository';
import {
  TenantNotFoundError,
  BranchNotFoundError,
  BranchNameConflictError,
} from '../../domain/tenant.errors';

export interface UpdateBranchInput {
  tenantId: string;
  branchId: string;
  data: {
    name?: string;
    address?: Record<string, unknown> | null;
    contactEmail?: string | null;
  };
  actor: AuthContext;
}

export interface UpdateBranchOutput {
  id: string;
  tenantId: string;
  name: string;
  addressJson: Record<string, unknown> | null;
  contactEmail: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export class UpdateBranchUseCase {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly branchRepo: IBranchRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: UpdateBranchInput): Promise<UpdateBranchOutput> {
    const { tenantId, branchId, data, actor } = input;

    // RBAC: AM any; CL_ADMIN own tenant (name+address)
    if (
      actor.role !== 'AM' &&
      (actor.role !== 'CL_ADMIN' || actor.tenantId !== tenantId)
    ) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant || tenant.isDeleted()) {
      throw new TenantNotFoundError();
    }

    const branch = await this.branchRepo.findById(branchId, tenantId);
    if (!branch || branch.isDeleted()) {
      throw new BranchNotFoundError();
    }

    // Check name uniqueness if changing
    if (data.name && data.name !== branch.name) {
      const existing = await this.branchRepo.findByName(tenantId, data.name);
      if (existing) {
        throw new BranchNameConflictError();
      }
    }

    const before = {
      name: branch.name,
      addressJson: branch.addressJson,
      contactEmail: branch.contactEmail,
    };

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.address !== undefined) updateData.addressJson = data.address;
    if (data.contactEmail !== undefined) updateData.contactEmail = data.contactEmail;

    await this.branchRepo.update(branchId, updateData);

    const after = {
      name: (updateData.name as string) ?? branch.name,
      addressJson:
        (updateData.addressJson as Record<string, unknown> | null) ??
        branch.addressJson,
      contactEmail:
        updateData.contactEmail !== undefined
          ? (updateData.contactEmail as string | null)
          : branch.contactEmail,
    };

    this.auditService.log({
      action: 'branch.updated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Branch',
      entityId: branchId,
      tenantId,
      before,
      after,
    });

    return {
      id: branch.id,
      tenantId: branch.tenantId,
      name: after.name,
      addressJson: after.addressJson,
      contactEmail: after.contactEmail,
      status: branch.status,
      createdAt: branch.createdAt,
      updatedAt: new Date(),
    };
  }
}
