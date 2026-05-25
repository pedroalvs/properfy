import { TenantPortalTokenEntity } from './tenant-portal-token.entity';
import type { ITenantPortalTokenRepository } from './tenant-portal-token.repository';
import type { TokenService } from './token.service';
import type { TenantEntity } from '../../tenant/domain/tenant.entity';
import type { AppointmentEntity } from '../../appointment/domain/appointment.entity';

export interface MintPortalTokenResult {
  rawToken: string;
  expiresAt: Date;
}

export class MintPortalTokenService {
  constructor(
    private readonly tokenRepo: ITenantPortalTokenRepository,
    private readonly tokenService: TokenService,
  ) {}

  async mint(appointment: AppointmentEntity, tenant: TenantEntity): Promise<MintPortalTokenResult> {
    // H4: Guard against cross-tenant token minting
    if (tenant.id !== appointment.tenantId) {
      throw new Error(
        `Tenant mismatch: mint tenant ${tenant.id} ≠ appointment tenant ${appointment.tenantId}`,
      );
    }

    const rawToken = this.tokenService.generateRawToken();
    const tokenHash = this.tokenService.hashToken(rawToken);

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
    const tokenEntity = new TenantPortalTokenEntity({
      id: crypto.randomUUID(),
      appointmentId: appointment.id,
      tokenHash,
      expiresAt,
      status: 'ACTIVE',
      usedAt: null,
      lastAccessedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    // H4: Atomic revoke-and-save prevents a window with zero active tokens
    await this.tokenRepo.revokeAndSave(appointment.id, tokenEntity);

    return { rawToken, expiresAt };
  }
}
