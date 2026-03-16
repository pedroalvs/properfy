import { describe, it, expect, beforeEach } from 'vitest';
import { TotpService } from '../../../src/modules/auth/application/services/totp.service';

describe('TotpService', () => {
  let totpService: TotpService;

  beforeEach(() => {
    totpService = new TotpService();
  });

  it('should generate a TOTP secret', () => {
    const secret = totpService.generateSecret();
    expect(secret).toBeDefined();
    expect(secret.length).toBeGreaterThan(0);
  });

  it('should generate and verify a valid TOTP token', () => {
    const secret = totpService.generateSecret();
    const token = totpService.generateToken(secret);
    expect(totpService.verify(token, secret)).toBe(true);
  });

  it('should reject an invalid TOTP token', () => {
    const secret = totpService.generateSecret();
    expect(totpService.verify('000000', secret)).toBe(false);
  });

  it('should generate an otpauth URI', () => {
    const secret = totpService.generateSecret();
    const uri = totpService.generateUri('user@example.com', secret);
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('Properfy');
  });

  it('should return false for malformed tokens without throwing', () => {
    const secret = totpService.generateSecret();
    expect(totpService.verify('not-a-number', secret)).toBe(false);
  });
});
