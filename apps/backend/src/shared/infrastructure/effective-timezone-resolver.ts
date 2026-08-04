import { PLATFORM_TIMEZONE, type AuthContext } from '@properfy/shared';
import type { EffectiveTimezoneResolver } from '../interfaces/auth-middleware';

export interface EffectiveTimezoneResolverDeps {
  /** tenants.timezone for the id, or null/undefined when unset. */
  getTenantTimezone(tenantId: string): Promise<string | null | undefined>;
  /** users.timezone for the id, or null/undefined when unset. */
  getUserTimezone(userId: string): Promise<string | null | undefined>;
}

export interface EffectiveTimezoneResolverOptions {
  /** Cache TTL in ms. Bounds staleness after a timezone change. Default 60s. */
  ttlMs?: number;
  /** Clock override for tests. */
  now?: () => number;
}

const DEFAULT_TTL_MS = 60_000;
const API_KEY_PRINCIPAL_PREFIX = 'api-key:';

/**
 * Per-request effective-timezone resolution with a small in-instance TTL cache.
 *
 * CL_* roles strictly inherit the agency (tenant) timezone; AM/OP/INSP use
 * their personal users.timezone. Machine principals (API keys) and anything
 * unresolved fall back to the platform timezone. The app is stateless, so a
 * per-instance cache is safe; the TTL bounds how long a timezone change can
 * serve stale values.
 */
export function createEffectiveTimezoneResolver(
  deps: EffectiveTimezoneResolverDeps,
  options: EffectiveTimezoneResolverOptions = {},
): EffectiveTimezoneResolver {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { value: string; expiresAt: number }>();

  async function cached(key: string, load: () => Promise<string | null | undefined>): Promise<string> {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now()) return hit.value;
    const value = (await load()) ?? PLATFORM_TIMEZONE;
    cache.set(key, { value, expiresAt: now() + ttlMs });
    return value;
  }

  return async function resolveEffectiveTimezone(ctx: AuthContext): Promise<string> {
    if (ctx.userId.startsWith(API_KEY_PRINCIPAL_PREFIX)) return PLATFORM_TIMEZONE;
    if ((ctx.role === 'CL_ADMIN' || ctx.role === 'CL_USER') && ctx.tenantId) {
      return cached(`tenant:${ctx.tenantId}`, () => deps.getTenantTimezone(ctx.tenantId as string));
    }
    return cached(`user:${ctx.userId}`, () => deps.getUserTimezone(ctx.userId));
  };
}
