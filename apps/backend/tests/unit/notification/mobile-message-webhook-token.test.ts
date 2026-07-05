import { describe, it, expect } from 'vitest';
import { isMobileMessageTokenValid } from '../../../src/modules/notification/interfaces/notification.routes';

describe('isMobileMessageTokenValid', () => {
  it('rejects every request when no token is configured (no bypass in any environment)', () => {
    expect(isMobileMessageTokenValid(undefined, undefined)).toBe(false);
    expect(isMobileMessageTokenValid('any-token', undefined)).toBe(false);
    expect(isMobileMessageTokenValid(undefined, '')).toBe(false);
    expect(isMobileMessageTokenValid('any-token', '')).toBe(false);
  });

  it('rejects when token is configured but not provided in request', () => {
    expect(isMobileMessageTokenValid(undefined, 'secret')).toBe(false);
  });

  it('rejects when token is configured and provided token does not match', () => {
    expect(isMobileMessageTokenValid('wrong', 'secret')).toBe(false);
    expect(isMobileMessageTokenValid('', 'secret')).toBe(false);
    expect(isMobileMessageTokenValid('secre', 'secret')).toBe(false);
    expect(isMobileMessageTokenValid('secret1', 'secret')).toBe(false);
  });

  it('accepts when token is configured and provided token matches exactly', () => {
    expect(isMobileMessageTokenValid('secret', 'secret')).toBe(true);
    expect(isMobileMessageTokenValid('abc123XYZ!', 'abc123XYZ!')).toBe(true);
  });

  it('uses constant-time comparison (different lengths return false without throwing)', () => {
    // timingSafeEqual throws on length mismatch — isMobileMessageTokenValid must catch it
    expect(() => isMobileMessageTokenValid('short', 'much-longer-token')).not.toThrow();
    expect(isMobileMessageTokenValid('short', 'much-longer-token')).toBe(false);
  });
});
