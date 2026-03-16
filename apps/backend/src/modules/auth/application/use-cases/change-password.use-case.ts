import bcrypt from 'bcryptjs';
import type { IUserRepository } from '../../domain/user.repository';
import type { ISessionRepository } from '../../domain/session.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { ChangePasswordInput } from '../dtos/change-password.dto';
import {
  InvalidCurrentPasswordError,
  PasswordTooCommonError,
  PasswordSameAsCurrentError,
} from '../../domain/auth.errors';
import { COMMON_PASSWORDS } from '../constants/common-passwords';
import { UnauthorizedError } from '../../../../shared/domain/errors';

export class ChangePasswordUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly sessionRepo: ISessionRepository,
    private readonly auditService: AuditService,
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

    if (COMMON_PASSWORDS.has(input.newPassword.toLowerCase())) {
      throw new PasswordTooCommonError();
    }

    const sameAsCurrent = await bcrypt.compare(input.newPassword, user.passwordHash);
    if (sameAsCurrent) {
      throw new PasswordSameAsCurrentError();
    }

    const newHash = await bcrypt.hash(input.newPassword, 12);
    await this.userRepo.updatePassword(input.userId, newHash);

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
