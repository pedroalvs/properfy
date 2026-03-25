import { describe, it, expect } from 'vitest';
import { isValidEmail, getPasswordStrength } from './validation';

describe('isValidEmail', () => {
  it('accepts valid emails', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('a.b@sub.domain.co')).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('no-at-sign')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('@domain.com')).toBe(false);
    expect(isValidEmail('user@d')).toBe(false);
  });
});

describe('getPasswordStrength', () => {
  it('returns "Too short" for passwords under 8 chars', () => {
    expect(getPasswordStrength('Ab1!')).toEqual({ score: 0, label: 'Too short' });
  });

  it('returns "Weak" for single-class passwords', () => {
    expect(getPasswordStrength('abcdefgh').score).toBe(1);
  });

  it('returns "Fair" for two-class passwords', () => {
    expect(getPasswordStrength('abcdefgh1').score).toBe(2);
  });

  it('returns "Good" for three-class passwords', () => {
    expect(getPasswordStrength('abcdefG1').score).toBe(3);
  });

  it('returns "Strong" for complex passwords', () => {
    expect(getPasswordStrength('MyP@ssw0rd!!').score).toBe(4);
  });
});
