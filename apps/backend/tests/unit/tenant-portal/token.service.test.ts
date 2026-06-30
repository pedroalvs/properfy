import { describe, it, expect } from 'vitest';
import { TokenService } from '../../../src/modules/rental-tenant-portal/domain/token.service';

describe('TokenService', () => {
  const service = new TokenService();

  describe('generateRawToken', () => {
    it('should return a 64-character hex string', () => {
      const token = service.generateRawToken();

      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should return different values on each call', () => {
      const token1 = service.generateRawToken();
      const token2 = service.generateRawToken();

      expect(token1).not.toBe(token2);
    });
  });

  describe('hashToken', () => {
    it('should return consistent SHA-256 hash for same input', () => {
      const raw = 'test-token-value';
      const hash1 = service.hashToken(raw);
      const hash2 = service.hashToken(raw);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should return different hash for different input', () => {
      const hash1 = service.hashToken('token-a');
      const hash2 = service.hashToken('token-b');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('computeExpiresAt', () => {
    it('should return 7PM day-before in Australia/Sydney timezone', () => {
      // 2026-04-10 scheduled, day-before is 2026-04-09
      // Australia/Sydney in April is AEST (UTC+10)
      // 19:00 AEST = 09:00 UTC
      const result = service.computeExpiresAt('2026-04-10', 'Australia/Sydney');

      expect(result.getUTCHours()).toBe(9);
      expect(result.getUTCDate()).toBe(9);
      expect(result.getUTCMonth()).toBe(3); // April = 3 (0-indexed)
      expect(result.getUTCFullYear()).toBe(2026);
      expect(result.getUTCMinutes()).toBe(0);
    });

    it('should return 7PM day-before in UTC timezone', () => {
      // 2026-04-10 scheduled, day-before is 2026-04-09
      // 19:00 UTC = 19:00 UTC
      const result = service.computeExpiresAt('2026-04-10', 'UTC');

      expect(result.getUTCHours()).toBe(19);
      expect(result.getUTCDate()).toBe(9);
      expect(result.getUTCMonth()).toBe(3);
      expect(result.getUTCFullYear()).toBe(2026);
    });

    it('should handle timezone with negative offset (America/New_York)', () => {
      // 2026-04-10 scheduled, day-before is 2026-04-09
      // America/New_York in April is EDT (UTC-4)
      // 19:00 EDT = 23:00 UTC
      const result = service.computeExpiresAt('2026-04-10', 'America/New_York');

      expect(result.getUTCHours()).toBe(23);
      expect(result.getUTCDate()).toBe(9);
      expect(result.getUTCMonth()).toBe(3);
      expect(result.getUTCFullYear()).toBe(2026);
    });

    it('should handle Australia/Sydney during daylight saving time (AEDT, UTC+11)', () => {
      // 2026-01-15 scheduled, day-before is 2026-01-14
      // Australia/Sydney in January is AEDT (UTC+11)
      // 19:00 AEDT = 08:00 UTC
      const result = service.computeExpiresAt('2026-01-15', 'Australia/Sydney');

      expect(result.getUTCHours()).toBe(8);
      expect(result.getUTCDate()).toBe(14);
      expect(result.getUTCMonth()).toBe(0); // January = 0
      expect(result.getUTCFullYear()).toBe(2026);
    });

    it('should handle first day of month (day-before crosses month boundary)', () => {
      // 2026-05-01 scheduled, day-before is 2026-04-30
      // UTC timezone for simplicity
      const result = service.computeExpiresAt('2026-05-01', 'UTC');

      expect(result.getUTCHours()).toBe(19);
      expect(result.getUTCDate()).toBe(30);
      expect(result.getUTCMonth()).toBe(3); // April = 3
      expect(result.getUTCFullYear()).toBe(2026);
    });

    it('should use custom cutoff hour when provided (17:00)', () => {
      // 2026-04-10 scheduled, day-before is 2026-04-09
      // 17:00 UTC
      const result = service.computeExpiresAt('2026-04-10', 'UTC', 17);

      expect(result.getUTCHours()).toBe(17);
      expect(result.getUTCDate()).toBe(9);
      expect(result.getUTCMonth()).toBe(3);
      expect(result.getUTCFullYear()).toBe(2026);
    });

    it('should default to 19:00 cutoff when not specified', () => {
      const resultDefault = service.computeExpiresAt('2026-04-10', 'UTC');
      const resultExplicit = service.computeExpiresAt('2026-04-10', 'UTC', 19);

      expect(resultDefault.getTime()).toBe(resultExplicit.getTime());
    });

    it('should use custom cutoff hour with timezone (17:00 AEST)', () => {
      // 2026-04-10 scheduled, day-before is 2026-04-09
      // Australia/Sydney in April is AEST (UTC+10)
      // 17:00 AEST = 07:00 UTC
      const result = service.computeExpiresAt('2026-04-10', 'Australia/Sydney', 17);

      expect(result.getUTCHours()).toBe(7);
      expect(result.getUTCDate()).toBe(9);
      expect(result.getUTCMonth()).toBe(3);
      expect(result.getUTCFullYear()).toBe(2026);
    });

    it('should use custom daysBefore when provided (2 days before)', () => {
      // 2026-04-10 scheduled, 2 days before is 2026-04-08
      // 19:00 UTC
      const result = service.computeExpiresAt('2026-04-10', 'UTC', 19, 2);

      expect(result.getUTCHours()).toBe(19);
      expect(result.getUTCDate()).toBe(8);
      expect(result.getUTCMonth()).toBe(3);
      expect(result.getUTCFullYear()).toBe(2026);
    });

    it('should handle daysBefore = 0 (same day as scheduled)', () => {
      // 2026-04-10 scheduled, 0 days before is 2026-04-10
      // 19:00 UTC
      const result = service.computeExpiresAt('2026-04-10', 'UTC', 19, 0);

      expect(result.getUTCHours()).toBe(19);
      expect(result.getUTCDate()).toBe(10);
      expect(result.getUTCMonth()).toBe(3);
      expect(result.getUTCFullYear()).toBe(2026);
    });

    it('should handle custom cutoff and daysBefore together with timezone', () => {
      // 2026-04-10 scheduled, 3 days before is 2026-04-07
      // Australia/Sydney in April is AEST (UTC+10)
      // 15:00 AEST = 05:00 UTC
      const result = service.computeExpiresAt('2026-04-10', 'Australia/Sydney', 15, 3);

      expect(result.getUTCHours()).toBe(5);
      expect(result.getUTCDate()).toBe(7);
      expect(result.getUTCMonth()).toBe(3);
      expect(result.getUTCFullYear()).toBe(2026);
    });
  });
});
