import type { PrismaClient } from '@prisma/client';
import type { ITenantSettingsReader } from '../application/use-cases/start-inspection.use-case';
import type { InspectionTimeWindowBounds } from '../../../shared/domain/inspection-time-window.service';

export class PrismaTenantSettingsReader implements ITenantSettingsReader {
  constructor(private readonly prisma: PrismaClient) {}

  async getTimeWindowBounds(tenantId: string): Promise<Partial<InspectionTimeWindowBounds> | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings_json: true },
    });

    if (!tenant?.settings_json || typeof tenant.settings_json !== 'object') {
      return null;
    }

    const settings = tenant.settings_json as Record<string, unknown>;
    const result: Partial<InspectionTimeWindowBounds> = {};

    if (typeof settings.inspectionWindowBeforeMinutes === 'number') {
      result.beforeMinutes = settings.inspectionWindowBeforeMinutes;
    }
    if (typeof settings.inspectionWindowAfterMinutes === 'number') {
      result.afterMinutes = settings.inspectionWindowAfterMinutes;
    }

    return Object.keys(result).length > 0 ? result : null;
  }
}
