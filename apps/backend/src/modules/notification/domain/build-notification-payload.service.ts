import { TEMPLATE_VARIABLES } from '@properfy/shared';
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
  rawPortalToken?: string | null;
  portalBaseUrl: string;
  appointmentCodeFormatter: AppointmentCodeFormatter;
}

export class BuildNotificationPayloadService {
  build(ctx: NotificationPayloadContext): Record<string, string> {
    if (ctx.tenant.id !== ctx.appointment.tenantId) {
      throw new Error(
        `Tenant mismatch: payload tenant ${ctx.tenant.id} ≠ appointment tenant ${ctx.appointment.tenantId}`,
      );
    }

    const settings = ctx.tenant.settingsJson;

    // H1: Format date in tenant timezone to prevent UTC-day boundary errors.
    // en-CA locale produces YYYY-MM-DD, consistent with ISO date strings.
    const scheduledDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: ctx.tenant.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(ctx.appointment.scheduledDate);

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
      tenantName: ctx.contact.effectiveName,
      propertyAddress: ctx.propertyAddress ?? '',
      scheduledDate,
      timeSlot: `${ctx.appointment.timeSlotStart}-${ctx.appointment.timeSlotEnd}`,
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
