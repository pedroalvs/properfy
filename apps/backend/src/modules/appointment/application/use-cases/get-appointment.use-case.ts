import { type AuthContext, type AppointmentApp, isAppointmentOverdue } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IAppointmentRepository, AppointmentWithRelations } from '../../domain/appointment.repository';
import type { IAppCredentialRepository } from '../../../app-credential/domain/app-credential.repository';
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
  timeSlotStart: string;
  timeSlotEnd: string;
  keyRequired: boolean;
  meetingLocation: string | null;
  keyLocation: string | null;
  tenantConfirmationStatus: string;
  priceAmount: number;
  payoutAmount: number;
  pricingRuleSnapshotJson: Record<string, unknown>;
  notes: string | null;
  tenantNote: string | null;
  observation: string | null;
  customFieldsJson: Record<string, unknown> | null;
  reason: string | null;
  rejectionReasonCode: string | null;
  createdByUserId: string;
  doneCheckedByUserId: string | null;
  doneCheckedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Enriched flat fields
  /** Formatted appointment code (e.g. "INS-0042"). */
  appointmentCode: string;
  code: string;
  propertyAddress: string;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  inspectorName: string | null;
  branchName: string;
  serviceTypeName: string;
  /** Tenant (agency) display name — labelled "CLIENT" in the map detail panel (025 §FR-451). */
  clientName: string;
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
  /** True when an active (non-superseded) confirmation cycle exists — enables "Copy Portal Link" button. */
  hasActivePortalToken: boolean;
  /** App credentials linked to this appointment (live reference). */
  apps: AppointmentApp[];
}

function mapToOutput(found: AppointmentWithRelations, apps: AppointmentApp[]): GetAppointmentOutput {
  const { appointment, contact, restrictions } = found;
  const prefix = found.tenantAppointmentCodePrefix ?? 'INS';
  const padded = String(appointment.appointmentNumber).padStart(4, '0');
  const appointmentCode = `${prefix}-${padded}`;
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
    timeSlotStart: appointment.timeSlotStart,
    timeSlotEnd: appointment.timeSlotEnd,
    keyRequired: appointment.keyRequired,
    meetingLocation: appointment.meetingLocation,
    keyLocation: appointment.keyLocation,
    tenantConfirmationStatus: appointment.tenantConfirmationStatus,
    priceAmount: appointment.priceAmount,
    payoutAmount: appointment.payoutAmount,
    pricingRuleSnapshotJson: appointment.pricingRuleSnapshotJson,
    notes: appointment.notes,
    tenantNote: appointment.tenantNote,
    observation: appointment.observation,
    customFieldsJson: appointment.customFieldsJson,
    reason: appointment.reason,
    rejectionReasonCode: appointment.rejectionReasonCode ?? null,
    createdByUserId: appointment.createdByUserId,
    doneCheckedByUserId: appointment.doneCheckedByUserId,
    doneCheckedAt: appointment.doneCheckedAt,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
    // Enriched fields from joins
    appointmentCode,
    code: found.propertyCode ?? '',
    propertyAddress: found.propertyAddress ?? '',
    contactName: contact?.effectiveName ?? '',
    contactPhone: contact?.effectivePhone ?? null,
    contactEmail: contact?.effectiveEmail ?? null,
    inspectorName: found.inspectorName ?? null,
    branchName: found.branchName ?? '',
    serviceTypeName: found.serviceTypeName ?? '',
    clientName: found.tenantName ?? '',
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
    hasActivePortalToken: found.hasActivePortalToken,
    apps,
  };
}

export class GetAppointmentUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly appCredentialRepo?: IAppCredentialRepository,
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

    const apps: AppointmentApp[] = this.appCredentialRepo
      ? (await this.appCredentialRepo.findByAppointmentId(found.appointment.id)).map((a) => ({
          id: a.id,
          name: a.name,
          username: a.username,
          password: a.password,
        }))
      : [];

    return mapToOutput(found, apps);
  }
}
