import { describe, it, expect } from 'vitest';
import { validatePasswordStrength } from '../../../src/modules/auth/domain/password-policy';

describe('validatePasswordStrength', () => {
  it('should pass for a valid password', () => {
    const result = validatePasswordStrength('Str0ng!Pa$$');
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('should pass for exactly 8 characters valid password', () => {
    const result = validatePasswordStrength('Ab1!xxxx');
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('should fail for too short password', () => {
    const result = validatePasswordStrength('Ab1!xxx');
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('Password must be at least 8 characters');
  });

  it('should fail for missing uppercase letter', () => {
    const result = validatePasswordStrength('str0ng!pass');
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('Password must contain at least one uppercase letter');
  });

  it('should fail for missing lowercase letter', () => {
    const result = validatePasswordStrength('STR0NG!PASS');
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('Password must contain at least one lowercase letter');
  });

  it('should fail for missing digit', () => {
    const result = validatePasswordStrength('Strong!Pass');
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('Password must contain at least one digit');
  });

  it('should fail for missing special character', () => {
    const result = validatePasswordStrength('Str0ngPass');
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('Password must contain at least one special character');
  });

  it('should return multiple violations at once', () => {
    const result = validatePasswordStrength('abc');
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(3);
    expect(result.violations).toContain('Password must be at least 8 characters');
    expect(result.violations).toContain('Password must contain at least one uppercase letter');
    expect(result.violations).toContain('Password must contain at least one digit');
    expect(result.violations).toContain('Password must contain at least one special character');
  });

  // WI-12: max-length rule (>128 chars invalid; 128 chars valid).
  it('should fail for a 129-character password with the max-length violation', () => {
    const password = 'Aa1!' + 'x'.repeat(125); // 129 chars total
    expect(password).toHaveLength(129);
    const result = validatePasswordStrength(password);
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('Password must be at most 128 characters');
  });

  it('should pass for an otherwise-valid 128-character password', () => {
    const password = 'Aa1!' + 'x'.repeat(124); // 128 chars total
    expect(password).toHaveLength(128);
    const result = validatePasswordStrength(password);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});
