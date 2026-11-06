/**
 * Read port over the `notifications` table for the F06-2 triggers.
 *
 * Two platform-metric reads that do NOT belong on the generic notification
 * repository because they are specific to the arrival-notice feature:
 *
 * - `findMorningBands` powers the EARLY_CHANGE correction (L-F06-05): the morning
 *   band instant that was promised to each tenant today.
 * - `countSmsCreatedSince` powers the daily-volume warn (L-F06-11): a deliberately
 *   **cross-tenant** count of arrival-notice SMS (platform observability, D9
 *   exception). No HTTP route exposes it.
 */
export interface ITenantEtaNoticeLog {
  /**
   * For each appointment, the `etaBandFromAt` of its most recent
   * `TENANT_ETA_MORNING` notification created at/after that appointment's lower
   * bound (`sinceByAppointment`, agency-local midnight), across any channel.
   * Appointments with no qualifying morning row are omitted from the map.
   */
  findMorningBands(
    appointmentIds: string[],
    sinceByAppointment: Map<string, Date>,
  ): Promise<Map<string, Date>>;

  /**
   * Count of `TENANT_ETA_*` SMS notifications created at/after `since`, across
   * all tenants (platform volume metric; same D9 cross-tenant exception).
   */
  countSmsCreatedSince(since: Date): Promise<number>;
}
