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
  /**
   * DELETE the claims for the given tenants/date so a later tick (or a
   * pg-boss retry of this one) can claim and run them again. Used when a
   * group's execution fails after its claims were taken — without the
   * release, the failed group would silently lose its civil day.
   */
  releaseClaims(jobName: string, tenantIds: string[], localDate: string): Promise<void>;
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
      let timezone = tenant.timezone ?? PLATFORM_TIMEZONE;
      let localHour: number;
      let todayCivil: string;
      try {
        localHour = hourInTimezone(now, timezone);
        todayCivil = civilDateInTimezone(now, timezone);
      } catch {
        // Defense in depth: timezone strings are validated at write time, but
        // an unparseable value must degrade to the platform default rather
        // than throwing and failing the whole tick for every other tenant.
        timezone = PLATFORM_TIMEZONE;
        localHour = hourInTimezone(now, timezone);
        todayCivil = civilDateInTimezone(now, timezone);
      }
      if (localHour < targetHour) continue;

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

  /**
   * Claim-and-run with failure recovery: runs each due group through `runner`;
   * a group whose runner throws has its claims RELEASED (so the pg-boss retry
   * of this job — or the next hourly tick — claims and runs it again) and the
   * error is rethrown after the remaining groups were attempted, so the job
   * registers as failed and pg-boss retries. Groups that succeeded keep their
   * claims and are not re-run on retry.
   *
   * Known blind spot (accepted): if the process is down across a local
   * midnight, the missed civil day can no longer be claimed once the date
   * rolls over — same loss profile as the previous daily-cron design.
   * A crash BETWEEN claim and run (not a thrown error) also loses that
   * group's day; the window is milliseconds and downstream dedupe/idempotency
   * bounds the impact.
   */
  async runDue(
    jobName: string,
    targetHour: number,
    runner: (group: DueTenantGroup) => Promise<void>,
    now: Date = new Date(),
  ): Promise<DueTenantGroup[]> {
    const groups = await this.claimDue(jobName, targetHour, now);
    const failures: unknown[] = [];

    for (const group of groups) {
      try {
        await runner(group);
      } catch (err) {
        await this.runRepo.releaseClaims(jobName, group.tenantIds, group.todayCivil);
        failures.push(err);
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `${jobName}: ${failures.length}/${groups.length} timezone group(s) failed; their claims were released for retry`,
        { cause: failures[0] },
      );
    }

    return groups;
  }
}
