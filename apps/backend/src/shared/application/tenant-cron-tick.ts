import { PLATFORM_TIMEZONE } from '@properfy/shared';
import { civilDateInTimezone, hourInTimezone } from '../domain/timezone-date';

/**
 * Exactly-once claim ledger for per-agency civil-day cron work, backed by the
 * cron_job_runs table (PK job_name + tenant_id + local_date).
 */
export interface ICronJobRunRepository {
  /**
   * INSERT ... ON CONFLICT DO NOTHING against the primary key. True when this
   * call won the claim (the job must run for the tenant on that local date);
   * false when another tick already claimed it.
   */
  tryClaim(jobName: string, tenantId: string, localDate: string): Promise<boolean>;
}

export interface DueTenantGroup {
  timezone: string;
  /** The claimed civil date in `timezone`. */
  todayCivil: string;
  tenantIds: string[];
}

/**
 * Hourly-tick orchestrator for civil-day cron jobs that must fire at an
 * agency-local hour (e.g. reminders at 18:00 local).
 *
 * Each tick, every active tenant whose local wall-clock has REACHED the target
 * hour (`>=`, giving same-day catch-up after missed ticks and DST-skipped
 * hours) is claimed via the cron_job_runs primary key — which also absorbs
 * DST-repeated hours — and grouped by (timezone, local date) so one downstream
 * query can serve all tenants sharing a timezone.
 */
export class TenantCronTick {
  constructor(
    private readonly listActiveTenants: () => Promise<Array<{ id: string; timezone: string | null }>>,
    private readonly runRepo: ICronJobRunRepository,
  ) {}

  async claimDue(jobName: string, targetHour: number, now: Date = new Date()): Promise<DueTenantGroup[]> {
    const tenants = await this.listActiveTenants();
    const groups = new Map<string, DueTenantGroup>();

    for (const tenant of tenants) {
      const timezone = tenant.timezone ?? PLATFORM_TIMEZONE;
      if (hourInTimezone(now, timezone) < targetHour) continue;

      const todayCivil = civilDateInTimezone(now, timezone);
      const claimed = await this.runRepo.tryClaim(jobName, tenant.id, todayCivil);
      if (!claimed) continue;

      const key = `${timezone}|${todayCivil}`;
      const group = groups.get(key);
      if (group) {
        group.tenantIds.push(tenant.id);
      } else {
        groups.set(key, { timezone, todayCivil, tenantIds: [tenant.id] });
      }
    }

    return [...groups.values()];
  }
}
