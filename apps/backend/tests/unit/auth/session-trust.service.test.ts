import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionTrustService } from '../../../src/modules/auth/application/services/session-trust.service';
import type { ISessionRepository } from '../../../src/modules/auth/domain/session.repository';
import type { IGeoIpService } from '../../../src/shared/infrastructure/geoip.service';
import { SessionEntity } from '../../../src/modules/auth/domain/session.entity';

function makeSession(overrides: Partial<ConstructorParameters<typeof SessionEntity>[0]> = {}): SessionEntity {
  return new SessionEntity({
    id: 'session-1',
    userId: 'user-1',
    refreshTokenHash: 'hash',
    ipAddress: '1.2.3.4',
    userAgent: 'Mozilla/5.0',
    countryCode: 'AU',
    deviceFingerprint: 'abc123def456abcd',
    expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  });
}

describe('SessionTrustService', () => {
  let sessionRepo: ISessionRepository;
  let geoIpService: IGeoIpService;
  let service: SessionTrustService;

  beforeEach(() => {
    sessionRepo = {
      create: vi.fn(),
      findByRefreshTokenHash: vi.fn(),
      findById: vi.fn(),
      findActiveByUserId: vi.fn(),
      updateRefreshToken: vi.fn(),
      revoke: vi.fn(),
      revokeAllForUser: vi.fn(),
      findRecentByUserId: vi.fn().mockResolvedValue([]),
      deleteExpiredBefore: vi.fn(),
    };
    geoIpService = {
      resolveCountry: vi.fn().mockResolvedValue('AU'),
    };
    service = new SessionTrustService(sessionRepo, geoIpService);
  });

  it('should report no anomaly when no recent sessions exist (first login)', async () => {
    vi.mocked(sessionRepo.findRecentByUserId).mockResolvedValue([]);
    vi.mocked(geoIpService.resolveCountry).mockResolvedValue('US');

    const result = await service.evaluate('user-1', '8.8.8.8', 'Mozilla/5.0 Chrome/125');

    expect(result.isNewCountry).toBe(false);
    expect(result.isNewDevice).toBe(false);
    expect(result.requiresStepUp).toBe(false);
    expect(result.countryCode).toBe('US');
    expect(result.deviceFingerprint).toBeDefined();
  });

  it('should report no anomaly when same country and same device', async () => {
    const fingerprint = (await import('../../../src/shared/infrastructure/device-fingerprint.service')).computeDeviceFingerprint('Mozilla/5.0 Chrome/125');
    vi.mocked(sessionRepo.findRecentByUserId).mockResolvedValue([
      makeSession({ countryCode: 'AU', deviceFingerprint: fingerprint }),
    ]);
    vi.mocked(geoIpService.resolveCountry).mockResolvedValue('AU');

    const result = await service.evaluate('user-1', '1.2.3.4', 'Mozilla/5.0 Chrome/125');

    expect(result.isNewCountry).toBe(false);
    expect(result.isNewDevice).toBe(false);
    expect(result.requiresStepUp).toBe(false);
  });

  it('should detect new country with known device', async () => {
    const fingerprint = (await import('../../../src/shared/infrastructure/device-fingerprint.service')).computeDeviceFingerprint('Mozilla/5.0 Chrome/125');
    vi.mocked(sessionRepo.findRecentByUserId).mockResolvedValue([
      makeSession({ countryCode: 'AU', deviceFingerprint: fingerprint }),
    ]);
    vi.mocked(geoIpService.resolveCountry).mockResolvedValue('BR');

    const result = await service.evaluate('user-1', '200.100.50.1', 'Mozilla/5.0 Chrome/125');

    expect(result.isNewCountry).toBe(true);
    expect(result.isNewDevice).toBe(false);
    expect(result.requiresStepUp).toBe(false);
  });

  it('should detect new device with known country', async () => {
    vi.mocked(sessionRepo.findRecentByUserId).mockResolvedValue([
      makeSession({ countryCode: 'AU', deviceFingerprint: 'known-fingerprint1' }),
    ]);
    vi.mocked(geoIpService.resolveCountry).mockResolvedValue('AU');

    const result = await service.evaluate('user-1', '1.2.3.4', 'Completely Different Agent');

    expect(result.isNewCountry).toBe(false);
    expect(result.isNewDevice).toBe(true);
    expect(result.requiresStepUp).toBe(false);
  });

  it('should require step-up when both country and device are new', async () => {
    vi.mocked(sessionRepo.findRecentByUserId).mockResolvedValue([
      makeSession({ countryCode: 'AU', deviceFingerprint: 'known-fingerprint1' }),
    ]);
    vi.mocked(geoIpService.resolveCountry).mockResolvedValue('BR');

    const result = await service.evaluate('user-1', '200.100.50.1', 'Completely Different Agent');

    expect(result.isNewCountry).toBe(true);
    expect(result.isNewDevice).toBe(true);
    expect(result.requiresStepUp).toBe(true);
  });

  it('should return null countryCode for null IP', async () => {
    const result = await service.evaluate('user-1', null, 'Mozilla/5.0');

    expect(result.countryCode).toBeNull();
    expect(geoIpService.resolveCountry).not.toHaveBeenCalled();
  });

  it('should return null deviceFingerprint for null userAgent', async () => {
    const result = await service.evaluate('user-1', '1.2.3.4', null);

    expect(result.deviceFingerprint).toBeNull();
  });
});
