import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import type { IPasswordResetTokenRepository } from '../../domain/password-reset-token.repository';
import type { IUserRepository } from '../../domain/user.repository';
import type { ISessionRepository } from '../../domain/session.repository';
import type { IPasswordHistoryRepository } from '../../domain/password-history.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { runInTransaction } from '../../../../shared/application/unit-of-work';
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
    private readonly prisma?: PrismaClient,
  ) {}

  async execute(input: ConsumePasswordResetInput): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(input.token).digest('hex');

    const tokenEntity = await this.passwordResetTokenRepo.findByTokenHash(tokenHash);
    if (!tokenEntity || !tokenEntity.isValid()) {
      throw new InvalidPasswordResetTokenError();
    }

    const user = await this.userRepo.findById(tokenEntity.userId);
    // #256: a token for a user who is no longer active must not reset a password
    // (and must not reveal, via a different error, that the account exists but is
    // inactive) — reject before any write.
    if (!user || !user.isActive()) {
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

    // One transaction: consume the token FIRST (atomic single-use guard, #249),
    // then rotate the password, record history and revoke sessions. If any write
    // fails the whole thing rolls back — no half-reset account, no burned token.
    // The audit is deferred so it never fires on a rolled-back transaction.
    await runInTransaction(this.prisma, async (ctx) => {
      const consumed = await this.passwordResetTokenRepo.consumeIfUnused(tokenEntity.id, ctx.tx);
      if (!consumed) {
        throw new InvalidPasswordResetTokenError();
      }

      await this.userRepo.updatePassword(user.id, newHash, ctx.tx);
      await this.passwordHistoryRepo.save(user.id, oldHash, ctx.tx);
      await this.passwordHistoryRepo.pruneOldEntries(user.id, 5, ctx.tx);
      await this.sessionRepo.revokeAllForUser(user.id, new Date(), ctx.tx);

      ctx.defer(async () => {
        this.auditService.log({
          action: 'auth.password_reset_consumed',
          actorType: 'ANONYMOUS',
          entityType: 'User',
          entityId: user.id,
        });
      });
    });
  }
}
