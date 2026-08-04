import { describe, it, expect, vi } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { createEffectiveTimezoneResolver } from '../../../src/shared/infrastructure/effective-timezone-resolver';

function ctxFor(overrides: Partial<AuthContext>): AuthContext {
  return {
    userId: 'u1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

function makeDeps(tenantTz: string | null = null, userTz: string | null = null) {
  return {
    getTenantTimezone: vi.fn().mockResolvedValue(tenantTz),
    getUserTimezone: vi.fn().mockResolvedValue(userTz),
  };
}

describe('createEffectiveTimezoneResolver', () => {
  it('resolves the agency timezone for CL_ADMIN', async () => {
    const deps = makeDeps('Australia/Perth');
    const resolve = createEffectiveTimezoneResolver(deps);
    await expect(resolve(ctxFor({ role: 'CL_ADMIN', tenantId: 't1' }))).resolves.toBe('Australia/Perth');
    expect(deps.getTenantTimezone).toHaveBeenCalledWith('t1');
  });

  it('never consults users.timezone for CL_* roles (strict inheritance)', async () => {
    const deps = makeDeps('Australia/Perth', 'Europe/London');
    const resolve = createEffectiveTimezoneResolver(deps);
    await resolve(ctxFor({ role: 'CL_USER', tenantId: 't1' }));
    expect(deps.getUserTimezone).not.toHaveBeenCalled();
  });

  it('falls back to the platform timezone when the tenant has none', async () => {
    const resolve = createEffectiveTimezoneResolver(makeDeps(null));
    await expect(resolve(ctxFor({ role: 'CL_ADMIN', tenantId: 't1' }))).resolves.toBe('Australia/Sydney');
  });

  it('resolves the personal timezone for AM, OP and INSP', async () => {
    for (const role of ['AM', 'OP', 'INSP'] as const) {
      const deps = makeDeps(null, 'Pacific/Auckland');
      const resolve = createEffectiveTimezoneResolver(deps);
      await expect(resolve(ctxFor({ role }))).resolves.toBe('Pacific/Auckland');
      expect(deps.getUserTimezone).toHaveBeenCalledWith('u1');
      expect(deps.getTenantTimezone).not.toHaveBeenCalled();
    }
  });

  it('falls back to the platform timezone when the user has none', async () => {
    const resolve = createEffectiveTimezoneResolver(makeDeps(null, null));
    await expect(resolve(ctxFor({ role: 'OP' }))).resolves.toBe('Australia/Sydney');
  });

  it('returns the platform timezone for api-key machine principals without any lookup', async () => {
    const deps = makeDeps('Australia/Perth', 'Europe/London');
    const resolve = createEffectiveTimezoneResolver(deps);
    await expect(resolve(ctxFor({ userId: 'api-key:k1', role: 'OP' }))).resolves.toBe('Australia/Sydney');
    expect(deps.getTenantTimezone).not.toHaveBeenCalled();
    expect(deps.getUserTimezone).not.toHaveBeenCalled();
  });

  it('caches lookups within the TTL and refetches after it expires', async () => {
    let nowMs = 0;
    const deps = makeDeps(null, 'Pacific/Auckland');
    const resolve = createEffectiveTimezoneResolver(deps, { ttlMs: 60_000, now: () => nowMs });

    await resolve(ctxFor({ role: 'AM' }));
    nowMs = 30_000;
    await resolve(ctxFor({ role: 'AM' }));
    expect(deps.getUserTimezone).toHaveBeenCalledTimes(1);

    nowMs = 61_000;
    await resolve(ctxFor({ role: 'AM' }));
    expect(deps.getUserTimezone).toHaveBeenCalledTimes(2);
  });

  it('caches tenants and users under distinct keys', async () => {
    const deps = makeDeps('Australia/Perth', 'Europe/London');
    const resolve = createEffectiveTimezoneResolver(deps);
    await expect(resolve(ctxFor({ userId: 't1', role: 'AM' }))).resolves.toBe('Europe/London');
    await expect(resolve(ctxFor({ role: 'CL_ADMIN', tenantId: 't1' }))).resolves.toBe('Australia/Perth');
  });
});
