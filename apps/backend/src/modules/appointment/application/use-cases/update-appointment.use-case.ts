import { todayUTCDateString, type AuthContext } from '@properfy/shared';
import { ForbiddenError, ValidationError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { AppointmentContactEntity } from '../../domain/appointment-contact.entity';
import { AppointmentRestrictionEntity } from '../../domain/appointment-restriction.entity';
import {
  AppointmentNotFoundError,
  AppointmentUpdateNotAllowedError,
  AppointmentPastDateError,
} from '../../domain/appointment.errors';
import type { RestrictionSource } from '@properfy/shared';
import type { IAppointmentTimeSlotRepository } from '../../../appointment-time-slot/domain/appointment-time-slot.repository';

export interface UpdateAppointmentInput {
  appointmentId: string;
  data: {
    scheduledDate?: string; // YYYY-MM-DD
    timeSlot?: string; // HH:mm-HH:mm
    keyRequired?: boolean;
    meetingLocation?: string | null;
    keyLocation?: string | null;
    notes?: string | null;
    customFields?: Record<string, unknown> | null;
    contact?: {
      tenantName: string;
      primaryEmail?: string | null;
      secondaryEmail?: string | null;
      primaryPhone?: string | null;
      secondaryPhone?: string | null;
    };
    restriction?: {
      isHome: boolean;
      unavailableDays?: string[] | null;
      unavailableHours?: string[] | null;
      notes?: string | null;
      source: RestrictionSource;
    } | null;
  };
  actor: AuthContext;
}

export interface UpdateAppointmentOutput {
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
  createdAt: Date;
  updatedAt: Date;
}

export class UpdateAppointmentUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: AuditService,
    private readonly tenantRepo?: ITenantRepository,
    private readonly timeSlotRepo?: IAppointmentTimeSlotRepository,
    private readonly authorizationService?: AuthorizationService,
  ) {}

  async execute(input: UpdateAppointmentInput): Promise<UpdateAppointmentOutput> {
    const { appointmentId, data, actor } = input;

    // RBAC
    if (
      actor.role !== 'AM' &&
      actor.role !== 'OP' &&
      actor.role !== 'CL_ADMIN' &&
      actor.role !== 'CL_USER'
    ) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    // CL_USER must have reschedule_appointments permission when changing date/time
    if (
      (data.scheduledDate !== undefined || data.timeSlot !== undefined) &&
      this.authorizationService
    ) {
      this.authorizationService.assertClUserPermission(actor, 'reschedule_appointments');
    }

    // Resolve tenantId for lookup (null = global access for AM/OP)
    const tenantId =
      actor.role === 'AM' || actor.role === 'OP' ? null : actor.tenantId;

    const found = await this.appointmentRepo.findById(appointmentId, tenantId);
    if (!found || found.appointment.isDeleted()) {
      throw new AppointmentNotFoundError();
    }

    // CL roles: verify tenant scope
    if (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
      if (found.appointment.tenantId !== actor.tenantId) {
        throw new AppointmentNotFoundError();
      }
    }

    const appointment = found.appointment;

    // Guard: can only update DRAFT or AWAITING_INSPECTOR
    if (!appointment.isEditable()) {
      throw new AppointmentUpdateNotAllowedError();
    }

    // Capture before state for audit
    const before = {
      status: appointment.status,
      scheduledDate: appointment.scheduledDate,
      timeSlot: appointment.timeSlot,
      keyRequired: appointment.keyRequired,
      meetingLocation: appointment.meetingLocation,
      keyLocation: appointment.keyLocation,
      notes: appointment.notes,
      customFieldsJson: appointment.customFieldsJson,
    };

    // Validate timeSlot against effective catalog
    if (data.timeSlot !== undefined && this.timeSlotRepo) {
      const effectiveSlots = await this.timeSlotRepo.findEffective(
        appointment.tenantId,
        appointment.branchId,
      );
      const valid = effectiveSlots.some(
        (s) => s.compositeValue === data.timeSlot,
      );
      if (!valid) {
        throw new ValidationError(
          `Time slot "${data.timeSlot}" is not available for this branch`,
        );
      }
    }

    // Reject past dates (AM/OP bypass) — UTC comparison for server consistency
    if (data.scheduledDate !== undefined) {
      if (data.scheduledDate < todayUTCDateString() && actor.role !== 'AM' && actor.role !== 'OP') {
        throw new AppointmentPastDateError();
      }
    }

    // Build update payload for appointment fields
    const updateData: Parameters<IAppointmentRepository['update']>[2] = {};
    if (data.scheduledDate !== undefined) {
      updateData.scheduledDate = new Date(data.scheduledDate);
    }
    if (data.timeSlot !== undefined) updateData.timeSlot = data.timeSlot;
    if (data.keyRequired !== undefined) updateData.keyRequired = data.keyRequired;
    if (data.meetingLocation !== undefined)
      updateData.meetingLocation = data.meetingLocation ?? null;
    if (data.keyLocation !== undefined)
      updateData.keyLocation = data.keyLocation ?? null;
    if (data.notes !== undefined) updateData.notes = data.notes ?? null;
    if (data.customFields !== undefined)
      updateData.customFieldsJson = data.customFields ?? null;

    await this.appointmentRepo.update(
      appointmentId,
      appointment.tenantId,
      updateData,
    );

    // Upsert contact
    if (data.contact !== undefined) {
      if (found.contact) {
        // Update existing contact
        await this.appointmentRepo.updateContact(appointmentId, {
          tenantName: data.contact.tenantName,
          primaryEmail: data.contact.primaryEmail ?? null,
          secondaryEmail: data.contact.secondaryEmail ?? null,
          primaryPhone: data.contact.primaryPhone ?? null,
          secondaryPhone: data.contact.secondaryPhone ?? null,
        });
      } else {
        // Create new contact
        const now = new Date();
        const contact = new AppointmentContactEntity({
          id: crypto.randomUUID(),
          appointmentId,
          tenantName: data.contact.tenantName,
          primaryEmail: data.contact.primaryEmail ?? null,
          secondaryEmail: data.contact.secondaryEmail ?? null,
          primaryPhone: data.contact.primaryPhone ?? null,
          secondaryPhone: data.contact.secondaryPhone ?? null,
          createdAt: now,
          updatedAt: now,
        });
        await this.appointmentRepo.saveContact(contact);
      }
    }

    // Upsert restriction: delete existing, create new if provided
    if (data.restriction !== undefined) {
      await this.appointmentRepo.deleteRestrictionsByAppointmentId(appointmentId);
      if (data.restriction !== null) {
        const now = new Date();
        const restriction = new AppointmentRestrictionEntity({
          id: crypto.randomUUID(),
          appointmentId,
          isHome: data.restriction.isHome,
          unavailableDaysJson: data.restriction.unavailableDays ?? null,
          unavailableHoursJson: data.restriction.unavailableHours ?? null,
          notes: data.restriction.notes ?? null,
          source: data.restriction.source,
          createdAt: now,
          updatedAt: now,
        });
        await this.appointmentRepo.saveRestriction(restriction);
      }
    }

    // Capture after state
    const after = {
      scheduledDate: updateData.scheduledDate ?? appointment.scheduledDate,
      timeSlot: updateData.timeSlot ?? appointment.timeSlot,
      keyRequired: updateData.keyRequired ?? appointment.keyRequired,
      meetingLocation: updateData.meetingLocation ?? appointment.meetingLocation,
      keyLocation: updateData.keyLocation ?? appointment.keyLocation,
      notes: updateData.notes ?? appointment.notes,
      customFieldsJson: updateData.customFieldsJson ?? appointment.customFieldsJson,
    };

    this.auditService.log({
      action: 'appointment.updated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Appointment',
      entityId: appointmentId,
      tenantId: appointment.tenantId,
      before,
      after,
    });

    return {
      id: appointment.id,
      tenantId: appointment.tenantId,
      branchId: appointment.branchId,
      propertyId: appointment.propertyId,
      serviceTypeId: appointment.serviceTypeId,
      inspectorId: appointment.inspectorId,
      status: appointment.status,
      scheduledDate: (updateData.scheduledDate ?? appointment.scheduledDate) as Date,
      timeSlot: (updateData.timeSlot ?? appointment.timeSlot) as string,
      keyRequired: (updateData.keyRequired ?? appointment.keyRequired) as boolean,
      meetingLocation: (updateData.meetingLocation ?? appointment.meetingLocation) as string | null,
      keyLocation: (updateData.keyLocation ?? appointment.keyLocation) as string | null,
      tenantConfirmationStatus: appointment.tenantConfirmationStatus,
      priceAmount: appointment.priceAmount,
      payoutAmount: appointment.payoutAmount,
      pricingRuleSnapshotJson: appointment.pricingRuleSnapshotJson,
      notes: (updateData.notes ?? appointment.notes) as string | null,
      customFieldsJson: (updateData.customFieldsJson ?? appointment.customFieldsJson) as Record<string, unknown> | null,
      reason: appointment.reason,
      createdByUserId: appointment.createdByUserId,
      createdAt: appointment.createdAt,
      updatedAt: new Date(),
    };
  }
}
