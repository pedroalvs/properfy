import type { AuthContext } from '@properfy/shared';
import { ianaTimezoneSchema } from '@properfy/shared';
import type { IUserManagementRepository } from '../../domain/user-management.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { IBranchRepository } from '../../../tenant/domain/branch.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { UserNotFoundError } from '../../domain/user-management.errors';
import { BranchNotFoundError } from '../../../tenant/domain/tenant.errors';
import { ForbiddenError, ValidationError } from '../../../../shared/domain/errors';
import type { UserRole } from '@properfy/shared';

export interface UpdateUserInput {
  tenantId: string | null;
  userId: string;
  data: {
    name?: string;
    phone?: string | null;
    branchId?: string | null;
    role?: string;
    /** Personal timezone. Cross-tenant targets only — rejected for CL_* users. */
    timezone?: string | null;
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
  timezone: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export class UpdateUserUseCase {
  constructor(
    private readonly userManagementRepo: IUserManagementRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly branchRepo: IBranchRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: UpdateUserInput): Promise<UpdateUserOutput> {
    const { tenantId, userId, data, actor } = input;
    const targetRole = data.role;
    const targetIsInternal = targetRole === 'AM' || targetRole === 'OP';

    // Privilege escalation check when role is being changed
    if (data.role !== undefined) {
      this.authorizationService.assertNoPrivilegeEscalation(actor, data.role as UserRole);
    } else {
      // Even without role change, only AM, OP, and CL_ADMIN can update users
      if (actor.role !== 'AM' && actor.role !== 'OP' && actor.role !== 'CL_ADMIN') {
        throw new ForbiddenError(
          'AUTH_FORBIDDEN',
          'You are not allowed to update users',
        );
      }
    }

    // Tenant-scoping: CL_ADMIN and OP can only update users from own tenant.
    // Sprint 1 W-4-IMPL (CORRECTION-001 close-it, 2026-04-13): OP joins the
    // tenant-scoped roles; only AM can cross tenants on user updates.
    if (actor.role === 'CL_ADMIN' || actor.role === 'OP') {
      if (actor.tenantId !== tenantId) {
        throw new ForbiddenError(
          'AUTH_FORBIDDEN',
          'You can only update users from your own tenant',
        );
      }
    }

    // Inspector accounts are managed through the Inspector module, not User management
    if (data.role === 'INSP') {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'Inspector accounts are managed through the Inspector module',
      );
    }

    // Internal (tenant-less) users can only be updated by AM.
    // OP is tenant-scoped per CORRECTION-001 close-it.
    if (tenantId === null && actor.role !== 'AM') {
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

    // CL_ADMIN can only manage users if the tenant setting allows it
    if (actor.role === 'CL_ADMIN' && tenantId) {
      const tenant = await this.tenantRepo.findById(tenantId);
      if (tenant && tenant.settingsJson.allowClientUserManagement !== true) {
        throw new ForbiddenError(
          'AUTH_FORBIDDEN',
          'Client user management is not enabled for this agency',
        );
      }
    }

    // Prevent modifying users that currently have role INSP
    if (user.role === 'INSP') {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'Inspector accounts are managed through the Inspector module',
      );
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

    // Timezone: only cross-tenant users carry a personal timezone; agency
    // (CL_*) users strictly inherit the agency timezone. Setting a value on a
    // CL_* target is rejected, but CLEARING (null) is allowed so a demotion to
    // CL_* can drop a stale personal timezone in the same request.
    if (data.timezone !== undefined) {
      const effectiveRole = targetRole ?? user.role;
      if (
        data.timezone !== null &&
        (effectiveRole === 'CL_ADMIN' || effectiveRole === 'CL_USER')
      ) {
        throw new ValidationError('Agency users inherit the agency timezone', [
          { field: 'timezone', message: 'Agency users inherit the agency timezone' },
        ]);
      }
      if (data.timezone !== null && !ianaTimezoneSchema.safeParse(data.timezone).success) {
        throw new ValidationError('Invalid timezone', [
          { field: 'timezone', message: 'Must be a valid IANA timezone identifier' },
        ]);
      }
    }

    // Build update data based on role
    const updateData: Record<string, unknown> = {};
    if (actor.role === 'AM' || actor.role === 'OP') {
      // AM/OP can update all fields
      if (data.name !== undefined) updateData.name = data.name;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.branchId !== undefined) updateData.branchId = data.branchId;
      if (data.role !== undefined) updateData.role = data.role;
      if (data.timezone !== undefined) {
        updateData.timezone = data.timezone;
      } else if (data.role === 'CL_ADMIN' || data.role === 'CL_USER') {
        // Demotion to an agency role auto-clears any stale personal timezone,
        // preserving the "CL_* users carry no personal timezone" invariant.
        updateData.timezone = null;
      }
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
      timezone: user.timezone,
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
      timezone: updatedUser!.timezone,
      status: updatedUser!.status,
      createdAt: updatedUser!.createdAt,
      updatedAt: updatedUser!.updatedAt,
    };
  }
}
