import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { IPasswordResetTokenRepository } from '../../domain/password-reset-token.repository';
import type { IUserRepository } from '../../domain/user.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import {
  InvalidInviteTokenError,
  PasswordTooWeakError,
  PasswordTooCommonError,
} from '../../domain/auth.errors';
import { validatePasswordStrength } from '../../domain/password-policy';
import { COMMON_PASSWORDS } from '../constants/common-passwords';

export interface AcceptInviteInput {
  token: string;
  password: string;
}

export class AcceptInviteUseCase {
  constructor(
    private readonly passwordResetTokenRepo: IPasswordResetTokenRepository,
    private readonly userRepo: IUserRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: AcceptInviteInput): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(input.token).digest('hex');

    const tokenEntity = await this.passwordResetTokenRepo.findByTokenHash(tokenHash);
    if (!tokenEntity || !tokenEntity.isValid()) {
      throw new InvalidInviteTokenError();
    }

    const user = await this.userRepo.findById(tokenEntity.userId);
    if (!user) {
      throw new InvalidInviteTokenError();
    }

    if (!user.isPendingInvite()) {
      throw new InvalidInviteTokenError();
    }

    // Validate password strength
    const strengthResult = validatePasswordStrength(input.password);
    if (!strengthResult.valid) {
      throw new PasswordTooWeakError(strengthResult.violations);
    }

    if (COMMON_PASSWORDS.has(input.password.toLowerCase())) {
      throw new PasswordTooCommonError();
    }

    // Hash password and activate user
    const passwordHash = await bcrypt.hash(input.password, 12);
    await this.userRepo.activateUser(user.id, passwordHash);

    // Mark token as used
    await this.passwordResetTokenRepo.markUsed(tokenEntity.id);

    // Audit
    this.auditService.log({
      action: 'user.invite_accepted',
      actorType: 'ANONYMOUS',
      entityType: 'User',
      entityId: user.id,
      tenantId: user.tenantId ?? undefined,
    });
  }
}
