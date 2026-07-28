import {
  TEMPLATE_VARIABLES,
  PLATFORM_TIMEZONE,
  PROPERFY_LOGO_URL,
  formatDisplayDate,
  formatDisplayTimeRange,
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
  contact: AppointmentContactEntity;
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
  return formatDisplayDate(date);
}

/** Renders the appointment window as `9:00 am – 12:00 pm`. */
export function formatTimeSlot(start: string, end: string): string {
  return formatDisplayTimeRange(start, end);
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
 * Removable once every stored notification predating the rollout has aged past
 * the retention window.
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
    const rescheduleLink = ctx.rawPortalToken
      ? new URL(
          '/portal/' + encodeURIComponent(ctx.rawPortalToken) + '/reschedule',
          ctx.portalBaseUrl,
        ).toString()
      : '';

    const allVars: Record<string, string> = {
      rentalTenantName: ctx.contact.effectiveName,
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
