import type { PrismaClient } from '@prisma/client';
import type {
  ITenantPortalActivityScanner,
  TenantPortalActivityMatch,
} from '../domain/tenant-portal-activity-scanner';

/**
 * B5 #400: Prisma implementation of the portal-activity scanner. Lifts the
 * previous inline `$queryRawUnsafe` scan out of the preview use case so the
 * application layer no longer depends on Prisma. The PII values are bound as a
 * parameter ($1); the SQL itself is static, so this is injection-safe.
 */
export class PrismaTenantPortalActivityScanner implements ITenantPortalActivityScanner {
  constructor(private readonly prisma: PrismaClient) {}

  async scanByValues(
    values: string[],
  ): Promise<{ hot: TenantPortalActivityMatch[]; cold: TenantPortalActivityMatch[] }> {
    if (values.length === 0) return { hot: [], cold: [] };
    const likePatterns = values.map((v) => `%${v}%`);

    const hotRows: Array<{ id: string }> = await this.prisma.$queryRawUnsafe(
      `SELECT id FROM "rental_tenant_portal_activities"
       WHERE previous_values_json::text ILIKE ANY($1::text[])
          OR new_values_json::text ILIKE ANY($1::text[])
       LIMIT 5000`,
      likePatterns,
    );
    const coldRows: Array<{ id: string }> = await this.prisma.$queryRawUnsafe(
      `SELECT id FROM "rental_tenant_portal_activities_archive"
       WHERE previous_values_json::text ILIKE ANY($1::text[])
          OR new_values_json::text ILIKE ANY($1::text[])
       LIMIT 5000`,
      likePatterns,
    );

    return {
      hot: hotRows.map((r) => ({ id: r.id, isArchived: false })),
      cold: coldRows.map((r) => ({ id: r.id, isArchived: true })),
    };
  }
}
