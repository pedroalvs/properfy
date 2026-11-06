import type { PrismaClient } from '@prisma/client';
import { TENANT_ETA_TEMPLATE_CODES } from '../domain/tenant-eta.constants';
import type { ITenantEtaNoticeLog } from '../domain/tenant-eta-notice-log';

const ALL_TENANT_ETA_CODES = Object.values(TENANT_ETA_TEMPLATE_CODES);

/**
 * Prisma implementation of the F06-2 notice-log reads. Both queries are
 * intentionally cross-tenant (platform metrics, D9 exception); no route exposes
 * them.
 */
export class PrismaTenantEtaNoticeLog implements ITenantEtaNoticeLog {
  constructor(private readonly prisma: PrismaClient) {}

  async findMorningBands(
    appointmentIds: string[],
    sinceByAppointment: Map<string, Date>,
  ): Promise<Map<string, Date>> {
    const result = new Map<string, Date>();
    if (appointmentIds.length === 0) return result;

    const rows = await this.prisma.notification.findMany({
      where: {
        template_code: TENANT_ETA_TEMPLATE_CODES.MORNING,
        appointment_id: { in: appointmentIds },
      },
      select: { appointment_id: true, created_at: true, payload_json: true },
      orderBy: { created_at: 'desc' },
    });

    const resolved = new Set<string>();
    for (const row of rows) {
      const appointmentId = row.appointment_id;
      if (!appointmentId || resolved.has(appointmentId)) continue;

      const since = sinceByAppointment.get(appointmentId);
      // Rows are newest-first; once the newest qualifying row is older than the
      // appointment's lower bound, no older row can qualify either.
      if (since && row.created_at < since) {
        resolved.add(appointmentId);
        continue;
      }

      const payload = row.payload_json as Record<string, unknown> | null;
      const bandFrom = payload?.['etaBandFromAt'];
      if (typeof bandFrom === 'string') {
        const parsed = new Date(bandFrom);
        if (!Number.isNaN(parsed.getTime())) {
          result.set(appointmentId, parsed);
          resolved.add(appointmentId);
        }
      }
      // A newest in-window row without a usable band falls through to older
      // in-window rows (defensive; F06-2 always writes etaBandFromAt).
    }

    return result;
  }

  async countSmsCreatedSince(since: Date): Promise<number> {
    return this.prisma.notification.count({
      where: {
        template_code: { in: ALL_TENANT_ETA_CODES },
        channel: 'SMS',
        created_at: { gte: since },
      },
    });
  }
}
