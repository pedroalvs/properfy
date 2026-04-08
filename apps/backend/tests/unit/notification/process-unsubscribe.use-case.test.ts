import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ProcessUnsubscribeUseCase,
  InvalidUnsubscribeTokenError,
  generateUnsubscribeToken,
  buildUnsubscribeUrl,
} from '../../../src/modules/notification/application/use-cases/process-unsubscribe.use-case';
import type { INotificationConsentRepository } from '../../../src/modules/notification/domain/notification-consent.repository';
import { NotificationConsentEntity } from '../../../src/modules/notification/domain/notification-consent.entity';

const SECRET = 'test-secret-for-unsubscribe';
const now = new Date('2026-04-06T10:00:00.000Z');

function makeSut() {
  const consentRepo: INotificationConsentRepository = {
    findByRecipientChannelTenant: vi.fn().mockResolvedValue(null),
    upsert: vi.fn(),
  };

  const useCase = new ProcessUnsubscribeUseCase(consentRepo, SECRET);

  return { consentRepo, useCase };
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
      const token1 = generateUnsubscribeToken('a@example.com', 'EMAIL', 'tenant-1', 'secret-1');
      const token2 = generateUnsubscribeToken('a@example.com', 'EMAIL', 'tenant-1', 'secret-2');
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
        'wrong-secret',
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
        optedOut: false,
        optedOutAt: null,
        createdAt: now,
        updatedAt: now,
      });
      vi.mocked(sut.consentRepo.findByRecipientChannelTenant).mockResolvedValue(existing);

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
  });
});
