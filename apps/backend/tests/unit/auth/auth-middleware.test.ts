import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createAuthMiddleware,
  setDefaultTimezoneResolver,
} from '../../../src/shared/interfaces/auth-middleware';

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

  it('should allow OP JWT with a tenantId and skip the active-tenant check', async () => {
    const ctx = { userId: 'u1', tenantId: 'op-tenant', role: 'OP', branchId: null, inspectorId: null };
    const verifier = vi.fn().mockResolvedValue(ctx);
    const checker = vi.fn();
    const middleware = createAuthMiddleware(verifier, checker);
    const req = makeRequest('token');

    await middleware(req, reply);
    // checker is only called for CL_ADMIN / CL_USER — OP skips it like AM.
    expect(checker).not.toHaveBeenCalled();
    expect(req.authContext).toEqual(ctx);
  });

  // Regression guard (QA 2026-04-19): OP is cross-tenant per CLAUDE.md §6,
  // so a JWT with `role=OP` and `tenantId=null` must be accepted. A prior
  // middleware guard rejected these tokens and broke every OP request.
  it('should allow OP JWT with null tenantId (cross-tenant OP)', async () => {
    const ctx = { userId: 'u1', tenantId: null, role: 'OP', branchId: null, inspectorId: null };
    const verifier = vi.fn().mockResolvedValue(ctx);
    const checker = vi.fn();
    const middleware = createAuthMiddleware(verifier, checker);
    const req = makeRequest('token');

    await middleware(req, reply);
    expect(checker).not.toHaveBeenCalled();
    expect(req.authContext).toEqual(ctx);
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

  describe('effective timezone resolution', () => {
    afterEach(() => {
      setDefaultTimezoneResolver(null);
    });

    const baseCtx = { userId: 'u1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

    it('fills ctx.timezone via an explicitly provided resolver', async () => {
      const verifier = vi.fn().mockResolvedValue({ ...baseCtx });
      const resolver = vi.fn().mockResolvedValue('Pacific/Auckland');
      const middleware = createAuthMiddleware(verifier, undefined, undefined, resolver);
      const req = makeRequest('token');

      await middleware(req, reply);
      expect(req.authContext?.timezone).toBe('Pacific/Auckland');
      expect(resolver).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }));
    });

    it('falls back to the module default resolver when none is passed', async () => {
      setDefaultTimezoneResolver(async () => 'Australia/Perth');
      const verifier = vi.fn().mockResolvedValue({ ...baseCtx });
      const middleware = createAuthMiddleware(verifier);
      const req = makeRequest('token');

      await middleware(req, reply);
      expect(req.authContext?.timezone).toBe('Australia/Perth');
    });

    it('leaves ctx.timezone undefined when no resolver exists', async () => {
      const verifier = vi.fn().mockResolvedValue({ ...baseCtx });
      const middleware = createAuthMiddleware(verifier);
      const req = makeRequest('token');

      await middleware(req, reply);
      expect(req.authContext?.timezone).toBeUndefined();
    });

    it('degrades to the platform timezone when the resolver throws', async () => {
      const verifier = vi.fn().mockResolvedValue({ ...baseCtx });
      const resolver = vi.fn().mockRejectedValue(new Error('db down'));
      const middleware = createAuthMiddleware(verifier, undefined, undefined, resolver);
      const req = makeRequest('token');

      await middleware(req, reply);
      expect(req.authContext?.timezone).toBe('Australia/Sydney');
    });
  });
});
