import { describe, it, expect } from 'vitest';
import { loginSchema, refreshSchema, changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } from './auth';

describe('loginSchema', () => {
  it('should validate valid login input', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('should normalize email to lowercase', () => {
    const result = loginSchema.parse({
      email: 'USER@EXAMPLE.COM',
      password: 'password123',
    });
    expect(result.email).toBe('user@example.com');
  });

  it('should reject invalid email', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('should reject email longer than 254 chars', () => {
    const result = loginSchema.safeParse({
      email: 'a'.repeat(249) + '@b.com',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('should accept optional totpCode of 6 digits', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 'password123',
      totpCode: '123456',
    });
    expect(result.success).toBe(true);
  });

  it('should reject totpCode not exactly 6 chars', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 'password123',
      totpCode: '12345',
    });
    expect(result.success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  it('should accept valid strong password', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'OldPass1!',
      newPassword: 'NewPass1!',
    });
    expect(result.success).toBe(true);
  });

  it('should reject password without uppercase', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'OldPass1!',
      newPassword: 'newpass1!',
    });
    expect(result.success).toBe(false);
  });

  it('should reject password without lowercase', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'OldPass1!',
      newPassword: 'NEWPASS1!',
    });
    expect(result.success).toBe(false);
  });

  it('should reject password without number', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'OldPass1!',
      newPassword: 'NewPass!!',
    });
    expect(result.success).toBe(false);
  });

  it('should reject password without special char', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'OldPass1!',
      newPassword: 'NewPass12',
    });
    expect(result.success).toBe(false);
  });

  it('should reject password shorter than 8 chars', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'OldPass1!',
      newPassword: 'Ab1!',
    });
    expect(result.success).toBe(false);
  });
});

describe('refreshSchema', () => {
  it('should accept non-empty refresh token', () => {
    const result = refreshSchema.safeParse({ refreshToken: 'abc123' });
    expect(result.success).toBe(true);
  });

  it('should reject empty refresh token', () => {
    const result = refreshSchema.safeParse({ refreshToken: '' });
    expect(result.success).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('should accept valid email', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'user@example.com' });
    expect(result.success).toBe(true);
  });

  it('should normalize email to lowercase', () => {
    const result = forgotPasswordSchema.parse({ email: 'USER@EXAMPLE.COM' });
    expect(result.email).toBe('user@example.com');
  });

  it('should reject invalid email', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'not-an-email' });
    expect(result.success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('should accept valid token and strong password', () => {
    const result = resetPasswordSchema.safeParse({
      token: 'abc123',
      newPassword: 'NewPass1!',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty token', () => {
    const result = resetPasswordSchema.safeParse({
      token: '',
      newPassword: 'NewPass1!',
    });
    expect(result.success).toBe(false);
  });

  it('should reject weak password', () => {
    const result = resetPasswordSchema.safeParse({
      token: 'abc123',
      newPassword: 'weak',
    });
    expect(result.success).toBe(false);
  });

  it('should reject password without special char', () => {
    const result = resetPasswordSchema.safeParse({
      token: 'abc123',
      newPassword: 'NewPass12',
    });
    expect(result.success).toBe(false);
  });
});
