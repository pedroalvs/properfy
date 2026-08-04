import type { PrismaClient } from '@prisma/client';
import type { ITenantTimezoneLookup } from '../application/tenant-timezone';

const DEFAULT_TTL_MS = 60_000;

/**
 * TTL-cached tenants.timezone lookup shared by the auth middleware resolver
 * and the business use cases. The app is stateless, so a per-instance cache is
 * safe; the TTL bounds how long an agency timezone change can serve stale
 * values (same 60s window as the effective-timezone resolver).
 */
export class CachedTenantTimezoneLookup implements ITenantTimezoneLookup {
  private readonly cache = new Map<string, { value: string | null; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  async getTenantTimezone(tenantId: string): Promise<string | null> {
    const hit = this.cache.get(tenantId);
    if (hit && hit.expiresAt > this.now()) return hit.value;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const value = tenant?.timezone ?? null;
    this.cache.set(tenantId, { value, expiresAt: this.now() + this.ttlMs });
    return value;
  }
}
