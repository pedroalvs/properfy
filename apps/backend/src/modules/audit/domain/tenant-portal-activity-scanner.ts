/**
 * B5 #400: domain port for scanning `rental_tenant_portal_activities`
 * (hot + cold) during the erasure preview. Keeps the preview use case free of
 * a direct `PrismaClient` dependency — the application layer depends only on
 * this interface, and the Prisma implementation lives in infrastructure.
 */

export interface TenantPortalActivityMatch {
  id: string;
  isArchived: boolean;
}

export interface ITenantPortalActivityScanner {
  /**
   * Scan hot + cold `rental_tenant_portal_activities` for the given PII values
   * using the same ILIKE-ANY superset strategy as the audit log PII scan.
   * Returns id-only matches grouped by tier.
   */
  scanByValues(
    values: string[],
  ): Promise<{ hot: TenantPortalActivityMatch[]; cold: TenantPortalActivityMatch[] }>;
}
