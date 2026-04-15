import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReOptInUseCase } from '../../../src/modules/notification/application/use-cases/re-opt-in.use-case';
import type { INotificationConsentRepository } from '../../../src/modules/notification/domain/notification-consent.repository';
import { NotificationConsentEntity } from '../../../src/modules/notification/domain/notification-consent.entity';
import { UnsubscribeTokenService } from '../../../src/modules/notification/domain/unsubscribe-token.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { InvalidUnsubscribeTokenError } from '../../../src/modules/notification/application/use-cases/process-unsubscribe.use-case';

const SECRET = 'test-secret-for-re-opt-in-16+';
const now = new Date('2026-04-06T10:00:00.000Z');

describe('ReOptInUseCase', () => {
  let consentRepo: INotificationConsentRepository;
  let tokenService: UnsubscribeTokenService;
  let auditService: AuditService;
  let useCase: ReOptInUseCase;

  beforeEach(() => {
    consentRepo = {
      findByRecipientChannelTenant: vi.fn(),
      findByScope: vi.fn().mockResolvedValue(null),
      listByRecipient: vi.fn(),
      countSkippedForRecipient: vi.fn(),
      findById: vi.fn(),
      upsert: vi.fn(),
    };
    tokenService = new UnsubscribeTokenService(SECRET);
    auditService = { log: vi.fn() };
    useCase = new ReOptInUseCase(consentRepo, tokenService, auditService);
  });

  it('flips an existing opted-out record back to opted-in', async () => {
    const existing = new NotificationConsentEntity({
      id: 'consent-1',
      recipient: 'user@example.com',
      channel: 'EMAIL',
      tenantId: 'tenant-1',
      notificationClass: 'OPERATIONAL',
      optedOut: true,
      optedOutAt: now,
      changeSource: 'unsubscribe_link',
      changedAt: now,
      changedByUserId: null,
      reason: null,
      createdAt: now,
      updatedAt: now,
    });
    vi.mocked(consentRepo.findByScope).mockResolvedValue(existing);

    const token = tokenService.generate({
      recipient: 'user@example.com',
      channel: 'EMAIL',
      tenantId: 'tenant-1',
    });

    const result = await useCase.execute({ token });

    expect(result.recipient).toBe('user@example.com');
    expect(consentRepo.upsert).toHaveBeenCalledTimes(1);
    const consent = vi.mocked(consentRepo.upsert).mock.calls[0][0];
    expect(consent.optedOut).toBe(false);
    expect(consent.changeSource).toBe('re_opt_in');
  });

  it('creates a new opted-in record when none exists', async () => {
    const token = tokenService.generate({
      recipient: 'user@example.com',
      channel: 'EMAIL',
      tenantId: 'tenant-1',
    });

    await useCase.execute({ token });

    expect(consentRepo.upsert).toHaveBeenCalledTimes(1);
    const consent = vi.mocked(consentRepo.upsert).mock.calls[0][0];
    expect(consent.optedOut).toBe(false);
    expect(consent.changeSource).toBe('re_opt_in');
  });

  it('writes one audit record with consent.re_opted_in_via_link action', async () => {
    const token = tokenService.generate({
      recipient: 'user@example.com',
      channel: 'EMAIL',
      tenantId: 'tenant-1',
    });

    await useCase.execute({ token, requestId: 'req-99', ipAddress: '1.2.3.4' });

    expect(auditService.log).toHaveBeenCalledTimes(1);
    const entry = vi.mocked(auditService.log).mock.calls[0][0];
    expect(entry.action).toBe('consent.re_opted_in_via_link');
    expect(entry.actorType).toBe('ANONYMOUS');
    expect(entry.entityType).toBe('NotificationConsent');
    expect(entry.tenantId).toBe('tenant-1');
    expect(entry.requestId).toBe('req-99');
    expect(entry.ipAddress).toBe('1.2.3.4');
  });

  it('rejects an expired token', async () => {
    const oldToken = tokenService.generate({
      recipient: 'user@example.com',
      channel: 'EMAIL',
      tenantId: 'tenant-1',
      now: new Date('2025-01-01T00:00:00.000Z'),
      ttlSeconds: 10,
    });

    await expect(useCase.execute({ token: oldToken })).rejects.toThrow(
      InvalidUnsubscribeTokenError,
    );
    expect(consentRepo.upsert).not.toHaveBeenCalled();
  });

  it('rejects a tampered token', async () => {
    const token = tokenService.generate({
      recipient: 'user@example.com',
      channel: 'EMAIL',
      tenantId: 'tenant-1',
    });
    const [payload] = token.split('.');
    const tampered = `${payload}.${'x'.repeat(44)}`;

    await expect(useCase.execute({ token: tampered })).rejects.toThrow(
      InvalidUnsubscribeTokenError,
    );
  });

  it('rejects a TRANSACTIONAL token', async () => {
    const token = tokenService.generate({
      recipient: 'user@example.com',
      channel: 'EMAIL',
      tenantId: 'tenant-1',
      notificationClass: 'TRANSACTIONAL',
    });

    await expect(useCase.execute({ token })).rejects.toThrow(InvalidUnsubscribeTokenError);
  });
});
