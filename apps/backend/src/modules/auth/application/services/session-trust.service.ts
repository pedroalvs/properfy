import type { ISessionRepository } from '../../domain/session.repository';
import type { IGeoIpService } from '../../../../shared/infrastructure/geoip.service';
import { computeDeviceFingerprint } from '../../../../shared/infrastructure/device-fingerprint.service';

export interface TrustSignal {
  isNewCountry: boolean;
  isNewDevice: boolean;
  requiresStepUp: boolean;
  countryCode: string | null;
  deviceFingerprint: string | null;
}

export class SessionTrustService {
  constructor(
    private readonly sessionRepo: ISessionRepository,
    private readonly geoIpService: IGeoIpService,
  ) {}

  async evaluate(userId: string, ipAddress: string | null | undefined, userAgent: string | null | undefined): Promise<TrustSignal> {
    const countryCode = ipAddress ? await this.geoIpService.resolveCountry(ipAddress) : null;
    const deviceFingerprint = computeDeviceFingerprint(userAgent);

    // Get user's recent sessions (last 30 days)
    const recentSessions = await this.sessionRepo.findRecentByUserId(userId, 30);

    const knownCountries = new Set(
      recentSessions.map((s) => s.countryCode).filter(Boolean),
    );
    const knownDevices = new Set(
      recentSessions.map((s) => s.deviceFingerprint).filter(Boolean),
    );

    // First login (no history) is always trusted — no anomaly flags
    const isNewCountry =
      countryCode !== null && knownCountries.size > 0 && !knownCountries.has(countryCode);
    const isNewDevice =
      deviceFingerprint !== null && knownDevices.size > 0 && !knownDevices.has(deviceFingerprint);

    // Require step-up auth only when BOTH country and device are new (strongest signal)
    const requiresStepUp = isNewCountry && isNewDevice;

    return { isNewCountry, isNewDevice, requiresStepUp, countryCode, deviceFingerprint };
  }
}
