import type { Prisma } from '@prisma/client';
import { RentalTenantPortalTokenEntity } from './rental-tenant-portal-token.entity';
import type { IRentalTenantPortalTokenRepository } from './rental-tenant-portal-token.repository';
import type { TokenService } from './token.service';
import type { ITokenEncrypter } from './token-encrypter';
import type { TenantEntity } from '../../tenant/domain/tenant.entity';
import type { AppointmentEntity } from '../../appointment/domain/appointment.entity';
import { retryOnUniqueConflict } from '../../../shared/domain/retry-on-unique-conflict';

export const TOKEN_HASH_COLUMN = 'token_hash';

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

  /**
   * A 10-char base62 token can collide, and the unique index on `token_hash` is
   * what detects it. Recovery is simply minting another token, so the write is
   * retried with a fresh one. Per mint the odds are roughly N/8.4e17 where N is
   * the number of rows already stored — note the index spans every row, revoked
   * and expired included, so N only ever grows.
   *
   * The retry only applies when `revokeAndSave` opens its own transaction.
   * A caller-owned `tx` is already aborted by the time Postgres reports the
   * violation, so that caller retries the whole unit of work itself — see
   * `GeneratePortalTokenUseCase`.
   */
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

    if (tx) {
      return this.mintOnce(appointment, tenant, tx);
    }
    return retryOnUniqueConflict(TOKEN_HASH_COLUMN, () => this.mintOnce(appointment, tenant));
  }

  private async mintOnce(
    appointment: AppointmentEntity,
    tenant: TenantEntity,
    tx?: Prisma.TransactionClient,
  ): Promise<MintPortalTokenResult> {
    const rawToken = this.tokenService.generateRawToken();
    const tokenHash = this.tokenService.hashToken(rawToken);
    const rawTokenEncrypted = this.tokenEncrypter ? this.tokenEncrypter.encrypt(rawToken) : null;

    const scheduledDateStr = appointment.scheduledDate.toISOString().split('T')[0]!;
    const settings = tenant.settingsJson ?? {};
    const cutoffHour = typeof settings.portalCutoffHour === 'number' ? settings.portalCutoffHour : 19;
    const cutoffDaysBefore =
      typeof settings.portalCutoffDaysBefore === 'number' ? settings.portalCutoffDaysBefore : 1;
    const confirmCutoffAt = this.tokenService.computeExpiresAt(
      scheduledDateStr,
      tenant.timezone,
      cutoffHour,
      cutoffDaysBefore,
    );
    // Token stays valid until the end of the scheduled day so a link generated after
    // the cutoff is never born expired; the cutoff only gates the confirm action.
    const endOfScheduledDay = this.tokenService.computeExpiresAt(scheduledDateStr, tenant.timezone, 24, 0);
    const expiresAt = endOfScheduledDay > confirmCutoffAt ? endOfScheduledDay : confirmCutoffAt;

    const now = new Date();
    const tokenId = crypto.randomUUID();
    const tokenEntity = new RentalTenantPortalTokenEntity({
      id: tokenId,
      appointmentId: appointment.id,
      tokenHash,
      expiresAt,
      confirmCutoffAt,
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
