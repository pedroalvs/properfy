import type { PrismaClient } from '@prisma/client';

/**
 * Reads the settings blob the send worker consults for the per-agency email
 * kill switch and the daily notification caps.
 *
 * Lives here rather than as a closure in the composition root so the null-tenant
 * guard below is reachable from a test.
 */
export function createTenantSettingsReader(prisma: PrismaClient) {
  return async (tenantId: string | null): Promise<Record<string, unknown>> => {
    // Platform-scoped notifications (tenant_id NULL) have no tenant row to read
    // settings from. Return the same empty object this lookup already yields for
    // an id that does not resolve, so every downstream branch falls back to its
    // default. Prisma throws on a null `where.id`, so the guard is required.
    if (tenantId === null) return {};
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings_json: true },
    });
    return (tenant?.settings_json as Record<string, unknown>) ?? {};
  };
}
