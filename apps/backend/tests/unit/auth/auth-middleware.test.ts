import { describe, it, expect, vi } from 'vitest';
import { createAuthMiddleware } from '../../../src/shared/interfaces/auth-middleware';

function makeRequest(token?: string) {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    authContext: undefined,
  } as any;
}

const reply = {} as any;

describe('createAuthMiddleware', () => {
  it('should reject request without auth header', async () => {
    const middleware = createAuthMiddleware(vi.fn());
    await expect(middleware(makeRequest(), reply)).rejects.toThrow('Authentication required');
  });

  it('should set authContext from JWT', async () => {
    const ctx = { userId: 'u1', tenantId: 't1', role: 'AM', branchId: null, inspectorId: null };
    const verifier = vi.fn().mockResolvedValue(ctx);
    const middleware = createAuthMiddleware(verifier);
    const req = makeRequest('valid-token');
    await middleware(req, reply);
    expect(req.authContext).toEqual(ctx);
  });

  it('should reject CL_ADMIN with INACTIVE tenant', async () => {
    const ctx = { userId: 'u1', tenantId: 't1', role: 'CL_ADMIN', branchId: null, inspectorId: null };
    const verifier = vi.fn().mockResolvedValue(ctx);
    const checker = vi.fn().mockResolvedValue(false);
    const middleware = createAuthMiddleware(verifier, checker);

    await expect(middleware(makeRequest('token'), reply)).rejects.toThrow('Tenant account is not active');
    expect(checker).toHaveBeenCalledWith('t1');
  });

  it('should reject CL_USER with INACTIVE tenant', async () => {
    const ctx = { userId: 'u1', tenantId: 't1', role: 'CL_USER', branchId: null, inspectorId: null };
    const verifier = vi.fn().mockResolvedValue(ctx);
    const checker = vi.fn().mockResolvedValue(false);
    const middleware = createAuthMiddleware(verifier, checker);

    await expect(middleware(makeRequest('token'), reply)).rejects.toThrow('Tenant account is not active');
  });

  it('should allow CL_ADMIN with ACTIVE tenant', async () => {
    const ctx = { userId: 'u1', tenantId: 't1', role: 'CL_ADMIN', branchId: null, inspectorId: null };
    const verifier = vi.fn().mockResolvedValue(ctx);
    const checker = vi.fn().mockResolvedValue(true);
    const middleware = createAuthMiddleware(verifier, checker);
    const req = makeRequest('token');

    await middleware(req, reply);
    expect(req.authContext).toEqual(ctx);
  });

  it('should skip tenant check for AM role', async () => {
    const ctx = { userId: 'u1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
    const verifier = vi.fn().mockResolvedValue(ctx);
    const checker = vi.fn();
    const middleware = createAuthMiddleware(verifier, checker);
    const req = makeRequest('token');

    await middleware(req, reply);
    expect(checker).not.toHaveBeenCalled();
    expect(req.authContext).toEqual(ctx);
  });

  it('should skip tenant check for OP role but require tenantId', async () => {
    // Sprint 1 W-4-IMPL (CORRECTION-001 close-it, 2026-04-13): OP is now
    // tenant-scoped. A JWT claiming role=OP with tenantId=null is invalid.
    const ctx = { userId: 'u1', tenantId: 'op-tenant', role: 'OP', branchId: null, inspectorId: null };
    const verifier = vi.fn().mockResolvedValue(ctx);
    const checker = vi.fn();
    const middleware = createAuthMiddleware(verifier, checker);
    const req = makeRequest('token');

    await middleware(req, reply);
    // checker is only called for CL_ADMIN / CL_USER — OP still skips it,
    // same as AM, because OP is trusted not to need active-tenant validation.
    expect(checker).not.toHaveBeenCalled();
  });

  it('should reject OP JWT with null tenantId (CORRECTION-001 close-it)', async () => {
    const ctx = { userId: 'u1', tenantId: null, role: 'OP', branchId: null, inspectorId: null };
    const verifier = vi.fn().mockResolvedValue(ctx);
    const middleware = createAuthMiddleware(verifier, vi.fn());
    const req = makeRequest('token');
    await expect(middleware(req, reply)).rejects.toThrow(/tenant/i);
  });

  it('should skip tenant check for INSP role', async () => {
    const ctx = { userId: 'u1', tenantId: 'insp-tenant', role: 'INSP', branchId: null, inspectorId: 'i1' };
    const verifier = vi.fn().mockResolvedValue(ctx);
    const checker = vi.fn();
    const middleware = createAuthMiddleware(verifier, checker);
    const req = makeRequest('token');

    await middleware(req, reply);
    expect(checker).not.toHaveBeenCalled();
  });

  it('should work without tenant checker (backward compatible)', async () => {
    const ctx = { userId: 'u1', tenantId: 't1', role: 'CL_ADMIN', branchId: null, inspectorId: null };
    const verifier = vi.fn().mockResolvedValue(ctx);
    const middleware = createAuthMiddleware(verifier);
    const req = makeRequest('token');

    await middleware(req, reply);
    expect(req.authContext).toEqual(ctx);
  });
});
