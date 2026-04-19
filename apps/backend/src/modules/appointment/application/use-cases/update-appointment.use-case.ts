import { todayUTCDateString, type AuthContext, type AppointmentContactRole } from '@properfy/shared';
import { ValidationError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import type { IContactRepository } from '../../../contact/domain/contact.repository';
import { ContactEntity } from '../../../contact/domain/contact.entity';
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
    /** @deprecated Use contacts array */
    contact?: {
      tenantName: string;
      primaryEmail?: string | null;
      secondaryEmail?: string | null;
      primaryPhone?: string | null;
      secondaryPhone?: string | null;
    };
    /** New contacts array (feature 021). When present, replaces all junction rows. */
    contacts?: Array<{
      contactId?: string;
      inline?: {
        type: string;
        displayName: string;
        company?: string | null;
        primaryEmail?: string | null;
        primaryPhone?: string | null;
        additionalChannels?: Array<{ channel: string; value: string; label?: string }>;
        notes?: string | null;
      };
      role: string;
      isPrimary: boolean;
    }>;
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
    private readonly authorizationService: AuthorizationService,
    private readonly tenantRepo?: ITenantRepository,
    private readonly timeSlotRepo?: IAppointmentTimeSlotRepository,
    private readonly contactRepo?: IContactRepository,
  ) {}

  async execute(input: UpdateAppointmentInput): Promise<UpdateAppointmentOutput> {
    const { appointmentId, data, actor } = input;

    // RBAC
    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN', 'CL_USER'], { action: 'appointment.update', entityType: 'Appointment' });

    // CL_USER must have reschedule_appointments permission when changing date/time
    if (data.scheduledDate !== undefined || data.timeSlot !== undefined) {
      this.authorizationService.assertClUserPermission(actor, 'reschedule_appointments');
    }

    // Resolve tenantId for lookup. Only AM is cross-tenant; OP is tenant-
    // scoped per Sprint 1 W-4-IMPL (CORRECTION-001 close-it, 2026-04-13).
    const tenantId = actor.role === 'AM' ? null : actor.tenantId;

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

    // Upsert contacts
    if (data.contacts !== undefined && this.contactRepo) {
      // New path: contacts array replacement (feature 021)
      if (data.contacts.length === 0) {
        throw new ValidationError('APPOINTMENT_CONTACTS_REQUIRED', 'At least one contact is required');
      }
      // Delete old junction rows, insert new with fresh snapshots
      await this.appointmentRepo.deleteContactsByAppointmentId(appointmentId);
      const now = new Date();
      for (const entry of data.contacts) {
        let cId: string | null = null;
        let sName: string;
        let sEmail: string | null;
        let sPhone: string | null;

        if (entry.contactId) {
          const reg = await this.contactRepo.findById(entry.contactId, appointment.tenantId);
          if (!reg) throw new ValidationError('APPOINTMENT_CONTACT_NOT_FOUND', `Contact ${entry.contactId} not found`);
          if (!reg.isActive) throw new ValidationError('APPOINTMENT_CONTACT_INACTIVE', `Contact ${entry.contactId} is not active`);
          cId = reg.id;
          sName = reg.displayName;
          sEmail = reg.primaryEmail;
          sPhone = reg.primaryPhone;
        } else if (entry.inline) {
          // Reuse an existing active registry contact whose email/phone
          // matches the inline payload before creating a new row. This keeps
          // repeated edits idempotent and prevents the
          // contacts_tenant_email_active_unique /
          // contacts_tenant_phone_active_unique partial indexes from
          // surfacing as a 500.
          const inlineEmail = entry.inline.primaryEmail ?? null;
          const inlinePhone = entry.inline.primaryPhone ?? null;
          const existing = await this.contactRepo.findActiveByEmailOrPhone(
            appointment.tenantId,
            inlineEmail,
            inlinePhone,
          );
          if (existing) {
            cId = existing.id;
            sName = existing.displayName;
            sEmail = existing.primaryEmail;
            sPhone = existing.primaryPhone;
          } else {
            const nc = new ContactEntity({
              id: crypto.randomUUID(), tenantId: appointment.tenantId,
              type: entry.inline.type as any, displayName: entry.inline.displayName,
              company: entry.inline.company ?? null,
              primaryEmail: inlineEmail, primaryPhone: inlinePhone,
              additionalChannels: (entry.inline.additionalChannels ?? []) as any,
              notes: entry.inline.notes ?? null, isActive: true, createdAt: now, updatedAt: now,
            });
            await this.contactRepo.save(nc);
            cId = nc.id; sName = nc.displayName; sEmail = nc.primaryEmail; sPhone = nc.primaryPhone;
          }
        } else {
          throw new ValidationError('APPOINTMENT_CONTACT_INVALID', 'Each contact must have contactId or inline');
        }

        await this.appointmentRepo.saveContact(new AppointmentContactEntity({
          id: crypto.randomUUID(), appointmentId, contactId: cId,
          role: entry.role as AppointmentContactRole, isPrimary: entry.isPrimary,
          snapshotName: sName, snapshotEmail: sEmail, snapshotPhone: sPhone,
          tenantName: sName, primaryEmail: sEmail, secondaryEmail: null,
          primaryPhone: sPhone, secondaryPhone: null, createdAt: now, updatedAt: now,
        }));
      }
    } else if (data.contact !== undefined) {
      // Legacy path: single contact upsert (backward compat)
      if (found.contact) {
        await this.appointmentRepo.updateContact(appointmentId, {
          tenantName: data.contact.tenantName,
          primaryEmail: data.contact.primaryEmail ?? null,
          secondaryEmail: data.contact.secondaryEmail ?? null,
          primaryPhone: data.contact.primaryPhone ?? null,
          secondaryPhone: data.contact.secondaryPhone ?? null,
        });
      } else {
        const now = new Date();
        const contact = new AppointmentContactEntity({
          id: crypto.randomUUID(), appointmentId, contactId: null,
          role: 'TENANT' as AppointmentContactRole, isPrimary: true,
          snapshotName: data.contact.tenantName, snapshotEmail: data.contact.primaryEmail ?? null,
          snapshotPhone: data.contact.primaryPhone ?? null,
          tenantName: data.contact.tenantName, primaryEmail: data.contact.primaryEmail ?? null,
          secondaryEmail: data.contact.secondaryEmail ?? null,
          primaryPhone: data.contact.primaryPhone ?? null, secondaryPhone: data.contact.secondaryPhone ?? null,
          createdAt: now, updatedAt: now,
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
