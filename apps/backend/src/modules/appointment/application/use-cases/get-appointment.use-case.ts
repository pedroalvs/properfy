import { type AuthContext, isAppointmentOverdue } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
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
  contact: {
    id: string;
    tenantName: string;
    primaryEmail: string | null;
    secondaryEmail: string | null;
    primaryPhone: string | null;
    secondaryPhone: string | null;
  } | null;
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
    contactName: contact?.tenantName ?? '',
    contactPhone: contact?.primaryPhone ?? null,
    contactEmail: contact?.primaryEmail ?? null,
    inspectorName: found.inspectorName ?? null,
    branchName: found.branchName ?? '',
    serviceTypeName: found.serviceTypeName ?? '',
    isOverdue: isAppointmentOverdue(appointment.status, appointment.scheduledDate),
    cancellationReason: appointment.reason,
    contact: contact
      ? {
          id: contact.id,
          tenantName: contact.tenantName,
          primaryEmail: contact.primaryEmail,
          secondaryEmail: contact.secondaryEmail,
          primaryPhone: contact.primaryPhone,
          secondaryPhone: contact.secondaryPhone,
        }
      : null,
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
  constructor(private readonly appointmentRepo: IAppointmentRepository) {}

  async execute(input: GetAppointmentInput): Promise<GetAppointmentOutput> {
    const { appointmentId, actor } = input;

    if (
      actor.role !== 'AM' &&
      actor.role !== 'OP' &&
      actor.role !== 'CL_ADMIN' &&
      actor.role !== 'CL_USER' &&
      actor.role !== 'INSP'
    ) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    // AM/OP/INSP: global access (no tenant scoping), INSP verified after
    // CL_ADMIN/CL_USER: scoped by tenantId from JWT
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
