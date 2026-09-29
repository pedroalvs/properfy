import type { PrismaClient } from '@prisma/client';
import type { AuthContext } from '@properfy/shared';
import type { IUserManagementRepository } from '../../domain/user-management.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { runInTransaction } from '../../../../shared/application/unit-of-work';
import { UserNotFoundError } from '../../domain/user-management.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';

export interface ResetUserTotpInput {
  tenantId: string | null;
  userId: string;
  actor: AuthContext;
  requestId?: string;
}

/**
 * Admin 2FA reset — turns a target user's 2FA off and clears their secret, then
 * revokes their sessions so they must re-authenticate. Recovery path for a user
 * who lost their authenticator. Mirrors {@link ResetUserPasswordUseCase}: AM/OP
 * only, `tenantId === null` for internal users and a specific tenant for agency
 * users. An AM target is prompted to re-enrol at next login (2FA is mandatory
 * for AM); a non-AM target is simply left without 2FA.
 */
export class ResetUserTotpUseCase {
  constructor(
    private readonly userManagementRepo: IUserManagementRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly prisma?: PrismaClient,
  ) {}

  async execute(input: ResetUserTotpInput): Promise<void> {
    const { tenantId, userId, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'user.reset_totp',
      entityType: 'User',
    });

    if (actor.userId === userId) {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'Use the account settings flow to manage your own two-factor authentication',
      );
    }

    const user = await this.userManagementRepo.findByIdAndTenantId(userId, tenantId);
    if (!user) {
      throw new UserNotFoundError();
    }

    // Reset 2FA and revoke sessions atomically; audit deferred to after-commit so
    // it never records a rolled-back reset.
    await runInTransaction(this.prisma, async (ctx) => {
      await this.userManagementRepo.resetTotp(userId, tenantId, ctx.tx);
      await this.userManagementRepo.revokeAllSessions(userId, ctx.tx);

      ctx.defer(async () => {
        this.auditService.log({
          action: 'user.totp_reset',
          actorType: 'USER',
          actorId: actor.userId,
          entityType: 'User',
          entityId: userId,
          tenantId: tenantId ?? undefined,
          requestId: input.requestId,
          metadata: {
            resetByRole: actor.role,
            targetRole: user.role,
            targetWasEnrolled: user.totpEnabled,
          },
        });
      });
    });
  }
}
