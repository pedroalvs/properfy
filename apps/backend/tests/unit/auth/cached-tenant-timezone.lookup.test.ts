import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { CachedTenantTimezoneLookup } from '../../../src/shared/infrastructure/cached-tenant-timezone.lookup';

function makePrisma(timezone: string | null) {
  const findUnique = vi.fn().mockResolvedValue(timezone === null ? null : { timezone });
  return { prisma: { tenant: { findUnique } } as unknown as PrismaClient, findUnique };
}

describe('CachedTenantTimezoneLookup', () => {
  it('returns the tenant timezone', async () => {
    const { prisma } = makePrisma('Australia/Perth');
    const lookup = new CachedTenantTimezoneLookup(prisma);
    await expect(lookup.getTenantTimezone('t1')).resolves.toBe('Australia/Perth');
  });

  it('returns null for unknown tenants', async () => {
    const { prisma } = makePrisma(null);
    const lookup = new CachedTenantTimezoneLookup(prisma);
    await expect(lookup.getTenantTimezone('ghost')).resolves.toBeNull();
  });

  it('caches within the TTL and refetches after expiry', async () => {
    let nowMs = 0;
    const { prisma, findUnique } = makePrisma('Australia/Perth');
    const lookup = new CachedTenantTimezoneLookup(prisma, 60_000, () => nowMs);

    await lookup.getTenantTimezone('t1');
    nowMs = 30_000;
    await lookup.getTenantTimezone('t1');
    expect(findUnique).toHaveBeenCalledTimes(1);

    nowMs = 61_000;
    await lookup.getTenantTimezone('t1');
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('caches per tenant id', async () => {
    const { prisma, findUnique } = makePrisma('Australia/Perth');
    const lookup = new CachedTenantTimezoneLookup(prisma);
    await lookup.getTenantTimezone('t1');
    await lookup.getTenantTimezone('t2');
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});
