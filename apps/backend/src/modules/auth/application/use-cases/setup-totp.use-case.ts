import type { IUserRepository } from '../../domain/user.repository';
import type { TotpService } from '../services/totp.service';
import type { TotpEncryptionService } from '../../infrastructure/totp-encryption.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { NotFoundError } from '../../../../shared/domain/errors';
import { TotpAlreadyEnabledError } from '../../domain/auth.errors';

export interface SetupTotpInput {
  userId: string;
}

export interface SetupTotpOutput {
  secret: string;
  qrUri: string;
}

export class SetupTotpUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly totpService: TotpService,
    private readonly auditService: AuditService,
    private readonly encryptionService: TotpEncryptionService,
  ) {}

  async execute(input: SetupTotpInput): Promise<SetupTotpOutput> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      throw new NotFoundError('USER_NOT_FOUND', 'User not found');
    }

    if (user.totpEnabled) {
      throw new TotpAlreadyEnabledError();
    }

    const secret = this.totpService.generateSecret();
    const storedSecret = this.encryptionService.encrypt(secret);

    await this.userRepo.updateTotpSecret(user.id, storedSecret);

    const qrUri = this.totpService.generateUri(user.email, secret);

    this.auditService.log({
      action: 'auth.totp_setup_initiated',
      actorType: 'USER',
      actorId: user.id,
      entityType: 'USER',
      entityId: user.id,
      tenantId: user.tenantId ?? undefined,
    });

    return { secret, qrUri };
  }
}
