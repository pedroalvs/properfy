import type { AuthContext } from '@properfy/shared';
import type { IUserManagementRepository } from '../../domain/user-management.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import {
  UserNotFoundError,
  UserNotLockedError,
} from '../../domain/user-management.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';

export interface UnlockUserInput {
  tenantId: string;
  userId: string;
  actor: AuthContext;
}

export class UnlockUserUseCase {
  constructor(
    private readonly userManagementRepo: IUserManagementRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: UnlockUserInput): Promise<void> {
    const { tenantId, userId, actor } = input;

    // RBAC: AM can unlock any user; OP can unlock users in own tenant only
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'user.unlock',
      entityType: 'User',
    });

    if (actor.role === 'OP' && actor.tenantId !== tenantId) {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'You can only unlock users from your own tenant',
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

    // Check if user is actually locked
    if (user.status !== 'LOCKED') {
      throw new UserNotLockedError();
    }

    // Unlock: reset failed login count, clear lock, set status back to ACTIVE
    await this.userManagementRepo.unlock(userId, tenantId);

    // Audit log
    this.auditService.log({
      action: 'user.unlocked',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'User',
      entityId: userId,
      tenantId,
      before: {
        status: user.status,
        failedLoginCount: user.failedLoginCount,
        lockedUntil: user.lockedUntil,
      },
      after: {
        status: 'ACTIVE',
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
  }
}
