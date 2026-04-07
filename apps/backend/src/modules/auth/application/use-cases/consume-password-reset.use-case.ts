import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { IPasswordResetTokenRepository } from '../../domain/password-reset-token.repository';
import type { IUserRepository } from '../../domain/user.repository';
import type { ISessionRepository } from '../../domain/session.repository';
import type { IPasswordHistoryRepository } from '../../domain/password-history.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import {
  InvalidPasswordResetTokenError,
  PasswordTooWeakError,
  PasswordTooCommonError,
  PasswordRecentlyUsedError,
} from '../../domain/auth.errors';
import { validatePasswordStrength } from '../../domain/password-policy';
import { COMMON_PASSWORDS } from '../constants/common-passwords';
import { checkPasswordHistory } from '../helpers/check-password-history';

export interface ConsumePasswordResetInput {
  token: string;
  newPassword: string;
}

export class ConsumePasswordResetUseCase {
  constructor(
    private readonly passwordResetTokenRepo: IPasswordResetTokenRepository,
    private readonly userRepo: IUserRepository,
    private readonly sessionRepo: ISessionRepository,
    private readonly auditService: AuditService,
    private readonly passwordHistoryRepo: IPasswordHistoryRepository,
  ) {}

  async execute(input: ConsumePasswordResetInput): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(input.token).digest('hex');

    const tokenEntity = await this.passwordResetTokenRepo.findByTokenHash(tokenHash);
    if (!tokenEntity || !tokenEntity.isValid()) {
      throw new InvalidPasswordResetTokenError();
    }

    const user = await this.userRepo.findById(tokenEntity.userId);
    if (!user) {
      throw new InvalidPasswordResetTokenError();
    }

    const strengthResult = validatePasswordStrength(input.newPassword);
    if (!strengthResult.valid) {
      throw new PasswordTooWeakError(strengthResult.violations);
    }

    if (COMMON_PASSWORDS.has(input.newPassword.toLowerCase())) {
      throw new PasswordTooCommonError();
    }

    const recentlyUsed = await checkPasswordHistory(this.passwordHistoryRepo, user.id, input.newPassword);
    if (recentlyUsed) {
      throw new PasswordRecentlyUsedError();
    }

    const oldHash = user.passwordHash;
    const newHash = await bcrypt.hash(input.newPassword, 12);
    await this.userRepo.updatePassword(user.id, newHash);

    await this.passwordHistoryRepo.save(user.id, oldHash);
    await this.passwordHistoryRepo.pruneOldEntries(user.id, 5);

    await this.sessionRepo.revokeAllForUser(user.id, new Date());

    await this.passwordResetTokenRepo.markUsed(tokenEntity.id);

    this.auditService.log({
      action: 'auth.password_reset_consumed',
      actorType: 'ANONYMOUS',
      entityType: 'User',
      entityId: user.id,
    });
  }
}
