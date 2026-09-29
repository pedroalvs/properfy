import bcrypt from 'bcryptjs';
import type { IUserRepository } from '../../domain/user.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { UnauthorizedError } from '../../../../shared/domain/errors';
import { InvalidCurrentPasswordError, TotpNotConfiguredError } from '../../domain/auth.errors';

export interface DisableTotpInput {
  userId: string;
  currentPassword: string;
}

/**
 * Self-service disable of the caller's own 2FA. Requires the current password so
 * a hijacked session cannot turn it off silently. Clears the secret as well as the
 * enabled flag, so a later re-enrolment regenerates a fresh secret instead of
 * hitting {@link TotpAlreadyEnabledError}.
 *
 * Note for AM accounts: 2FA is mandatory for AM, so disabling only takes effect
 * until the next login, which forces re-enrolment via the staged-token setup flow.
 */
export class DisableTotpUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: DisableTotpInput): Promise<void> {
    const user = await this.userRepo.findById(input.userId);
    if (!user || user.isDeleted()) {
      throw new UnauthorizedError('AUTH_UNAUTHORIZED', 'Authentication required');
    }

    const passwordValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!passwordValid) {
      throw new InvalidCurrentPasswordError();
    }

    if (!user.totpEnabled) {
      throw new TotpNotConfiguredError();
    }

    await this.userRepo.disableTotp(user.id);

    this.auditService.log({
      action: 'auth.totp_disabled',
      actorType: 'USER',
      actorId: user.id,
      entityType: 'USER',
      entityId: user.id,
      tenantId: user.tenantId ?? undefined,
    });
  }
}
