import type { PrismaClient } from '@prisma/client';
import type { ICronJobRunRepository } from '../application/tenant-cron-tick';

export class PrismaCronJobRunRepository implements ICronJobRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async tryClaim(jobName: string, tenantId: string, localDate: string): Promise<boolean> {
    // ON CONFLICT DO NOTHING against the PK: the affected-row count tells us
    // whether this call won the (job, tenant, local date) claim. Atomic, so
    // concurrent ticks (rolling deploys, DST-repeated hours) cannot double-run.
    const inserted = await this.prisma.$executeRaw`
      INSERT INTO "cron_job_runs" ("job_name", "tenant_id", "local_date")
      VALUES (${jobName}, ${tenantId}, ${localDate}::date)
      ON CONFLICT DO NOTHING
    `;
    return inserted > 0;
  }

  async releaseClaims(jobName: string, tenantIds: string[], localDate: string): Promise<void> {
    if (tenantIds.length === 0) return;
    await this.prisma.cronJobRun.deleteMany({
      where: {
        job_name: jobName,
        tenant_id: { in: tenantIds },
        local_date: new Date(`${localDate}T00:00:00.000Z`),
      },
    });
  }
}
