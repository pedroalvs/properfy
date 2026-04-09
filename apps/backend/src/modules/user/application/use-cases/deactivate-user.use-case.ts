import type { AuthContext } from '@properfy/shared';
import type { IUserManagementRepository } from '../../domain/user-management.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import {
  UserNotFoundError,
  UserAlreadyInactiveError,
} from '../../domain/user-management.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';

export interface DeactivateUserInput {
  tenantId: string;
  userId: string;
  reason: string;
  actor: AuthContext;
}

export class DeactivateUserUseCase {
  constructor(
    private readonly userManagementRepo: IUserManagementRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: DeactivateUserInput): Promise<void> {
    const { tenantId, userId, reason, actor } = input;

    // RBAC: AM can deactivate any tenant; CL_ADMIN own tenant only
    if (actor.role === 'CL_ADMIN') {
      if (actor.tenantId !== tenantId) {
        throw new ForbiddenError(
          'AUTH_FORBIDDEN',
          'You can only deactivate users from your own tenant',
        );
      }
    } else if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'You are not allowed to deactivate users',
      );
    }

    // CL_ADMIN can only manage users if the tenant setting allows it
    if (actor.role === 'CL_ADMIN') {
      const tenant = await this.tenantRepo.findById(tenantId);
      if (tenant && tenant.settingsJson.allowClientUserManagement !== true) {
        throw new ForbiddenError(
          'AUTH_FORBIDDEN',
          'Client user management is not enabled for this agency',
        );
      }
    }

    // Cannot deactivate self
    if (actor.userId === userId) {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'You cannot deactivate your own account',
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

    // Check if already inactive
    if (user.isInactive()) {
      throw new UserAlreadyInactiveError();
    }

    const now = new Date();

    // Set status to INACTIVE and deletedAt
    await this.userManagementRepo.update(userId, tenantId, {
      status: 'INACTIVE',
      deletedAt: now,
    });

    // Revoke all sessions
    await this.userManagementRepo.revokeAllSessions(userId);

    // Audit log
    this.auditService.log({
      action: 'user.deactivated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'User',
      entityId: userId,
      tenantId,
      before: { status: user.status },
      after: { status: 'INACTIVE', deletedAt: now },
      reason,
    });
  }
}
