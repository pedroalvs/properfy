import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ProcessUnsubscribeUseCase,
  InvalidUnsubscribeTokenError,
  generateUnsubscribeToken,
  buildUnsubscribeUrl,
} from '../../../src/modules/notification/application/use-cases/process-unsubscribe.use-case';
import type { INotificationConsentRepository } from '../../../src/modules/notification/domain/notification-consent.repository';
import { NotificationConsentEntity } from '../../../src/modules/notification/domain/notification-consent.entity';
import { UnsubscribeTokenService } from '../../../src/modules/notification/domain/unsubscribe-token.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';

const SECRET = 'test-secret-for-unsubscribe-16+';
const now = new Date('2026-04-06T10:00:00.000Z');

function makeSut() {
  const consentRepo: INotificationConsentRepository = {
    findByRecipientChannelTenant: vi.fn().mockResolvedValue(null),
    findByScope: vi.fn().mockResolvedValue(null),
    listByRecipient: vi.fn().mockResolvedValue([]),
    countSkippedForRecipient: vi.fn().mockResolvedValue(0),
    findById: vi.fn().mockResolvedValue(null),
    upsert: vi.fn(),
  };

  const tokenService = new UnsubscribeTokenService(SECRET);
  const auditService: AuditService = { log: vi.fn() };
  const useCase = new ProcessUnsubscribeUseCase(consentRepo, tokenService, auditService);

  return { consentRepo, tokenService, auditService, useCase };
}

describe('ProcessUnsubscribeUseCase', () => {
  describe('generateUnsubscribeToken', () => {
    it('should generate a token in the format payload.signature', () => {
      const token = generateUnsubscribeToken('user@example.com', 'EMAIL', 'tenant-1', SECRET);
      const parts = token.split('.');
      expect(parts).toHaveLength(2);
      expect(parts[0]!.length).toBeGreaterThan(0);
      expect(parts[1]!.length).toBeGreaterThan(0);
    });

    it('should produce different tokens for different recipients', () => {
      const token1 = generateUnsubscribeToken('a@example.com', 'EMAIL', 'tenant-1', SECRET);
      const token2 = generateUnsubscribeToken('b@example.com', 'EMAIL', 'tenant-1', SECRET);
      expect(token1).not.toBe(token2);
    });

    it('should produce different tokens for different secrets', () => {
      const token1 = generateUnsubscribeToken('a@example.com', 'EMAIL', 'tenant-1', 'secret-one-with-16-chars');
      const token2 = generateUnsubscribeToken('a@example.com', 'EMAIL', 'tenant-1', 'secret-two-with-16-chars');
      expect(token1).not.toBe(token2);
    });
  });

  describe('buildUnsubscribeUrl', () => {
    it('should build a URL with the token', () => {
      const url = buildUnsubscribeUrl(
        'https://api.properfy.com',
        'user@example.com',
        'EMAIL',
        'tenant-1',
        SECRET,
      );
      expect(url).toContain('https://api.properfy.com/v1/notifications/unsubscribe?token=');
      expect(url).toContain('.');
    });
  });

  describe('execute', () => {
    let sut: ReturnType<typeof makeSut>;

    beforeEach(() => {
      vi.clearAllMocks();
      sut = makeSut();
    });

    it('should throw InvalidUnsubscribeTokenError for empty token', async () => {
      await expect(sut.useCase.execute({ token: '' })).rejects.toThrow(
        InvalidUnsubscribeTokenError,
      );
    });

    it('should throw InvalidUnsubscribeTokenError for token without dot', async () => {
      await expect(sut.useCase.execute({ token: 'invalid-no-dot' })).rejects.toThrow(
        InvalidUnsubscribeTokenError,
      );
    });

    it('should throw InvalidUnsubscribeTokenError for tampered signature', async () => {
      const token = generateUnsubscribeToken('user@example.com', 'EMAIL', 'tenant-1', SECRET);
      const [payload] = token.split('.');
      const tamperedToken = `${payload}.tampered-signature`;

      await expect(sut.useCase.execute({ token: tamperedToken })).rejects.toThrow(
        InvalidUnsubscribeTokenError,
      );
    });

    it('should throw InvalidUnsubscribeTokenError for wrong secret', async () => {
      const token = generateUnsubscribeToken(
        'user@example.com',
        'EMAIL',
        'tenant-1',
        'a-wrong-secret-with-16-chars',
      );

      await expect(sut.useCase.execute({ token })).rejects.toThrow(
        InvalidUnsubscribeTokenError,
      );
    });

    it('should create a new consent record when none exists', async () => {
      const token = generateUnsubscribeToken('user@example.com', 'EMAIL', 'tenant-1', SECRET);

      const result = await sut.useCase.execute({ token });

      expect(result.recipient).toBe('user@example.com');
      expect(result.channel).toBe('EMAIL');
      expect(result.tenantId).toBe('tenant-1');
      expect(sut.consentRepo.upsert).toHaveBeenCalledTimes(1);
      const consent = vi.mocked(sut.consentRepo.upsert).mock.calls[0][0];
      expect(consent.optedOut).toBe(true);
      expect(consent.optedOutAt).toBeInstanceOf(Date);
    });

    it('should update existing consent record to opted out', async () => {
      const existing = new NotificationConsentEntity({
        id: 'consent-existing',
        recipient: 'user@example.com',
        channel: 'EMAIL',
        tenantId: 'tenant-1',
        notificationClass: 'OPERATIONAL',
        optedOut: false,
        optedOutAt: null,
        changeSource: null,
        changedAt: null,
        changedByUserId: null,
        reason: null,
        createdAt: now,
        updatedAt: now,
      });
      vi.mocked(sut.consentRepo.findByScope).mockResolvedValue(existing);

      const token = generateUnsubscribeToken('user@example.com', 'EMAIL', 'tenant-1', SECRET);

      const result = await sut.useCase.execute({ token });

      expect(result.recipient).toBe('user@example.com');
      expect(sut.consentRepo.upsert).toHaveBeenCalledTimes(1);
      const consent = vi.mocked(sut.consentRepo.upsert).mock.calls[0][0];
      expect(consent.id).toBe('consent-existing');
      expect(consent.optedOut).toBe(true);
      expect(consent.optedOutAt).toBeInstanceOf(Date);
    });

    it('should handle SMS channel unsubscribe', async () => {
      const token = generateUnsubscribeToken('+61400000000', 'SMS', 'tenant-2', SECRET);

      const result = await sut.useCase.execute({ token });

      expect(result.recipient).toBe('+61400000000');
      expect(result.channel).toBe('SMS');
      expect(result.tenantId).toBe('tenant-2');
    });

    // Feature 018 US1: audit trail and per-class scoping
    describe('feature 018 audit & scoping', () => {
      it('writes one audit record per opt-out with action consent.opted_out_via_link', async () => {
        const token = generateUnsubscribeToken('user@example.com', 'EMAIL', 'tenant-1', SECRET);

        await sut.useCase.execute({ token, requestId: 'req-1', ipAddress: '1.2.3.4' });

        expect(sut.auditService.log).toHaveBeenCalledTimes(1);
        const entry = vi.mocked(sut.auditService.log).mock.calls[0][0];
        expect(entry.action).toBe('consent.opted_out_via_link');
        expect(entry.actorType).toBe('ANONYMOUS');
        expect(entry.entityType).toBe('NotificationConsent');
        expect(entry.tenantId).toBe('tenant-1');
        expect(entry.requestId).toBe('req-1');
        expect(entry.ipAddress).toBe('1.2.3.4');
        expect(entry.metadata).toMatchObject({
          recipient: 'user@example.com',
          channel: 'EMAIL',
          notificationClass: 'OPERATIONAL',
        });
      });

      it('defaults tokens to OPERATIONAL class scoping', async () => {
        const token = generateUnsubscribeToken('user@example.com', 'EMAIL', 'tenant-1', SECRET);

        await sut.useCase.execute({ token });

        const scopeCall = vi.mocked(sut.consentRepo.findByScope).mock.calls[0][0];
        expect(scopeCall.notificationClass).toBe('OPERATIONAL');
      });

      it('supports MARKETING class tokens', async () => {
        const tokenService = new UnsubscribeTokenService(SECRET);
        const token = tokenService.generate({
          recipient: 'user@example.com',
          channel: 'EMAIL',
          tenantId: 'tenant-1',
          notificationClass: 'MARKETING',
        });

        const result = await sut.useCase.execute({ token });

        expect(result.notificationClass).toBe('MARKETING');
        const consent = vi.mocked(sut.consentRepo.upsert).mock.calls[0][0];
        expect(consent.notificationClass).toBe('MARKETING');
      });

      it('rejects a token whose payload declares TRANSACTIONAL class', async () => {
        const tokenService = new UnsubscribeTokenService(SECRET);
        const token = tokenService.generate({
          recipient: 'user@example.com',
          channel: 'EMAIL',
          tenantId: 'tenant-1',
          notificationClass: 'TRANSACTIONAL',
        });

        await expect(sut.useCase.execute({ token })).rejects.toThrow(InvalidUnsubscribeTokenError);
        expect(sut.consentRepo.upsert).not.toHaveBeenCalled();
        expect(sut.auditService.log).not.toHaveBeenCalled();
      });

      it('rejects an expired token with a reason of expired', async () => {
        const tokenService = new UnsubscribeTokenService(SECRET);
        const oldToken = tokenService.generate({
          recipient: 'user@example.com',
          channel: 'EMAIL',
          tenantId: 'tenant-1',
          now: new Date('2025-01-01T00:00:00.000Z'),
          ttlSeconds: 10, // expires 10 seconds after issuance
        });

        await expect(sut.useCase.execute({ token: oldToken })).rejects.toThrow(
          InvalidUnsubscribeTokenError,
        );
      });
    });
  });
});
