import { type AuthContext, isAppointmentOverdue } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IAppointmentRepository, AppointmentWithRelations } from '../../domain/appointment.repository';
import {
  AppointmentNotFoundError,
  AppointmentAccessDeniedError,
} from '../../domain/appointment.errors';

export interface GetAppointmentInput {
  appointmentId: string;
  actor: AuthContext;
}

export interface GetAppointmentOutput {
  id: string;
  appointmentNumber: number;
  tenantId: string;
  branchId: string;
  propertyId: string;
  serviceTypeId: string;
  inspectorId: string | null;
  status: string;
  scheduledDate: Date;
  timeSlot: string;
  keyRequired: boolean;
  meetingLocation: string | null;
  keyLocation: string | null;
  tenantConfirmationStatus: string;
  priceAmount: number;
  payoutAmount: number;
  pricingRuleSnapshotJson: Record<string, unknown>;
  notes: string | null;
  customFieldsJson: Record<string, unknown> | null;
  reason: string | null;
  createdByUserId: string;
  doneCheckedByUserId: string | null;
  doneCheckedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Enriched flat fields
  code: string;
  propertyAddress: string;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  inspectorName: string | null;
  branchName: string;
  serviceTypeName: string;
  isOverdue: boolean;
  cancellationReason: string | null;
  latitude: number | null;
  longitude: number | null;
  /** @deprecated Use contacts[] array. Kept for backward compat — returns the primary contact. */
  contact: {
    id: string;
    tenantName: string;
    primaryEmail: string | null;
    secondaryEmail: string | null;
    primaryPhone: string | null;
    secondaryPhone: string | null;
  } | null;
  /** Enriched contacts array (feature 021 junction + snapshot). Primary first, then insertion order. */
  contacts: Array<{
    id: string;
    contactId: string | null;
    role: string;
    isPrimary: boolean;
    snapshotName: string;
    snapshotEmail: string | null;
    snapshotPhone: string | null;
  }>;
  restrictions: Array<{
    id: string;
    isHome: boolean;
    unavailableDaysJson: string[] | null;
    unavailableHoursJson: string[] | null;
    notes: string | null;
    source: string;
  }>;
}

function mapToOutput(found: AppointmentWithRelations): GetAppointmentOutput {
  const { appointment, contact, restrictions } = found;
  return {
    id: appointment.id,
    appointmentNumber: appointment.appointmentNumber,
    tenantId: appointment.tenantId,
    branchId: appointment.branchId,
    propertyId: appointment.propertyId,
    serviceTypeId: appointment.serviceTypeId,
    inspectorId: appointment.inspectorId,
    status: appointment.status,
    scheduledDate: appointment.scheduledDate,
    timeSlot: appointment.timeSlot,
    keyRequired: appointment.keyRequired,
    meetingLocation: appointment.meetingLocation,
    keyLocation: appointment.keyLocation,
    tenantConfirmationStatus: appointment.tenantConfirmationStatus,
    priceAmount: appointment.priceAmount,
    payoutAmount: appointment.payoutAmount,
    pricingRuleSnapshotJson: appointment.pricingRuleSnapshotJson,
    notes: appointment.notes,
    customFieldsJson: appointment.customFieldsJson,
    reason: appointment.reason,
    createdByUserId: appointment.createdByUserId,
    doneCheckedByUserId: appointment.doneCheckedByUserId,
    doneCheckedAt: appointment.doneCheckedAt,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
    // Enriched fields from joins
    code: found.propertyCode ?? '',
    propertyAddress: found.propertyAddress ?? '',
    contactName: contact?.effectiveName ?? '',
    contactPhone: contact?.effectivePhone ?? null,
    contactEmail: contact?.effectiveEmail ?? null,
    inspectorName: found.inspectorName ?? null,
    branchName: found.branchName ?? '',
    serviceTypeName: found.serviceTypeName ?? '',
    isOverdue: isAppointmentOverdue(appointment.status, appointment.scheduledDate),
    cancellationReason: appointment.reason,
    latitude: found.propertyLatitude ?? null,
    longitude: found.propertyLongitude ?? null,
    contact: contact
      ? {
          id: contact.id,
          tenantName: contact.effectiveName,
          primaryEmail: contact.effectiveEmail,
          secondaryEmail: contact.secondaryEmail,
          primaryPhone: contact.effectivePhone,
          secondaryPhone: contact.secondaryPhone,
        }
      : null,
    contacts: (found.contacts ?? (contact ? [contact] : [])).map((c) => ({
      id: c.id,
      contactId: c.contactId,
      role: c.role,
      isPrimary: c.isPrimary,
      snapshotName: c.effectiveName,
      snapshotEmail: c.effectiveEmail,
      snapshotPhone: c.effectivePhone,
    })),
    restrictions: restrictions.map((r) => ({
      id: r.id,
      isHome: r.isHome,
      unavailableDaysJson: r.unavailableDaysJson,
      unavailableHoursJson: r.unavailableHoursJson,
      notes: r.notes,
      source: r.source,
    })),
  };
}

export class GetAppointmentUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: GetAppointmentInput): Promise<GetAppointmentOutput> {
    const { appointmentId, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN', 'CL_USER', 'INSP'], { action: 'appointment.view', entityType: 'Appointment' });

    // AM/OP/INSP: platform-wide / cross-tenant access (no tenant_id filter
    // at the repo layer). OP is cross-tenant per CLAUDE.md §6 and
    // `specs/DECISIONS.md` DEC-003 — aligning with the `list-appointments`
    // contract so OP get-by-id and list behaviour stay consistent. INSP
    // is further narrowed after the lookup by `inspectorId` equality.
    // CL_ADMIN/CL_USER: scoped by tenantId from JWT and verified again
    // after the lookup.
    const tenantId =
      actor.role === 'AM' || actor.role === 'OP' || actor.role === 'INSP'
        ? null
        : actor.tenantId;

    const found = await this.appointmentRepo.findById(appointmentId, tenantId);
    if (!found || found.appointment.isDeleted()) {
      throw new AppointmentNotFoundError();
    }

    // CL_ADMIN/CL_USER: verify tenant scope
    if (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
      if (found.appointment.tenantId !== actor.tenantId) {
        throw new AppointmentNotFoundError();
      }
    }

    // INSP: can only see their assigned appointments
    if (actor.role === 'INSP') {
      if (!actor.inspectorId) {
        throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
      }
      if (found.appointment.inspectorId !== actor.inspectorId) {
        throw new AppointmentAccessDeniedError();
      }
    }

    return mapToOutput(found);
  }
}
