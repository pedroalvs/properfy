import { describe, it, expect } from 'vitest';
import { RenderUnsubscribePageUseCase } from '../../../src/modules/notification/application/use-cases/render-unsubscribe-page.use-case';
import { UnsubscribeTokenService } from '../../../src/modules/notification/domain/unsubscribe-token.service';

describe('RenderUnsubscribePageUseCase', () => {
  const secret = 'test-secret-at-least-sixteen-characters';
  const tokenService = new UnsubscribeTokenService(secret);
  const useCase = new RenderUnsubscribePageUseCase(tokenService);

  it('returns ok + metadata for a valid OPERATIONAL token', () => {
    const token = tokenService.generate({
      recipient: 'user@example.com',
      channel: 'EMAIL',
      tenantId: 'tenant-1',
      notificationClass: 'OPERATIONAL',
    });

    const result = useCase.execute({ token });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recipient).toBe('user@example.com');
      expect(result.channel).toBe('EMAIL');
      expect(result.tenantId).toBe('tenant-1');
      expect(result.notificationClass).toBe('OPERATIONAL');
    }
  });

  it('returns expired for an expired token', () => {
    const oldToken = tokenService.generate({
      recipient: 'user@example.com',
      channel: 'EMAIL',
      tenantId: 'tenant-1',
      now: new Date('2025-01-01T00:00:00.000Z'),
      ttlSeconds: 10,
    });

    const result = useCase.execute({ token: oldToken });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('expired');
    }
  });

  it('returns invalid for a malformed token', () => {
    const result = useCase.execute({ token: 'clearly-not-a-token' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid');
    }
  });

  it('returns invalid for a tampered token', () => {
    const token = tokenService.generate({
      recipient: 'user@example.com',
      channel: 'EMAIL',
      tenantId: 'tenant-1',
    });
    const [payload] = token.split('.');
    const tampered = `${payload}.${'x'.repeat(44)}`;

    const result = useCase.execute({ token: tampered });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid');
    }
  });

  it('returns invalid when the token declares TRANSACTIONAL class', () => {
    const token = tokenService.generate({
      recipient: 'user@example.com',
      channel: 'EMAIL',
      tenantId: 'tenant-1',
      notificationClass: 'TRANSACTIONAL',
    });

    const result = useCase.execute({ token });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid');
    }
  });

  it('accepts MARKETING class', () => {
    const token = tokenService.generate({
      recipient: 'user@example.com',
      channel: 'EMAIL',
      tenantId: 'tenant-1',
      notificationClass: 'MARKETING',
    });

    const result = useCase.execute({ token });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notificationClass).toBe('MARKETING');
    }
  });

  it('does not mutate any state — multiple calls return the same result', () => {
    const token = tokenService.generate({
      recipient: 'a@b.com',
      channel: 'EMAIL',
      tenantId: 't-1',
    });

    const a = useCase.execute({ token });
    const b = useCase.execute({ token });

    expect(a).toEqual(b);
  });
});
