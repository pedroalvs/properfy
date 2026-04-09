import bcrypt from 'bcryptjs';
import type { AuthContext } from '@properfy/shared';
import type { IUserManagementRepository } from '../../domain/user-management.repository';
import type { IPasswordHistoryRepository } from '../../../auth/domain/password-history.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { UserNotFoundError } from '../../domain/user-management.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';
import { validatePasswordStrength } from '../../../auth/domain/password-policy';
import {
  PasswordTooCommonError,
  PasswordSameAsCurrentError,
  PasswordTooWeakError,
  PasswordRecentlyUsedError,
} from '../../../auth/domain/auth.errors';
import { COMMON_PASSWORDS } from '../../../auth/application/constants/common-passwords';
import { checkPasswordHistory } from '../../../auth/application/helpers/check-password-history';

export interface ResetUserPasswordInput {
  tenantId: string | null;
  userId: string;
  newPassword: string;
  actor: AuthContext;
}

export class ResetUserPasswordUseCase {
  constructor(
    private readonly userManagementRepo: IUserManagementRepository,
    private readonly auditService: AuditService,
    private readonly passwordHistoryRepo: IPasswordHistoryRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: ResetUserPasswordInput): Promise<void> {
    const { tenantId, userId, newPassword, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'user.reset_password',
      entityType: 'User',
    });

    if (actor.userId === userId) {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'Use the account settings flow to change your own password',
      );
    }

    const user = await this.userManagementRepo.findByIdAndTenantId(userId, tenantId);
    if (!user) {
      throw new UserNotFoundError();
    }

    const strengthResult = validatePasswordStrength(newPassword);
    if (!strengthResult.valid) {
      throw new PasswordTooWeakError(strengthResult.violations);
    }

    if (COMMON_PASSWORDS.has(newPassword.toLowerCase())) {
      throw new PasswordTooCommonError();
    }

    const sameAsCurrent = await bcrypt.compare(newPassword, user.passwordHash);
    if (sameAsCurrent) {
      throw new PasswordSameAsCurrentError();
    }

    const recentlyUsed = await checkPasswordHistory(this.passwordHistoryRepo, userId, newPassword);
    if (recentlyUsed) {
      throw new PasswordRecentlyUsedError();
    }

    const oldHash = user.passwordHash;
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.userManagementRepo.resetPassword(userId, tenantId, passwordHash);

    await this.passwordHistoryRepo.save(userId, oldHash);
    await this.passwordHistoryRepo.pruneOldEntries(userId, 5);
    await this.userManagementRepo.revokeAllSessions(userId);

    this.auditService.log({
      action: 'user.password_reset',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'User',
      entityId: userId,
      tenantId: tenantId ?? undefined,
      metadata: {
        resetByRole: actor.role,
        unlockedAccount: user.status === 'LOCKED',
      },
    });
  }
}
