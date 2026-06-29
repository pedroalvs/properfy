import { type AuthContext, type AppointmentContactRole, type AppointmentCustomField } from '@properfy/shared';
import { NotFoundError, ValidationError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import type { IContactRepository } from '../../../contact/domain/contact.repository';
import { ContactEntity } from '../../../contact/domain/contact.entity';
import { ContactNoChannelError } from '../../../contact/domain/contact.errors';
import type { IAppCredentialRepository } from '../../../app-credential/domain/app-credential.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { AppointmentContactEntity } from '../../domain/appointment-contact.entity';
import { AppointmentRestrictionEntity } from '../../domain/appointment-restriction.entity';
import {
  AppointmentNotFoundError,
  AppointmentUpdateNotAllowedError,
  AppointmentDateInPastError,
  AppointmentTimeInPastError,
  AppointmentInServiceGroupError,
} from '../../domain/appointment.errors';
import type { IRentalTenantPortalTokenRepository } from '../../../rental-tenant-portal/domain/rental-tenant-portal-token.repository';
import type { ConfirmationCycleService } from '../services/confirmation-cycle.service';
import { validateEditedSchedule } from '@properfy/shared';
import type { RestrictionSource } from '@properfy/shared';
import { SystemClock, type Clock } from '../../../../shared/domain/clock';

/**
 * Resolves a patchable nullable field's post-update value for the audit `after`
 * snapshot and the response payload. A value present in the patch — including an
 * explicit `null` (clear) — wins; an absent key keeps the entity's current value.
 *
 * Using `?? current` here (the old approach) silently resurrects the previous
 * value when the field is cleared to `null`, so the audit log claims "unchanged"
 * and the PATCH response returns the stale value even though the DB stored `null`.
 */
function resolvePatchedField<T>(provided: T | null | undefined, current: T | null): T | null {
  return provided !== undefined ? provided ?? null : current;
}

export interface UpdateAppointmentInput {
  appointmentId: string;
  data: {
    scheduledDate?: string; // YYYY-MM-DD
    timeSlotStart?: string; // HH:mm
    timeSlotEnd?: string; // HH:mm
    keyRequired?: boolean;
    meetingLocation?: string | null;
    keyLocation?: string | null;
    notes?: string | null;
    observation?: string | null;
    customFields?: AppointmentCustomField[] | null;
    /** @deprecated Use contacts array */
    contact?: {
      rentalTenantName: string;
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
    /** App credentials to link (live reference). When present, replaces all links (empty array clears). */
    appCredentialIds?: string[];
    restriction?: {
      isHome: boolean;
      unavailableDays?: string[] | null;
      unavailableHours?: string[] | null;
      notes?: string | null;
      source: RestrictionSource;
    } | null;
  };
  actorTimezone?: string;
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
  timeSlotStart: string;
  timeSlotEnd: string;
  keyRequired: boolean;
  meetingLocation: string | null;
  keyLocation: string | null;
  rentalTenantConfirmationStatus: string;
  priceAmount: number;
  payoutAmount: number;
  pricingRuleSnapshotJson: Record<string, unknown>;
  notes: string | null;
  observation: string | null;
  customFieldsJson: AppointmentCustomField[] | null;
  reason: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Structural interface for the reschedule notification handler — keeps the
 * appointment module decoupled from the notification module (same pattern as
 * OnTransitionHandler in execute-status-transition.use-case.ts).
 */
export interface OnAdminRescheduleHandler {
  execute(input: { appointmentId: string; tenantId: string | null }): Promise<void>;
}

export class UpdateAppointmentUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly tenantRepo?: ITenantRepository,
    private readonly contactRepo?: IContactRepository,
    private readonly clock: Clock = new SystemClock(),
    private readonly appCredentialRepo?: IAppCredentialRepository,
    /** Optional. When wired, a real date/time change rotates the active confirmation cycle. */
    private readonly confirmationCycleService?: ConfirmationCycleService,
    /** Optional. When wired, a real date/time change revokes all active portal tokens. */
    private readonly portalTokenRepo?: IRentalTenantPortalTokenRepository,
    /** Optional. When wired, a date/time change on a SCHEDULED appointment notifies the rental tenant. */
    private readonly onAdminRescheduleHandler?: OnAdminRescheduleHandler,
  ) {}

  async execute(input: UpdateAppointmentInput): Promise<UpdateAppointmentOutput> {
    const { appointmentId, data, actor } = input;

    // RBAC
    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN', 'CL_USER'], { action: 'appointment.update', entityType: 'Appointment' });

    const timeChanged = data.timeSlotStart !== undefined || data.timeSlotEnd !== undefined;

    // CL_USER must have reschedule_appointments permission when changing date/time
    if (data.scheduledDate !== undefined || timeChanged) {
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

    // Guard: editable in any non-terminal status (only CANCELLED/DONE blocked)
    if (!appointment.isScheduleEditable()) {
      throw new AppointmentUpdateNotAllowedError();
    }

    // Detect a REAL schedule change (submitting the current values is a no-op)
    const currentDateStr = appointment.scheduledDate.toISOString().slice(0, 10);
    const dateChanged = data.scheduledDate !== undefined && data.scheduledDate !== currentDateStr;
    const timeChangedReal =
      (data.timeSlotStart !== undefined && data.timeSlotStart !== appointment.timeSlotStart) ||
      (data.timeSlotEnd !== undefined && data.timeSlotEnd !== appointment.timeSlotEnd);
    const scheduleChanged = dateChanged || timeChangedReal;

    // Appointments in a service group have their time window managed by the
    // group (automatic time-slot sync) — individual date/time edits would
    // break group coherence. Reschedule the whole group via the map/bulk flow.
    if (scheduleChanged && appointment.serviceGroupId) {
      throw new AppointmentInServiceGroupError();
    }

    // Capture before state for audit
    const before = {
      status: appointment.status,
      scheduledDate: appointment.scheduledDate,
      timeSlotStart: appointment.timeSlotStart,
      timeSlotEnd: appointment.timeSlotEnd,
      keyRequired: appointment.keyRequired,
      meetingLocation: appointment.meetingLocation,
      keyLocation: appointment.keyLocation,
      notes: appointment.notes,
      observation: appointment.observation,
      customFieldsJson: appointment.customFieldsJson,
    };

    // TZ-aware past-date/time validation for date or time changes. Falls back to UTC (R7).
    // `validateEditedSchedule` accepts a bare HH:mm start (it splits on '-', a no-op here).
    if (data.scheduledDate !== undefined || timeChanged) {
      const tz = input.actorTimezone ?? 'UTC';
      const existingDateStr = appointment.scheduledDate.toISOString().slice(0, 10);
      const scheduleCheck = validateEditedSchedule({
        existingDate: existingDateStr,
        existingTimeSlot: appointment.timeSlotStart,
        newDate: data.scheduledDate,
        newTimeSlot: data.timeSlotStart,
        tz,
      });
      if (!scheduleCheck.ok) {
        throw scheduleCheck.code === 'TIME_IN_PAST' ? new AppointmentTimeInPastError() : new AppointmentDateInPastError();
      }
    }

    // Build update payload for appointment fields
    const updateData: Parameters<IAppointmentRepository['update']>[2] = {};
    if (data.scheduledDate !== undefined) {
      updateData.scheduledDate = new Date(data.scheduledDate);
    }
    if (data.timeSlotStart !== undefined) updateData.timeSlotStart = data.timeSlotStart;
    if (data.timeSlotEnd !== undefined) updateData.timeSlotEnd = data.timeSlotEnd;
    if (data.keyRequired !== undefined) updateData.keyRequired = data.keyRequired;
    if (data.meetingLocation !== undefined)
      updateData.meetingLocation = data.meetingLocation ?? null;
    if (data.keyLocation !== undefined)
      updateData.keyLocation = data.keyLocation ?? null;
    if (data.notes !== undefined) updateData.notes = data.notes ?? null;
    if (data.observation !== undefined)
      updateData.observation = data.observation ?? null;
    if (data.customFields !== undefined)
      updateData.customFieldsJson = data.customFields ?? null;

    // No active cycle to rotate — reset the denormalized confirmation status
    // directly so a previous CONFIRMED does not survive a date/time change.
    if (
      scheduleChanged &&
      !appointment.activeConfirmationCycleId &&
      appointment.rentalTenantConfirmationStatus !== 'PENDING'
    ) {
      updateData.rentalTenantConfirmationStatus = 'PENDING';
    }

    // Confirmation reset + token revoke run BEFORE the appointment update.
    // The three writes cannot share a transaction (the appointment repository
    // has no tx-aware update — same architectural gap as reopen-for-reschedule),
    // so ordering is chosen for a conservative failure mode: if a later step
    // fails, the appointment still holds the OLD date and `scheduleChanged`
    // re-detects the change on retry, re-running the reset. The reverse order
    // would let a stale CONFIRMED cycle survive a partial failure, because the
    // retry would see the new date already persisted and skip the reset.
    if (scheduleChanged) {
      // Supersede the active cycle and open a new PENDING one for the new
      // date/time (denorm cache updated atomically inside the service).
      if (this.confirmationCycleService && appointment.activeConfirmationCycleId) {
        const newDate = updateData.scheduledDate ?? appointment.scheduledDate;
        const newStart = updateData.timeSlotStart ?? appointment.timeSlotStart;
        const newEnd = updateData.timeSlotEnd ?? appointment.timeSlotEnd;
        await this.confirmationCycleService.rotateOnDateChange(
          appointmentId,
          appointment.tenantId,
          newDate,
          `${newStart}-${newEnd}`,
          dateChanged ? 'DATE_CHANGED' : 'TIME_CHANGED',
        );
      }

      // Existing portal tokens point at the old date — revoke them (026 §FR-543 pattern).
      if (this.portalTokenRepo) {
        await this.portalTokenRepo.revokeAllForAppointment(appointmentId);
        this.auditService.log({
          action: 'rental_tenant_portal.tokens_revoked',
          actorType: 'USER',
          actorId: actor.userId,
          entityType: 'Appointment',
          entityId: appointmentId,
          tenantId: appointment.tenantId,
          metadata: { reason: 'schedule_edit', initiatedBy: actor.role },
        });
      }
    }

    await this.appointmentRepo.update(
      appointmentId,
      appointment.tenantId,
      updateData,
    );

    // SCHEDULED keeps its status and inspector, so no →SCHEDULED transition will
    // fire INSPECTION_NOTICE — notify the rental tenant of the new date here,
    // after the update is persisted. Fire-and-forget: a notification failure
    // must not fail the PATCH.
    if (scheduleChanged && appointment.status === 'SCHEDULED' && this.onAdminRescheduleHandler) {
      try {
        await this.onAdminRescheduleHandler.execute({
          appointmentId,
          tenantId: appointment.tenantId,
        });
      } catch {
        // Handler logs and counts its own failures.
      }
    }

    // Upsert contacts
    if (data.contacts !== undefined && this.contactRepo) {
      // New path: contacts array replacement (feature 021)
      if (data.contacts.length === 0) {
        throw new ValidationError('APPOINTMENT_CONTACTS_REQUIRED', 'At least one contact is required');
      }
      // Delete old junction rows, insert new with fresh snapshots
      await this.appointmentRepo.deleteContactsByAppointmentId(appointmentId);
      const now = this.clock.now();
      for (const entry of data.contacts) {
        let cId: string | null = null;
        let sName: string;
        let sEmail: string | null;
        let sPhone: string | null;

        if (entry.contactId) {
          // 024 §FR-301/303 (BUG-024-001 → BUG-024-002 fix) — paridade com
          // create-appointment. Lookup global; visibility para CL roles via
          // owns-or-junction. NotFoundError 404 colapsa "não existe" e "não
          // visível" (FR-022 + OBS-024-003). Ver create-appointment.use-case
          // para o racional completo.
          const isCrossTenantActor = actor.role === 'AM' || actor.role === 'OP';
          const reg = await this.contactRepo.findById(entry.contactId, null);
          if (!reg) throw new NotFoundError('APPOINTMENT_CONTACT_NOT_FOUND', `Contact ${entry.contactId} not found`);
          if (!isCrossTenantActor) {
            const ownsContact = reg.tenantId === appointment.tenantId;
            const visible = ownsContact
              || await this.contactRepo.existsLinkedToTenant(entry.contactId, appointment.tenantId);
            if (!visible) throw new NotFoundError('APPOINTMENT_CONTACT_NOT_FOUND', `Contact ${entry.contactId} not found`);
          }
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
            if (!inlineEmail && !inlinePhone && (entry.inline.additionalChannels ?? []).length === 0) {
              throw new ContactNoChannelError();
            }
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
          createdAt: now, updatedAt: now,
        }));
      }
    } else if (data.contact !== undefined) {
      // Legacy path: single contact upsert (backward compat)
      if (found.contact) {
        await this.appointmentRepo.updateContactSnapshot(appointmentId, found.contact.id, {
          snapshotName: data.contact.rentalTenantName,
          snapshotEmail: data.contact.primaryEmail ?? null,
          snapshotPhone: data.contact.primaryPhone ?? null,
        });
      } else {
        const now = this.clock.now();
        const contact = new AppointmentContactEntity({
          id: crypto.randomUUID(), appointmentId, contactId: null,
          role: 'RENTAL_TENANT' as AppointmentContactRole, isPrimary: true,
          snapshotName: data.contact.rentalTenantName, snapshotEmail: data.contact.primaryEmail ?? null,
          snapshotPhone: data.contact.primaryPhone ?? null,
          createdAt: now, updatedAt: now,
        });
        await this.appointmentRepo.saveContact(contact);
      }
    }

    // Replace app-credential links (live reference). When the key is present
    // we replace the full set; an empty array clears all links. Each id must
    // belong to this appointment's tenant and be active.
    if (data.appCredentialIds !== undefined && this.appCredentialRepo) {
      const ids = [...new Set(data.appCredentialIds)];
      if (ids.length > 0) {
        const found = await this.appCredentialRepo.findByIds(ids);
        const byId = new Map(found.map((a) => [a.id, a]));
        for (const id of ids) {
          const cred = byId.get(id);
          if (!cred || cred.tenantId !== appointment.tenantId) {
            throw new NotFoundError('APPOINTMENT_APP_CREDENTIAL_NOT_FOUND', `App credential ${id} not found`);
          }
          if (!cred.isActive) {
            throw new ValidationError('APPOINTMENT_APP_CREDENTIAL_INACTIVE', `App credential ${id} is not active`);
          }
        }
      }
      await this.appCredentialRepo.replaceAppointmentLinks(appointmentId, ids);
    }

    // Upsert restriction: delete existing, create new if provided
    if (data.restriction !== undefined) {
      await this.appointmentRepo.deleteRestrictionsByAppointmentId(appointmentId);
      if (data.restriction !== null) {
        const now = this.clock.now();
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

    // Capture after state. scheduledDate/timeSlot/keyRequired never become null,
    // so `??` is safe for them; the nullable fields below must resolve precisely
    // (see resolvePatchedField) so clearing-to-null is reflected accurately in
    // both the audit snapshot and the response.
    const after = {
      scheduledDate: updateData.scheduledDate ?? appointment.scheduledDate,
      timeSlotStart: updateData.timeSlotStart ?? appointment.timeSlotStart,
      timeSlotEnd: updateData.timeSlotEnd ?? appointment.timeSlotEnd,
      keyRequired: updateData.keyRequired ?? appointment.keyRequired,
      meetingLocation: resolvePatchedField(data.meetingLocation, appointment.meetingLocation),
      keyLocation: resolvePatchedField(data.keyLocation, appointment.keyLocation),
      notes: resolvePatchedField(data.notes, appointment.notes),
      observation: resolvePatchedField(data.observation, appointment.observation),
      customFieldsJson: resolvePatchedField(data.customFields, appointment.customFieldsJson),
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

    // Dedicated audit entry for observation edits — only when the value actually changed,
    // so the observation history stays clean and filterable (independent of appointment.updated).
    if (before.observation !== after.observation) {
      this.auditService.log({
        action: 'appointment.observation_updated',
        actorType: 'USER',
        actorId: actor.userId,
        entityType: 'Appointment',
        entityId: appointmentId,
        tenantId: appointment.tenantId,
        before: { observation: before.observation },
        after: { observation: after.observation },
      });
    }

    return {
      id: appointment.id,
      tenantId: appointment.tenantId,
      branchId: appointment.branchId,
      propertyId: appointment.propertyId,
      serviceTypeId: appointment.serviceTypeId,
      inspectorId: appointment.inspectorId,
      status: appointment.status,
      scheduledDate: after.scheduledDate as Date,
      timeSlotStart: after.timeSlotStart as string,
      timeSlotEnd: after.timeSlotEnd as string,
      keyRequired: after.keyRequired as boolean,
      meetingLocation: after.meetingLocation,
      keyLocation: after.keyLocation,
      rentalTenantConfirmationStatus: scheduleChanged
        ? 'PENDING'
        : appointment.rentalTenantConfirmationStatus,
      priceAmount: appointment.priceAmount,
      payoutAmount: appointment.payoutAmount,
      pricingRuleSnapshotJson: appointment.pricingRuleSnapshotJson,
      notes: after.notes,
      observation: after.observation,
      customFieldsJson: after.customFieldsJson,
      reason: appointment.reason,
      createdByUserId: appointment.createdByUserId,
      createdAt: appointment.createdAt,
      updatedAt: new Date(),
    };
  }
}
