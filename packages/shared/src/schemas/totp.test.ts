import { describe, it, expect } from 'vitest';
import { setupTotpResponseSchema, confirmTotpSchema } from './totp';

describe('setupTotpResponseSchema', () => {
  it('accepts valid TOTP setup response', () => {
    const result = setupTotpResponseSchema.safeParse({
      secret: 'JBSWY3DPEHPK3PXP',
      qrUri: 'otpauth://totp/Properfy:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Properfy',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing secret', () => {
    const result = setupTotpResponseSchema.safeParse({ qrUri: 'otpauth://...' });
    expect(result.success).toBe(false);
  });
});

describe('confirmTotpSchema', () => {
  it('accepts valid 6-digit code', () => {
    const result = confirmTotpSchema.safeParse({ code: '123456' });
    expect(result.success).toBe(true);
  });

  it('rejects non-6-digit code', () => {
    const result = confirmTotpSchema.safeParse({ code: '12345' });
    expect(result.success).toBe(false);
  });

  it('rejects non-numeric code', () => {
    const result = confirmTotpSchema.safeParse({ code: 'abcdef' });
    expect(result.success).toBe(false);
  });
});
