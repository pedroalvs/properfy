import bcrypt from 'bcryptjs';
import type { IUserRepository } from '../../domain/user.repository';
import type { ISessionRepository } from '../../domain/session.repository';
import type { IPasswordHistoryRepository } from '../../domain/password-history.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { ChangePasswordInput } from '../dtos/change-password.dto';
import {
  InvalidCurrentPasswordError,
  PasswordTooCommonError,
  PasswordSameAsCurrentError,
  PasswordTooWeakError,
  PasswordRecentlyUsedError,
} from '../../domain/auth.errors';
import { validatePasswordStrength } from '../../domain/password-policy';
import { COMMON_PASSWORDS } from '../constants/common-passwords';
import { UnauthorizedError } from '../../../../shared/domain/errors';
import { checkPasswordHistory } from '../helpers/check-password-history';

export class ChangePasswordUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly sessionRepo: ISessionRepository,
    private readonly auditService: AuditService,
    private readonly passwordHistoryRepo: IPasswordHistoryRepository,
  ) {}

  async execute(input: ChangePasswordInput): Promise<void> {
    const user = await this.userRepo.findById(input.userId);
    if (!user || user.isDeleted()) {
      throw new UnauthorizedError('AUTH_UNAUTHORIZED', 'Authentication required');
    }

    const currentPasswordValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!currentPasswordValid) {
      throw new InvalidCurrentPasswordError();
    }

    const strengthResult = validatePasswordStrength(input.newPassword);
    if (!strengthResult.valid) {
      throw new PasswordTooWeakError(strengthResult.violations);
    }

    if (COMMON_PASSWORDS.has(input.newPassword.toLowerCase())) {
      throw new PasswordTooCommonError();
    }

    const sameAsCurrent = await bcrypt.compare(input.newPassword, user.passwordHash);
    if (sameAsCurrent) {
      throw new PasswordSameAsCurrentError();
    }

    const recentlyUsed = await checkPasswordHistory(this.passwordHistoryRepo, input.userId, input.newPassword);
    if (recentlyUsed) {
      throw new PasswordRecentlyUsedError();
    }

    const oldHash = user.passwordHash;
    const newHash = await bcrypt.hash(input.newPassword, 12);
    await this.userRepo.updatePassword(input.userId, newHash);

    await this.passwordHistoryRepo.save(input.userId, oldHash);
    await this.passwordHistoryRepo.pruneOldEntries(input.userId, 5);

    const sessions = await this.sessionRepo.findActiveByUserId(input.userId);
    await this.sessionRepo.revokeAllForUser(input.userId, new Date());

    this.auditService.log({
      action: 'auth.password_changed',
      actorType: 'USER',
      actorId: input.userId,
      entityType: 'USER',
      entityId: input.userId,
      metadata: { sessionCount: sessions.length },
    });
  }
}
