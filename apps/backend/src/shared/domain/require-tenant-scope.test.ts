import { describe, it, expect } from 'vitest';
import { UserRole } from '@properfy/shared';
import type { AuthContext } from '@properfy/shared';
import { requireTenantScope, assertTenantScope } from './require-tenant-scope';
import { ForbiddenError } from './errors';

function actor(role: UserRole, tenantId: string | null): AuthContext {
  return { userId: 'usr-1', tenantId, role, branchId: null, inspectorId: null };
}

const PINNED: UserRole[] = ['CL_ADMIN', 'CL_USER'];
const CROSS_TENANT: UserRole[] = ['AM', 'OP', 'SYS'];
/** Scoped by inspectorId / portal token — never by a tenant predicate. */
const OTHER_KEY: UserRole[] = ['INSP', 'TNT'];

describe('requireTenantScope', () => {
  describe('tenant-pinned roles', () => {
    it.each(PINNED)('returns the tenant %s is confined to', (role) => {
      expect(requireTenantScope(actor(role, 'tenant-1'), 'appointment.list')).toBe('tenant-1');
    });

    // The point of the helper: repositories apply the predicate behind a
    // truthiness check, so returning undefined here would mean "no filter" and
    // hand back every tenant's rows.
    it.each(PINNED)('refuses to proceed when %s has no tenant', (role) => {
      expect(() => requireTenantScope(actor(role, null), 'appointment.list')).toThrow(
        ForbiddenError,
      );
    });

    it('uses the shared code, not a second one for the same invariant', () => {
      try {
        requireTenantScope(actor('CL_USER', null), 'dashboard.stats');
        throw new Error('expected a throw');
      } catch (error) {
        expect((error as ForbiddenError).code).toBe('TENANT_SCOPE_REQUIRED');
      }
    });

    it('names the action so the failure points at the caller', () => {
      expect(() => requireTenantScope(actor('CL_ADMIN', null), 'audit.list')).toThrow(/audit\.list/);
    });

    // Falsy in exactly the way null is, so it unscopes in exactly the same way.
    it('treats an empty tenant id as no tenant', () => {
      expect(() => requireTenantScope(actor('CL_ADMIN', ''), 'appointment.list')).toThrow(
        ForbiddenError,
      );
    });
  });

  describe('cross-tenant roles', () => {
    // Their JWTs carry tenantId: null by design — "no tenant" means "all
    // tenants", and throwing would break every platform-wide listing.
    it.each(CROSS_TENANT)('returns undefined for %s with no tenant', (role) => {
      expect(requireTenantScope(actor(role, null), 'appointment.list')).toBeUndefined();
    });

    it('ignores a tenant an AM happens to carry rather than pinning them', () => {
      expect(requireTenantScope(actor('AM', 'tenant-1'), 'appointment.list')).toBeUndefined();
    });
  });

  describe('roles scoped by something other than tenant', () => {
    // INSP users are created with tenantId: null deliberately, and TNT arrives
    // through a portal token. Pinning them would 403 every inspector; treating
    // them as cross-tenant would leak every tenant. Reaching this helper at all
    // is a wiring mistake, and it says so instead of guessing.
    it.each(OTHER_KEY)('rejects %s loudly rather than guessing a tenant predicate', (role) => {
      expect(() => requireTenantScope(actor(role, null), 'appointment.list')).toThrow(
        /not scoped by tenant/i,
      );
    });

    it('does not disguise the wiring mistake as an authorization denial', () => {
      expect(() => requireTenantScope(actor('INSP', null), 'appointment.list')).not.toThrow(
        ForbiddenError,
      );
    });
  });

  // Guards the classification table itself: a role added to the enum without a
  // decision here fails to compile, and this catches the runtime half.
  it('classifies every role in the enum', () => {
    const classified = [...PINNED, ...CROSS_TENANT, ...OTHER_KEY].sort();
    expect(classified).toEqual(Object.values(UserRole).sort());
  });
});

describe('assertTenantScope', () => {
  it('returns a non-optional tenant for a caller already inside a pinned branch', () => {
    expect(assertTenantScope(actor('CL_ADMIN', 'tenant-1'), 'audit.list')).toBe('tenant-1');
  });

  it('throws when the tenant is missing', () => {
    expect(() => assertTenantScope(actor('CL_ADMIN', null), 'audit.list')).toThrow(ForbiddenError);
  });

  // It does not dispatch on role: the caller has already decided. Handing it an
  // AM must not silently produce an unscoped read.
  it('throws for a cross-tenant actor rather than returning undefined', () => {
    expect(() => assertTenantScope(actor('AM', null), 'audit.list')).toThrow(ForbiddenError);
  });
});
