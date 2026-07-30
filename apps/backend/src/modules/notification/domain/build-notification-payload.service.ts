import {
  TEMPLATE_VARIABLES,
  PLATFORM_TIMEZONE,
  PROPERFY_LOGO_URL,
  formatCivilDate,
  formatWallTimeRange,
} from '@properfy/shared';
import type { AppointmentEntity } from '../../appointment/domain/appointment.entity';
import type { AppointmentContactEntity } from '../../appointment/domain/appointment-contact.entity';
import type { TenantEntity } from '../../tenant/domain/tenant.entity';
import type { AppointmentCodeFormatter } from '../../appointment/domain/appointment-code.formatter';

export class MissingRequiredVariableError extends Error {
  constructor(
    public readonly templateCode: string,
    public readonly variableName: string,
  ) {
    super(`Template "${templateCode}" requires variable "${variableName}" but it was not provided`);
    this.name = 'MissingRequiredVariableError';
  }
}

export interface NotificationPayloadContext {
  templateCode: string;
  tenant: TenantEntity;
  appointment: AppointmentEntity;
  /**
   * Null only for recipients that are not the rental tenant: an imported
   * appointment can legitimately have no contact at all (CONTACT_INCOMPLETE is a
   * warning, not an error), and the agency still has to be told when it is
   * cancelled. Templates that *require* `rentalTenantName` still throw
   * MissingRequiredVariableError in that case — see the conditional spread below.
   */
  contact: AppointmentContactEntity | null;
  propertyAddress?: string;
  branchName?: string;
  inspectorName?: string | null;
  serviceTypeName?: string | null;
  rawPortalToken?: string | null;
  portalBaseUrl: string;
  appointmentCodeFormatter: AppointmentCodeFormatter;
}

/**
 * H1: Format date in the platform timezone (Sydney) to prevent UTC-day boundary
 * errors. Renders the Australian `dd/mm/yyyy` shape the rental tenant reads
 * directly in the email/SMS body.
 *
 * Exported so consumers comparing against a stored payload (occurrence dedupe)
 * produce the exact same string this service writes.
 */
export function formatScheduledDate(date: Date): string {
  return formatCivilDate(date);
}

/** Renders the appointment window as `9:00 am – 12:00 pm`. */
export function formatTimeSlot(start: string, end: string): string {
  return formatWallTimeRange(start, end);
}

/**
 * The pre-rollout ISO shapes (`2026-05-01`, `09:00-12:00`).
 *
 * These are NEVER rendered — they exist only so the occurrence dedupe can still
 * recognise a payload stored before the dd/mm/yyyy + 12h rollout. Without them
 * every historical payload compares unequal to the freshly-formatted value, the
 * dedupe reads that as "the content changed", and each rental tenant with a
 * pre-rollout appointment receives a duplicate email/SMS on its next status
 * transition.
 *
 * No purge job exists for notifications, so these have no provable expiry date;
 * see `alreadyAnnounced` for why keeping them indefinitely is harmless.
 */
export function legacyIsoScheduledDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PLATFORM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** @see legacyIsoScheduledDate */
export function legacyIsoTimeSlot(start: string, end: string): string {
  return `${start}-${end}`;
}

export class BuildNotificationPayloadService {
  build(ctx: NotificationPayloadContext): Record<string, string> {
    if (ctx.tenant.id !== ctx.appointment.tenantId) {
      throw new Error(
        `Tenant mismatch: payload tenant ${ctx.tenant.id} ≠ appointment tenant ${ctx.appointment.tenantId}`,
      );
    }

    const settings = ctx.tenant.settingsJson;

    const scheduledDate = formatScheduledDate(ctx.appointment.scheduledDate);

    // H3: Build portal URLs via URL constructor to normalize trailing slashes and encode tokens.
    const confirmationLink = ctx.rawPortalToken
      ? new URL('/portal/' + encodeURIComponent(ctx.rawPortalToken), ctx.portalBaseUrl).toString()
      : '';
    // The tenant-facing "propose new date" page was removed, so this no longer
    // has a distinct destination — it points at the portal itself, where the
    // tenant can still change to another available time.
    const rescheduleLink = confirmationLink;

    const allVars: Record<string, string> = {
      // Conditional, not `?? ''`: leaving the key ABSENT is what preserves the
      // required-variable guard below. A template that requires rentalTenantName
      // still throws when there is no contact, while one that lists it as
      // optional (the agency cancellation notice) renders it empty.
      ...(ctx.contact ? { rentalTenantName: ctx.contact.effectiveName } : {}),
      propertyAddress: ctx.propertyAddress ?? '',
      scheduledDate,
      timeSlot: formatTimeSlot(ctx.appointment.timeSlotStart, ctx.appointment.timeSlotEnd),
      inspectorName: ctx.inspectorName ?? '',
      agencyName: ctx.tenant.name,
      agencyPhone: typeof settings.contactPhone === 'string' ? settings.contactPhone : '',
      appointmentCode: ctx.appointmentCodeFormatter.format(
        ctx.appointment.appointmentNumber,
        ctx.tenant,
      ),
      confirmationLink,
      rescheduleLink,
      branchName: ctx.branchName ?? '',
      properfyLogoUrl: PROPERFY_LOGO_URL,
      serviceTypeName: ctx.serviceTypeName ?? '',
      // `appointment.reason` is the free-text reason of the last sensitive
      // transition. Only INSPECTION_CANCELLED_AGENCY declares this variable, and
      // it is only ever built on a CANCELLED transition, so in practice it holds
      // the cancellation reason. The handler re-reads the appointment after the
      // transition persisted it, so the value is the fresh one.
      cancellationReason: ctx.appointment.reason ?? '',
    };

    const spec = TEMPLATE_VARIABLES[ctx.templateCode as keyof typeof TEMPLATE_VARIABLES];
    if (!spec) {
      // Unknown template code: return all computed vars (send-notification validates separately)
      return allVars;
    }

    // Return only variables declared in the template spec (required + optional).
    // H2: Throw when a required variable is not in allVars; use '' only for optional.
    const requiredSet = new Set(spec.required);
    const allowed = new Set([...spec.required, ...spec.optional]);
    const result: Record<string, string> = {};
    for (const key of allowed) {
      const val = allVars[key];
      if (val === undefined) {
        if (requiredSet.has(key)) {
          throw new MissingRequiredVariableError(ctx.templateCode, key);
        }
        result[key] = '';
      } else {
        result[key] = val;
      }
    }
    return result;
  }
}
