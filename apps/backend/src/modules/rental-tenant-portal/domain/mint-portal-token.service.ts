import type { Prisma } from '@prisma/client';
import { RentalTenantPortalTokenEntity } from './rental-tenant-portal-token.entity';
import type { IRentalTenantPortalTokenRepository } from './rental-tenant-portal-token.repository';
import type { TokenService } from './token.service';
import type { ITokenEncrypter } from './token-encrypter';
import type { TenantEntity } from '../../tenant/domain/tenant.entity';
import type { AppointmentEntity } from '../../appointment/domain/appointment.entity';

export interface MintPortalTokenResult {
  rawToken: string;
  expiresAt: Date;
  tokenId: string;
}

export class MintPortalTokenService {
  constructor(
    private readonly tokenRepo: IRentalTenantPortalTokenRepository,
    private readonly tokenService: TokenService,
    private readonly tokenEncrypter?: ITokenEncrypter,
  ) {}

  async mint(
    appointment: AppointmentEntity,
    tenant: TenantEntity,
    tx?: Prisma.TransactionClient,
  ): Promise<MintPortalTokenResult> {
    // Guard against cross-tenant token minting
    if (tenant.id !== appointment.tenantId) {
      throw new Error(
        `Tenant mismatch: mint tenant ${tenant.id} ≠ appointment tenant ${appointment.tenantId}`,
      );
    }

    const rawToken = this.tokenService.generateRawToken();
    const tokenHash = this.tokenService.hashToken(rawToken);
    const rawTokenEncrypted = this.tokenEncrypter ? this.tokenEncrypter.encrypt(rawToken) : null;

    const scheduledDateStr = appointment.scheduledDate.toISOString().split('T')[0]!;
    const settings = tenant.settingsJson ?? {};
    const cutoffHour = typeof settings.portalCutoffHour === 'number' ? settings.portalCutoffHour : 19;
    const cutoffDaysBefore =
      typeof settings.portalCutoffDaysBefore === 'number' ? settings.portalCutoffDaysBefore : 1;
    const expiresAt = this.tokenService.computeExpiresAt(
      scheduledDateStr,
      tenant.timezone,
      cutoffHour,
      cutoffDaysBefore,
    );

    const now = new Date();
    const tokenId = crypto.randomUUID();
    const tokenEntity = new RentalTenantPortalTokenEntity({
      id: tokenId,
      appointmentId: appointment.id,
      tokenHash,
      expiresAt,
      status: 'ACTIVE',
      usedAt: null,
      lastAccessedAt: null,
      rawTokenEncrypted,
      confirmationCycleId: null,
      createdAt: now,
      updatedAt: now,
    });

    // Atomic revoke-and-save prevents a window with zero active tokens
    await this.tokenRepo.revokeAndSave(appointment.id, tokenEntity, tx);

    return { rawToken, expiresAt, tokenId };
  }
}
