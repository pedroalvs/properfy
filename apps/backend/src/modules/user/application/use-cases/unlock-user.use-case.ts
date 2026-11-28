import type { AuthContext } from '@properfy/shared';
import type { IUserManagementRepository } from '../../domain/user-management.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import {
  UserNotFoundError,
  UserNotLockedError,
} from '../../domain/user-management.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';
import { requireTenantScope } from '../../../../shared/domain/require-tenant-scope';

export interface UnlockUserInput {
  tenantId: string;
  userId: string;
  actor: AuthContext;
  requestId?: string;
}

export class UnlockUserUseCase {
  constructor(
    private readonly userManagementRepo: IUserManagementRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: UnlockUserInput): Promise<void> {
    const { tenantId, userId, actor } = input;

    // AM and OP are both cross-tenant (root CLAUDE.md §6, DEC-003), so either
    // can unlock an agency user. There is no internal (tenant-less) unlock
    // route — `tenantId` is always an agency.
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'user.unlock',
      entityType: 'User',
    });

    // Confine only tenant-pinned roles to their own tenant via the canonical
    // classification: `requireTenantScope` returns `undefined` for the
    // cross-tenant AM/OP allowed here, so the OP unlock is cross-agency, and a
    // future pinned role added to the allowlist would be confined automatically.
    const pinnedTenant = requireTenantScope(actor, 'user.unlock');
    if (pinnedTenant !== undefined && pinnedTenant !== tenantId) {
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
      requestId: input.requestId,
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
