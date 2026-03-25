import bcrypt from 'bcryptjs';
import type { AuthContext } from '@properfy/shared';
import type { IUserManagementRepository } from '../../domain/user-management.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { UserNotFoundError } from '../../domain/user-management.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';
import { validatePasswordStrength } from '../../../auth/domain/password-policy';
import {
  PasswordTooCommonError,
  PasswordSameAsCurrentError,
  PasswordTooWeakError,
} from '../../../auth/domain/auth.errors';
import { COMMON_PASSWORDS } from '../../../auth/application/constants/common-passwords';

export interface ResetUserPasswordInput {
  tenantId: string;
  userId: string;
  newPassword: string;
  actor: AuthContext;
}

export class ResetUserPasswordUseCase {
  constructor(
    private readonly userManagementRepo: IUserManagementRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: ResetUserPasswordInput): Promise<void> {
    const { tenantId, userId, newPassword, actor } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'You are not allowed to reset user passwords',
      );
    }

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

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.userManagementRepo.resetPassword(userId, tenantId, passwordHash);
    await this.userManagementRepo.revokeAllSessions(userId);

    this.auditService.log({
      action: 'user.password_reset',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'User',
      entityId: userId,
      tenantId,
      metadata: {
        resetByRole: actor.role,
        unlockedAccount: user.status === 'LOCKED',
      },
    });
  }
}
