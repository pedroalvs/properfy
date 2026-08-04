import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import { civilDateInTimezone, PLATFORM_TIMEZONE } from '../../../../shared/domain/timezone-date';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { INotificationRepository } from '../../domain/notification.repository';
import type { BuildNotificationPayloadService } from '../../domain/build-notification-payload.service';
import type { AppointmentCodeFormatter } from '../../../appointment/domain/appointment-code.formatter';
import type { CreateNotificationUseCase } from './create-notification.use-case';
import type { NotificationChannel } from '@properfy/shared';

export interface DispatchRemindersOutput {
  dispatched: number;
  skipped: number;
}

/**
 * Per-agency tick scope: `timezone` decides which civil date is "today" and
 * `tenantIds` narrows the sweep to the agencies whose local 18:00 claimed this
 * run. Absent → legacy platform-wide behaviour on the platform timezone.
 */
export interface TenantCronScope {
  timezone: string;
  tenantIds: string[];
}

/**
 * Confirmation states that count as "the occupant has answered".
 *
 * UNAVAILABLE is in here alongside CONFIRMED: someone who replied "I can't make it" has
 * responded just as definitively as someone who said yes, and chasing them about a slot
 * they already declined is the same noise. PENDING and NO_RESPONSE are the states this
 * chase exists for.
 */
const ANSWERED_CONFIRMATION_STATUSES: readonly string[] = ['CONFIRMED', 'UNAVAILABLE'];

/**
 * The three reminder windows, counted back from the scheduled date.
 *
 * 7 and 5 days are chasers — they exist to get an answer out of an occupant who has not
 * given one, so they stop the moment one arrives. 3 days is a heads-up and goes out
 * regardless of the answer: someone who confirmed three weeks ago still needs telling
 * that a stranger is coming on Thursday.
 */
const REMINDER_WINDOWS = [
  { offsetDays: 7, templateCode: 'REMINDER_7_DAYS', onlyWhenUnanswered: true },
  { offsetDays: 5, templateCode: 'REMINDER_5_DAYS', onlyWhenUnanswered: true },
  { offsetDays: 3, templateCode: 'REMINDER_3_DAYS', onlyWhenUnanswered: false },
] as const;

export class DispatchRemindersUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly notificationRepo: INotificationRepository,
    private readonly buildNotificationPayload: BuildNotificationPayloadService,
    private readonly appointmentCodeFormatter: AppointmentCodeFormatter,
    private readonly createNotification: CreateNotificationUseCase,
    private readonly rentalTenantPortalBaseUrl: string,
  ) {}

  async execute(today?: Date, scope?: TenantCronScope): Promise<DispatchRemindersOutput> {
    const now = today ?? new Date();
    let dispatched = 0;
    let skipped = 0;

    // "Today" is the agency-local civil date for scoped (per-tenant tick) runs,
    // the platform civil date otherwise; the repo expects UTC midnight of it.
    const todayCivil = civilDateInTimezone(now, scope?.timezone ?? PLATFORM_TIMEZONE);
    for (const { offsetDays, templateCode, onlyWhenUnanswered } of REMINDER_WINDOWS) {
      const targetDate = new Date(`${todayCivil}T00:00:00.000Z`);
      targetDate.setUTCDate(targetDate.getUTCDate() + offsetDays);
      const appointments = await this.appointmentRepo.findScheduledOnDate(targetDate, scope?.tenantIds);

      for (const { appointment, contact, propertyAddress, serviceTypeName } of appointments) {
        // Before anything else, so a chased-and-answered appointment costs no dedupe
        // lookups.
        //
        // Note this is deliberately BROADER than the T-2 gate in dispatch-escalations,
        // which skips CONFIRMED only. An UNAVAILABLE occupant is spared these chasers
        // but can still receive the escalation's TENANT_SMS_ALERT. That is reachable
        // only if the portal "No" fails to auto-reject the appointment, so it is left
        // alone here rather than widened by a change nobody asked for — but the two
        // gates are not the same rule, and a future change to one should look at both.
        if (
          onlyWhenUnanswered &&
          ANSWERED_CONFIRMATION_STATUSES.includes(appointment.rentalTenantConfirmationStatus)
        ) {
          skipped++;
          continue;
        }

        const effectiveEmail = contact?.effectiveEmail;
        const effectivePhone = contact?.effectivePhone;

        // Independent legs: a tenant with both an email and a phone gets both.
        // Email first so the more detailed message lands before the SMS nudge.
        const legs: Array<{ channel: NotificationChannel; recipient: string; code: string }> = [];
        if (effectiveEmail) {
          legs.push({ channel: 'EMAIL', recipient: effectiveEmail, code: templateCode });
        }
        if (effectivePhone) {
          legs.push({ channel: 'SMS', recipient: effectivePhone, code: `${templateCode}_SMS` });
        }

        if (legs.length === 0) {
          skipped++;
          continue;
        }

        const tenant = await this.tenantRepo.findById(appointment.tenantId);
        if (!tenant || !contact) {
          skipped++;
          continue;
        }

        for (const leg of legs) {
          // Keyed on the exact template code, so each channel dedupes on its own
          // and a previously sent email never suppresses the SMS.
          const alreadySent = await this.notificationRepo.existsByAppointmentAndTemplate(
            appointment.id,
            leg.code,
            appointment.tenantId,
          );
          if (alreadySent) {
            skipped++;
            continue;
          }

          const payloadJson = this.buildNotificationPayload.build({
            templateCode: leg.code,
            tenant,
            appointment,
            contact,
            propertyAddress: propertyAddress ?? '',
            serviceTypeName: serviceTypeName ?? null,
            rawPortalToken: null,
            portalBaseUrl: this.rentalTenantPortalBaseUrl,
            appointmentCodeFormatter: this.appointmentCodeFormatter,
          });

          await this.createNotification.execute({
            tenantId: appointment.tenantId,
            appointmentId: appointment.id,
            recipient: leg.recipient,
            channel: leg.channel,
            templateCode: leg.code,
            payloadJson,
          });
          dispatched++;
        }
      }
    }

    return { dispatched, skipped };
  }
}
