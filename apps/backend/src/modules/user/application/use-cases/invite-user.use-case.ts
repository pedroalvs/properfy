import crypto from 'node:crypto';
import type { AuthContext } from '@properfy/shared';
import type { IUserManagementRepository } from '../../domain/user-management.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { IBranchRepository } from '../../../tenant/domain/branch.repository';
import type { IPasswordResetTokenRepository } from '../../../auth/domain/password-reset-token.repository';
import type { CreateNotificationUseCase } from '../../../notification/application/use-cases/create-notification.use-case';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { UserEntity } from '../../../auth/domain/user.entity';
import { PasswordResetTokenEntity } from '../../../auth/domain/password-reset-token.entity';
import { UserEmailConflictError } from '../../domain/user-management.errors';
import {
  TenantNotFoundError,
  TenantInactiveError,
  BranchNotFoundError,
} from '../../../tenant/domain/tenant.errors';
import { ForbiddenError, ValidationError } from '../../../../shared/domain/errors';

const INVITE_TOKEN_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

export interface InviteUserInput {
  tenantId: string;
  name: string;
  email: string;
  role: string;
  branchId?: string | null;
  phone?: string | null;
  actor: AuthContext;
}

export interface InviteUserOutput {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string;
  branchId: string | null;
  phone: string | null;
  status: string;
  createdAt: Date;
}

export class InviteUserUseCase {
  constructor(
    private readonly userManagementRepo: IUserManagementRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly branchRepo: IBranchRepository,
    private readonly passwordResetTokenRepo: IPasswordResetTokenRepository,
    private readonly createNotificationUseCase: CreateNotificationUseCase,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: InviteUserInput): Promise<InviteUserOutput> {
    const { tenantId, name, email, role, branchId, phone, actor } = input;

    // Only client roles can be invited
    if (role !== 'CL_ADMIN' && role !== 'CL_USER') {
      throw new ValidationError('Only client roles (CL_ADMIN, CL_USER) can be invited');
    }

    // RBAC checks
    if (actor.role === 'CL_ADMIN') {
      if (actor.tenantId !== tenantId) {
        throw new ForbiddenError(
          'AUTH_FORBIDDEN',
          'You can only invite users for your own tenant',
        );
      }
    } else if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'You are not allowed to invite users',
      );
    }

    // Validate tenant
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      throw new TenantNotFoundError();
    }
    if (!tenant.isActive()) {
      throw new TenantInactiveError();
    }

    // Validate branch if provided
    if (branchId) {
      const branch = await this.branchRepo.findById(branchId, tenantId);
      if (!branch) {
        throw new BranchNotFoundError();
      }
    }

    // Check email uniqueness
    const existingUser = await this.userManagementRepo.findByEmail(email);
    if (existingUser) {
      throw new UserEmailConflictError();
    }

    // Create user with PENDING_INVITE status and empty password hash
    const now = new Date();
    const user = new UserEntity({
      id: crypto.randomUUID(),
      tenantId,
      branchId: branchId ?? null,
      role: role as UserEntity['role'],
      name,
      email,
      phone: phone ?? null,
      status: 'PENDING_INVITE',
      passwordHash: '',
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

    // Generate invite token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const tokenEntity = new PasswordResetTokenEntity({
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash,
      expiresAt: new Date(now.getTime() + INVITE_TOKEN_TTL_MS),
      usedAt: null,
      createdAt: now,
    });

    await this.passwordResetTokenRepo.save(tokenEntity);

    // Send invite email
    await this.createNotificationUseCase.execute({
      tenantId,
      recipient: email,
      channel: 'EMAIL',
      templateCode: 'USER_INVITE',
      payloadJson: {
        userName: name,
        inviteToken: rawToken,
      },
    });

    // Audit
    this.auditService.log({
      action: 'user.invited',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'User',
      entityId: user.id,
      tenantId,
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
      tenantId: user.tenantId!,
      branchId: user.branchId,
      phone: user.phone,
      status: user.status,
      createdAt: user.createdAt,
    };
  }
}
