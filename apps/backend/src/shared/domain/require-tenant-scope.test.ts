import { describe, it, expect } from 'vitest';
import type { AuthContext, UserRole } from '@properfy/shared';
import { requireTenantScope } from './require-tenant-scope';
import { ForbiddenError } from './errors';

function actor(role: UserRole, tenantId: string | null): AuthContext {
  return { userId: 'usr-1', tenantId, role, branchId: null, inspectorId: null };
}

describe('requireTenantScope', () => {
  describe('tenant-pinned roles', () => {
    const pinned: UserRole[] = ['CL_ADMIN', 'CL_USER', 'INSP'];

    it.each(pinned)('returns the tenant %s is confined to', (role) => {
      expect(requireTenantScope(actor(role, 'tenant-1'), 'appointment.list')).toBe('tenant-1');
    });

    // The whole point: repositories apply the tenant predicate behind a
    // truthiness check, so returning undefined here would mean "no filter" and
    // hand back every tenant's rows.
    it.each(pinned)('refuses to proceed when %s has no tenant', (role) => {
      expect(() => requireTenantScope(actor(role, null), 'appointment.list')).toThrow(
        ForbiddenError,
      );
    });

    it('names the action in the error so the log points at the caller', () => {
      expect(() => requireTenantScope(actor('CL_ADMIN', null), 'audit.list')).toThrow(
        /audit\.list/,
      );
    });

    it('uses a distinct code, not a generic 403', () => {
      try {
        requireTenantScope(actor('CL_USER', null), 'dashboard.stats');
        throw new Error('expected a throw');
      } catch (error) {
        expect((error as ForbiddenError).code).toBe('AUTH_TENANT_SCOPE_MISSING');
      }
    });

    // An empty string is falsy in exactly the same way null is, so it unscopes
    // exactly the same way.
    it('treats an empty tenant id as no tenant', () => {
      expect(() => requireTenantScope(actor('CL_ADMIN', ''), 'appointment.list')).toThrow(
        ForbiddenError,
      );
    });
  });

  describe('cross-tenant roles', () => {
    // AM/OP JWTs carry tenantId: null by design — for them "no tenant" means
    // "all tenants", and throwing would break every platform-wide listing.
    it.each(['AM', 'OP'] as UserRole[])('returns undefined for %s with no tenant', (role) => {
      expect(requireTenantScope(actor(role, null), 'appointment.list')).toBeUndefined();
    });

    it('ignores a tenant id an AM happens to carry, rather than pinning them', () => {
      expect(requireTenantScope(actor('AM', 'tenant-1'), 'appointment.list')).toBeUndefined();
    });
  });
});
