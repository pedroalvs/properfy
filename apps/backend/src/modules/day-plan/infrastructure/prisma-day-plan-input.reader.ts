import type { Prisma} from '@prisma/client';
import { type PrismaClient } from '@prisma/client';
import {
  PLATFORM_TIMEZONE,
  zonedWallTimeToUtc,
  type InspectorBaseAddress,
} from '@properfy/shared';
import { T1VisibilityService } from '../../inspector-execution/domain/t1-visibility.service';
import { AppointmentCodeFormatter } from '../../appointment/domain/appointment-code.formatter';
import type {
  DayPlanCandidate,
  DayPlanCandidateContact,
  IDayPlanInputReader,
  InspectorDayPlanContext,
} from '../domain/day-plan-input.reader';

function toNum(value: Prisma.Decimal | null): number | null {
  return value === null ? null : value.toNumber();
}

function dateOnly(civil: string): Date {
  return new Date(`${civil}T00:00:00.000Z`);
}

export class PrismaDayPlanInputReader implements IDayPlanInputReader {
  private readonly t1 = new T1VisibilityService();

  constructor(private readonly prisma: PrismaClient) {}

  async loadCandidates(
    inspectorId: string,
    planDate: string,
    todayCivil: string,
  ): Promise<DayPlanCandidate[]> {
    const rows = await this.prisma.appointment.findMany({
      where: {
        inspector_id: inspectorId,
        scheduled_date: dateOnly(planDate),
        deleted_at: null,
        status: { in: ['SCHEDULED', 'DONE'] },
      },
      include: {
        property: { select: { lat: true, lng: true, street: true, suburb: true, postcode: true, state: true } },
        service_type: {
          select: { name: true, default_duration_minutes: true, flow_type: true, requires_rental_tenant_confirmation: true },
        },
        tenant: { select: { name: true, timezone: true, appointment_code_prefix: true } },
        contacts: {
          select: { snapshot_name: true, snapshot_phone: true, is_primary: true, role: true, created_at: true },
        },
        execution: { select: { started_at: true, finished_at: true, abandoned_at: true } },
      },
    });

    const candidates: DayPlanCandidate[] = [];
    for (const appt of rows) {
      const tenantTz = appt.tenant.timezone ?? PLATFORM_TIMEZONE;
      if (appt.status === 'SCHEDULED') {
        const visible = this.t1.isVisibleForInspector(
          appt.service_type.flow_type,
          appt.rental_tenant_confirmation_status,
          appt.key_required,
          appt.scheduled_date,
          todayCivil,
          appt.service_type.requires_rental_tenant_confirmation,
        );
        if (!visible) continue;
      }
      const contacts: DayPlanCandidateContact[] = appt.contacts.map((c) => ({
        name: c.snapshot_name,
        phone: c.snapshot_phone,
        isPrimary: c.is_primary,
        role: c.role,
        createdAt: c.created_at,
      }));
      candidates.push({
        appointmentId: appt.id,
        appointmentCode: AppointmentCodeFormatter.formatParts(
          appt.appointment_number,
          appt.tenant.appointment_code_prefix,
        ),
        appointmentStatus: appt.status as 'SCHEDULED' | 'DONE',
        agencyName: appt.tenant.name,
        tenantTimezone: tenantTz,
        scheduledDate: planDate,
        timeSlotStart: appt.time_slot_start,
        timeSlotEnd: appt.time_slot_end,
        windowStartAt: zonedWallTimeToUtc(planDate, appt.time_slot_start, tenantTz),
        windowEndAt: zonedWallTimeToUtc(planDate, appt.time_slot_end, tenantTz),
        durationMinutes: appt.service_type.default_duration_minutes,
        serviceTypeName: appt.service_type.name,
        lat: toNum(appt.property?.lat ?? null),
        lng: toNum(appt.property?.lng ?? null),
        propertyAddress: appt.property
          ? `${appt.property.street}, ${appt.property.suburb} ${appt.property.state} ${appt.property.postcode}`
          : '',
        suburb: appt.property?.suburb ?? '',
        keyRequired: appt.key_required,
        meetingLocation: appt.meeting_location,
        rentalTenantConfirmationStatus: appt.rental_tenant_confirmation_status,
        contacts,
        startedAt: appt.execution?.started_at ?? null,
        finishedAt: appt.execution?.finished_at ?? null,
        abandonedAt: appt.execution?.abandoned_at ?? null,
      });
    }
    return candidates;
  }

  async loadInspectorContext(inspectorId: string): Promise<InspectorDayPlanContext | null> {
    // A soft-deleted inspector is treated as absent (defence in depth: a valid JWT
    // may outlive deactivation within its TTL).
    const inspector = await this.prisma.inspector.findFirst({
      where: { id: inspectorId, deleted_at: null },
      select: {
        id: true,
        name: true,
        status: true,
        base_lat: true,
        base_lng: true,
        address: true,
        user: { select: { timezone: true } },
      },
    });
    if (!inspector) return null;
    const baseLat = toNum(inspector.base_lat);
    const baseAddress = (inspector.address as InspectorBaseAddress | null) ?? null;
    return {
      inspectorId: inspector.id,
      name: inspector.name,
      timezone: inspector.user?.timezone ?? PLATFORM_TIMEZONE,
      active: inspector.status === 'ACTIVE',
      baseLat,
      baseLng: toNum(inspector.base_lng),
      baseAddress,
      baseGeocodeFailed: baseAddress !== null && baseLat === null,
    };
  }
}
