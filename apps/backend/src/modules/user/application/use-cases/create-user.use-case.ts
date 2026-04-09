import bcrypt from 'bcryptjs';
import type { AuthContext } from '@properfy/shared';
import type { IUserManagementRepository } from '../../domain/user-management.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { IBranchRepository } from '../../../tenant/domain/branch.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { UserEntity } from '../../../auth/domain/user.entity';
import { UserEmailConflictError } from '../../domain/user-management.errors';
import {
  TenantNotFoundError,
  TenantInactiveError,
  BranchNotFoundError,
} from '../../../tenant/domain/tenant.errors';
import { ForbiddenError, ValidationError } from '../../../../shared/domain/errors';
import { validatePasswordStrength } from '../../../auth/domain/password-policy';
import {
  PasswordTooWeakError,
  PasswordTooCommonError,
} from '../../../auth/domain/auth.errors';
import { COMMON_PASSWORDS } from '../../../auth/application/constants/common-passwords';

export interface CreateUserInput {
  tenantId?: string | null;
  name: string;
  email: string;
  password: string;
  role: string;
  branchId?: string | null;
  phone?: string | null;
  actor: AuthContext;
}

export interface CreateUserOutput {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string | null;
  branchId: string | null;
  phone: string | null;
  status: string;
  createdAt: Date;
}

export class CreateUserUseCase {
  constructor(
    private readonly userManagementRepo: IUserManagementRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly branchRepo: IBranchRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: CreateUserInput): Promise<CreateUserOutput> {
    const { tenantId, name, email, password, role, branchId, phone, actor } =
      input;
    const isInternalRole = role === 'AM' || role === 'OP';

    // RBAC: AM can create for any tenant; CL_ADMIN can create for own tenant only
    if (actor.role === 'CL_ADMIN') {
      if (actor.tenantId !== tenantId) {
        throw new ForbiddenError(
          'AUTH_FORBIDDEN',
          'You can only create users for your own tenant',
        );
      }
      // CL_ADMIN can only create CL_USER or CL_ADMIN roles
      if (role === 'AM' || role === 'OP' || role === 'INSP') {
        throw new ForbiddenError(
          'AUTH_FORBIDDEN',
          'You are not allowed to create users with this role',
        );
      }
    } else if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'You are not allowed to create users',
      );
    }

    // Inspector accounts are managed through the Inspector module, not User management
    if (role === 'INSP') {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'Inspector accounts are managed through the Inspector module',
      );
    }

    if (isInternalRole) {
      if (tenantId) {
        throw new ValidationError('Internal users cannot be assigned to an agency');
      }
      if (branchId) {
        throw new ValidationError('Internal users cannot be assigned to a branch');
      }
    } else {
      if (!tenantId) {
        throw new ValidationError('Tenant is required for agency users');
      }

      const tenant = await this.tenantRepo.findById(tenantId);
      if (!tenant) {
        throw new TenantNotFoundError();
      }
      if (!tenant.isActive()) {
        throw new TenantInactiveError();
      }

      // CL_ADMIN can only manage users if the tenant setting allows it
      if (actor.role === 'CL_ADMIN' && tenant.settingsJson.allowClientUserManagement !== true) {
        throw new ForbiddenError(
          'AUTH_FORBIDDEN',
          'Client user management is not enabled for this agency',
        );
      }

      if (branchId) {
        const branch = await this.branchRepo.findById(branchId, tenantId);
        if (!branch) {
          throw new BranchNotFoundError();
        }
      }
    }

    // Check email uniqueness
    const existingUser = await this.userManagementRepo.findByEmail(email);
    if (existingUser) {
      throw new UserEmailConflictError();
    }

    // Validate password strength and blacklist
    const strengthResult = validatePasswordStrength(password);
    if (!strengthResult.valid) {
      throw new PasswordTooWeakError(strengthResult.violations);
    }

    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
      throw new PasswordTooCommonError();
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user entity
    const now = new Date();
    const user = new UserEntity({
      id: crypto.randomUUID(),
      tenantId: tenantId ?? null,
      branchId: branchId ?? null,
      role: role as UserEntity['role'],
      name,
      email,
      phone: phone ?? null,
      status: 'ACTIVE',
      passwordHash,
      totpSecret: null,
      totpEnabled: false,
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await this.userManagementRepo.save(user);

    // Audit log
    this.auditService.log({
      action: 'user.created',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'User',
      entityId: user.id,
      tenantId: tenantId ?? undefined,
      after: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        branchId: user.branchId,
        status: user.status,
      },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      branchId: user.branchId,
      phone: user.phone,
      status: user.status,
      createdAt: user.createdAt,
    };
  }
}
