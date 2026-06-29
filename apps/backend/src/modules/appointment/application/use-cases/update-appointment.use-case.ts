import { type AuthContext, type AppointmentContactRole } from '@properfy/shared';
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
} from '../../domain/appointment.errors';
import { validateEditedSchedule } from '@properfy/shared';
import type { RestrictionSource } from '@properfy/shared';
import type { IAppointmentTimeSlotRepository } from '../../../appointment-time-slot/domain/appointment-time-slot.repository';
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
    timeSlot?: string; // HH:mm-HH:mm
    keyRequired?: boolean;
    meetingLocation?: string | null;
    keyLocation?: string | null;
    notes?: string | null;
    observation?: string | null;
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
  timeSlot: string;
  keyRequired: boolean;
  meetingLocation: string | null;
  keyLocation: string | null;
  tenantConfirmationStatus: string;
  priceAmount: number;
  payoutAmount: number;
  pricingRuleSnapshotJson: Record<string, unknown>;
  notes: string | null;
  observation: string | null;
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
    private readonly clock: Clock = new SystemClock(),
    private readonly appCredentialRepo?: IAppCredentialRepository,
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
      observation: appointment.observation,
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

    // TZ-aware past-date/time validation for date or time changes. Falls back to UTC (R7).
    if (data.scheduledDate !== undefined || data.timeSlot !== undefined) {
      const tz = input.actorTimezone ?? 'UTC';
      const existingDateStr = appointment.scheduledDate.toISOString().slice(0, 10);
      const scheduleCheck = validateEditedSchedule({
        existingDate: existingDateStr,
        existingTimeSlot: appointment.timeSlot,
        newDate: data.scheduledDate,
        newTimeSlot: data.timeSlot,
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
    if (data.timeSlot !== undefined) updateData.timeSlot = data.timeSlot;
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
          snapshotName: data.contact.tenantName,
          snapshotEmail: data.contact.primaryEmail ?? null,
          snapshotPhone: data.contact.primaryPhone ?? null,
        });
      } else {
        const now = this.clock.now();
        const contact = new AppointmentContactEntity({
          id: crypto.randomUUID(), appointmentId, contactId: null,
          role: 'TENANT' as AppointmentContactRole, isPrimary: true,
          snapshotName: data.contact.tenantName, snapshotEmail: data.contact.primaryEmail ?? null,
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
      timeSlot: updateData.timeSlot ?? appointment.timeSlot,
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
      timeSlot: after.timeSlot as string,
      keyRequired: after.keyRequired as boolean,
      meetingLocation: after.meetingLocation,
      keyLocation: after.keyLocation,
      tenantConfirmationStatus: appointment.tenantConfirmationStatus,
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
