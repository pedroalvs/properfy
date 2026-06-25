import type { IUserRepository } from '../../domain/user.repository';
import type { TotpService } from '../services/totp.service';
import type { TotpEncryptionService } from '../../infrastructure/totp-encryption.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { NotFoundError } from '../../../../shared/domain/errors';
import { TotpInvalidError, TotpNotConfiguredError } from '../../domain/auth.errors';

export interface ConfirmTotpInput {
  userId: string;
  totpCode: string;
}

export class ConfirmTotpUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly totpService: TotpService,
    private readonly auditService: AuditService,
    private readonly encryptionService: TotpEncryptionService,
  ) {}

  async execute(input: ConfirmTotpInput): Promise<void> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      throw new NotFoundError('USER_NOT_FOUND', 'User not found');
    }

    if (!user.totpSecret) {
      throw new TotpNotConfiguredError();
    }

    const decryptedSecret = this.encryptionService.decrypt(user.totpSecret);

    const isValid = this.totpService.verify(input.totpCode, decryptedSecret);
    if (!isValid) {
      throw new TotpInvalidError();
    }

    await this.userRepo.updateTotpEnabled(user.id, true);

    this.auditService.log({
      action: 'auth.totp_enabled',
      actorType: 'USER',
      actorId: user.id,
      entityType: 'USER',
      entityId: user.id,
      tenantId: user.tenantId ?? undefined,
    });
  }
}
