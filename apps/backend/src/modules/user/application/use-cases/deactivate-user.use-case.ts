import type { PrismaClient } from '@prisma/client';
import type { AuthContext } from '@properfy/shared';
import type { IUserManagementRepository } from '../../domain/user-management.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { runInTransaction } from '../../../../shared/application/unit-of-work';
import {
  UserNotFoundError,
  UserAlreadyInactiveError,
} from '../../domain/user-management.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';

export interface DeactivateUserInput {
  tenantId: string | null;
  userId: string;
  reason: string;
  actor: AuthContext;
  requestId?: string;
}

export class DeactivateUserUseCase {
  constructor(
    private readonly userManagementRepo: IUserManagementRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly prisma?: PrismaClient,
  ) {}

  async execute(input: DeactivateUserInput): Promise<void> {
    const { tenantId, userId, reason, actor } = input;

    // RBAC mirrors update-user.use-case: AM crosses tenants and manages internal
    // (tenant-less) users; OP is cross-tenant over agency users; CL_ADMIN is
    // scoped to its own tenant.
    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: 'user.deactivate',
      entityType: 'User',
    });

    // Only CL_ADMIN is bound to its own tenant. OP is cross-tenant (root
    // CLAUDE.md §6, CORRECTION-001 ruling) and already creates agency users, so
    // it must be able to deactivate them across tenants too. Internal
    // (tenant-less) users stay AM-only via the check below.
    if (actor.role === 'CL_ADMIN' && actor.tenantId !== tenantId) {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'You can only deactivate users from your own tenant',
      );
    }

    // Internal (tenant-less) users can only be deactivated by AM. OP's
    // cross-tenant reach covers agency users only, not other internal (AM/OP)
    // accounts — mirroring create-user's privilege rules.
    if (tenantId === null && actor.role !== 'AM') {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'You are not allowed to deactivate internal users',
      );
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

    // Flip status to INACTIVE only — do NOT soft-delete. Setting deleted_at
    // would hide the row from every list (repositories filter deleted_at IS NULL)
    // and from update()/status-change, so a deactivated user would vanish instead
    // of showing as "Inactive" and could never be reactivated. Login is already
    // blocked by the INACTIVE status check in the login use case.
    // Flip status and revoke every session atomically; audit deferred to
    // after-commit so a rolled-back deactivation is never recorded.
    await runInTransaction(this.prisma, async (ctx) => {
      await this.userManagementRepo.update(userId, tenantId, { status: 'INACTIVE' }, ctx.tx);
      await this.userManagementRepo.revokeAllSessions(userId, ctx.tx);

      ctx.defer(async () => {
        this.auditService.log({
          action: 'user.deactivated',
          actorType: 'USER',
          actorId: actor.userId,
          entityType: 'User',
          entityId: userId,
          tenantId,
          requestId: input.requestId,
          before: { status: user.status },
          after: { status: 'INACTIVE' },
          reason,
        });
      });
    });
  }
}
