import { describe, it, expect } from 'vitest';
import {
  loginResponseSchema,
  refreshResponseSchema,
  meResponseSchema,
  portalDataResponseSchema,
} from './responses';

describe('loginResponseSchema', () => {
  const validLogin = {
    accessToken: 'access-token-value',
    refreshToken: 'refresh-token-value',
    user: {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Test User',
      email: 'test@example.com',
      role: 'CL_ADMIN',
      tenantId: 'b1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b22',
    },
  };

  it('should accept valid login response', () => {
    const result = loginResponseSchema.safeParse(validLogin);
    expect(result.success).toBe(true);
  });

  it('should accept null tenantId', () => {
    const result = loginResponseSchema.safeParse({
      ...validLogin,
      user: { ...validLogin.user, tenantId: null },
    });
    expect(result.success).toBe(true);
  });

  it('should not require expiresIn', () => {
    const result = loginResponseSchema.safeParse(validLogin);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('expiresIn');
    }
  });
});

describe('refreshResponseSchema', () => {
  const validRefresh = {
    accessToken: 'new-access-token',
    refreshToken: 'new-refresh-token',
  };

  it('should accept valid refresh response', () => {
    const result = refreshResponseSchema.safeParse(validRefresh);
    expect(result.success).toBe(true);
  });

  it('should not require expiresIn', () => {
    const result = refreshResponseSchema.safeParse(validRefresh);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('expiresIn');
    }
  });
});

describe('meResponseSchema', () => {
  const validMe = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    name: 'Test User',
    email: 'test@example.com',
    role: 'AM',
    tenantId: null,
    branchId: null,
    totpEnabled: true,
    phone: '+61412345678',
    status: 'ACTIVE',
    lastLoginAt: '2026-03-17T10:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('should accept valid me response with all fields', () => {
    const result = meResponseSchema.safeParse(validMe);
    expect(result.success).toBe(true);
  });

  it('should accept null phone and lastLoginAt', () => {
    const result = meResponseSchema.safeParse({
      ...validMe,
      phone: null,
      lastLoginAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing phone field', () => {
    const { phone: _phone, ...without } = validMe;
    const result = meResponseSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it('should reject missing status field', () => {
    const { status: _status, ...without } = validMe;
    const result = meResponseSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it('should reject missing createdAt field', () => {
    const { createdAt: _createdAt, ...without } = validMe;
    const result = meResponseSchema.safeParse(without);
    expect(result.success).toBe(false);
  });
});

describe('portalDataResponseSchema', () => {
  it('should accept restrictions as object', () => {
    const result = portalDataResponseSchema.safeParse({
      token: { status: 'ACTIVE', isReadOnly: false, expiresAt: '2026-04-01T00:00:00.000Z' },
      appointment: { id: '123' },
      contact: null,
      restrictions: { isHome: true, notes: 'Ring bell' },
    });
    expect(result.success).toBe(true);
  });

  it('should accept restrictions as null', () => {
    const result = portalDataResponseSchema.safeParse({
      token: { status: 'ACTIVE', isReadOnly: false, expiresAt: '2026-04-01T00:00:00.000Z' },
      appointment: { id: '123' },
      contact: null,
      restrictions: null,
    });
    expect(result.success).toBe(true);
  });

  it('should accept missing restrictions (defaults to undefined)', () => {
    const result = portalDataResponseSchema.safeParse({
      token: { status: 'ACTIVE', isReadOnly: false, expiresAt: '2026-04-01T00:00:00.000Z' },
      appointment: { id: '123' },
      contact: null,
    });
    expect(result.success).toBe(true);
  });

  it('should accept existingResponse metadata when present', () => {
    const result = portalDataResponseSchema.safeParse({
      token: { status: 'ACTIVE', isReadOnly: false, expiresAt: '2026-04-01T00:00:00.000Z' },
      appointment: { id: '123' },
      contact: null,
      restrictions: null,
      existingResponse: {
        type: 'CONFIRMED',
        createdAt: '2026-03-20T10:00:00.000Z',
        summary: 'Tenant confirmed attendance',
      },
    });
    expect(result.success).toBe(true);
  });
});
