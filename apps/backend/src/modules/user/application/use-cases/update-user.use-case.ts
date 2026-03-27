import type { AuthContext } from '@properfy/shared';
import type { IUserManagementRepository } from '../../domain/user-management.repository';
import type { IBranchRepository } from '../../../tenant/domain/branch.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { UserNotFoundError } from '../../domain/user-management.errors';
import { BranchNotFoundError } from '../../../tenant/domain/tenant.errors';
import { ForbiddenError, ValidationError } from '../../../../shared/domain/errors';

export interface UpdateUserInput {
  tenantId: string | null;
  userId: string;
  data: {
    name?: string;
    phone?: string | null;
    branchId?: string | null;
    role?: string;
  };
  actor: AuthContext;
}

export interface UpdateUserOutput {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string | null;
  branchId: string | null;
  phone: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export class UpdateUserUseCase {
  constructor(
    private readonly userManagementRepo: IUserManagementRepository,
    private readonly branchRepo: IBranchRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: UpdateUserInput): Promise<UpdateUserOutput> {
    const { tenantId, userId, data, actor } = input;
    const targetRole = data.role;
    const targetIsInternal = targetRole === 'AM' || targetRole === 'OP';

    // RBAC check
    if (actor.role === 'CL_ADMIN') {
      if (actor.tenantId !== tenantId) {
        throw new ForbiddenError(
          'AUTH_FORBIDDEN',
          'You can only update users from your own tenant',
        );
      }
      // CL_ADMIN cannot change role to AM or OP
      if (data.role === 'AM' || data.role === 'OP' || data.role === 'INSP') {
        throw new ForbiddenError(
          'AUTH_FORBIDDEN',
          'You are not allowed to assign this role',
        );
      }
    } else if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'You are not allowed to update users',
      );
    }

    if (tenantId === null && actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'You are not allowed to update internal users',
      );
    }

    // Find the user
    const user = await this.userManagementRepo.findByIdAndTenantId(
      userId,
      tenantId,
    );
    if (!user) {
      throw new UserNotFoundError();
    }

    const effectiveIsInternal =
      targetRole !== undefined ? targetIsInternal : user.tenantId === null;

    if (effectiveIsInternal && tenantId !== null) {
      throw new ValidationError('Internal users cannot be assigned to an agency');
    }

    if (effectiveIsInternal && data.branchId !== undefined && data.branchId !== null) {
      throw new ValidationError('Internal users cannot be assigned to a branch');
    }

    if (!effectiveIsInternal && tenantId === null) {
      throw new ValidationError('Agency users require an agency context');
    }

    // Build update data based on role
    let updateData: Record<string, unknown> = {};
    if (actor.role === 'AM' || actor.role === 'OP') {
      // AM/OP can update all fields
      if (data.name !== undefined) updateData.name = data.name;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.branchId !== undefined) updateData.branchId = data.branchId;
      if (data.role !== undefined) updateData.role = data.role;
    } else {
      // CL_ADMIN can only update name, phone, branchId (role stripped)
      if (data.name !== undefined) updateData.name = data.name;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.branchId !== undefined) updateData.branchId = data.branchId;
    }

    // Validate branch if provided
    if (
      updateData.branchId !== undefined &&
      updateData.branchId !== null &&
      tenantId
    ) {
      const branch = await this.branchRepo.findById(
        updateData.branchId as string,
        tenantId,
      );
      if (!branch) {
        throw new BranchNotFoundError();
      }
    }

    // Capture before state for audit
    const before = {
      name: user.name,
      phone: user.phone,
      branchId: user.branchId,
      role: user.role,
    };

    await this.userManagementRepo.update(userId, tenantId, updateData as Parameters<IUserManagementRepository['update']>[2]);

    // Audit log
    this.auditService.log({
      action: 'user.updated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'User',
      entityId: userId,
      tenantId: tenantId ?? undefined,
      before,
      after: updateData,
    });

    // Fetch and return updated user
    const updatedUser = await this.userManagementRepo.findByIdAndTenantId(
      userId,
      tenantId,
    );

    return {
      id: updatedUser!.id,
      name: updatedUser!.name,
      email: updatedUser!.email,
      role: updatedUser!.role,
      tenantId: updatedUser!.tenantId,
      branchId: updatedUser!.branchId,
      phone: updatedUser!.phone,
      status: updatedUser!.status,
      createdAt: updatedUser!.createdAt,
      updatedAt: updatedUser!.updatedAt,
    };
  }
}
