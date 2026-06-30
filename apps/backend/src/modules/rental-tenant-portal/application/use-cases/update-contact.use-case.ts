import type { IRentalTenantPortalActivityRepository } from '../../domain/rental-tenant-portal-activity.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IContactRepository } from '../../../contact/domain/contact.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { TENANT_PORTAL_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import { RentalTenantPortalActivityEntity } from '../../domain/rental-tenant-portal-activity.entity';
import { ContactEmailAlreadyExistsError } from '../../../contact/domain/contact.errors';
import {
  PortalActionBlockedError,
  PortalAppointmentInactiveError,
  PortalNoContactFieldsError,
} from '../../domain/rental-tenant-portal.errors';

export interface UpdateContactInput {
  tokenId: string;
  appointmentId: string;
  isReadOnly: boolean;
  contact: {
    primaryEmail?: string | null;
    secondaryEmail?: string | null;
    primaryPhone?: string | null;
    secondaryPhone?: string | null;
  };
  ipAddress: string | null;
  userAgent: string | null;
}

const INACTIVE_STATUSES = ['CANCELLED', 'DONE', 'REJECTED'] as const;

export class UpdateContactUseCase {
  constructor(
    private readonly activityRepo: IRentalTenantPortalActivityRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: AuditService,
    private readonly domainEventBus?: DomainEventBus,
    private readonly contactRepo?: IContactRepository,
  ) {}

  async execute(input: UpdateContactInput) {
    if (input.isReadOnly) {
      throw new PortalActionBlockedError();
    }

    // 1. Validate at least one contact field is provided
    const fieldsToUpdate = Object.entries(input.contact).filter(
      ([, value]) => value !== undefined,
    );
    if (fieldsToUpdate.length === 0) {
      throw new PortalNoContactFieldsError();
    }

    // 2. Load appointment to get current contact
    const result = await this.appointmentRepo.findById(input.appointmentId, null);
    if (!result) {
      throw new PortalAppointmentInactiveError();
    }

    const { appointment, contact } = result;

    if (INACTIVE_STATUSES.includes(appointment.status as (typeof INACTIVE_STATUSES)[number])) {
      throw new PortalAppointmentInactiveError();
    }

    // 3. Snapshot previous contact values (only the fields being updated)
    const previousValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    for (const [field, value] of fieldsToUpdate) {
      previousValues[field] = contact ? (contact as unknown as Record<string, unknown>)[field] : null;
      newValues[field] = value;
    }

    // 4. Build update data — only include fields explicitly provided (not undefined)
    const updateData: Partial<{
      rentalTenantName: string;
      primaryEmail: string | null;
      secondaryEmail: string | null;
      primaryPhone: string | null;
      secondaryPhone: string | null;
    }> = {};

    if (input.contact.primaryEmail !== undefined) {
      updateData.primaryEmail = input.contact.primaryEmail;
    }
    if (input.contact.secondaryEmail !== undefined) {
      updateData.secondaryEmail = input.contact.secondaryEmail;
    }
    if (input.contact.primaryPhone !== undefined) {
      updateData.primaryPhone = input.contact.primaryPhone;
    }
    if (input.contact.secondaryPhone !== undefined) {
      updateData.secondaryPhone = input.contact.secondaryPhone;
    }

    // 5. Update contact (legacy fields)
    await this.appointmentRepo.updateContact(input.appointmentId, updateData);

    // 5b. Also update snapshot fields on the primary junction row (feature 021 expand phase)
    if (contact) {
      const snapshotUpdate: Partial<{ snapshotName: string; snapshotEmail: string | null; snapshotPhone: string | null }> = {};
      if (input.contact.primaryEmail !== undefined) snapshotUpdate.snapshotEmail = input.contact.primaryEmail;
      if (input.contact.primaryPhone !== undefined) snapshotUpdate.snapshotPhone = input.contact.primaryPhone;
      if (Object.keys(snapshotUpdate).length > 0) {
        await this.appointmentRepo.updateContactSnapshot(input.appointmentId, contact.id, snapshotUpdate);
      }

      // 5c. Dual-write to contact registry (feature 021 FR-053)
      // When contact_id is present, update the registry contact's live data.
      // On email uniqueness conflict, skip silently and audit.
      if (this.contactRepo && contact.contactId) {
        const registryUpdate: Partial<{ displayName: string; primaryEmail: string | null; primaryPhone: string | null }> = {};
        if (input.contact.primaryEmail !== undefined) registryUpdate.primaryEmail = input.contact.primaryEmail;
        if (input.contact.primaryPhone !== undefined) registryUpdate.primaryPhone = input.contact.primaryPhone;

        if (Object.keys(registryUpdate).length > 0) {
          try {
            // Check email uniqueness before updating (only if email changed)
            if (registryUpdate.primaryEmail !== undefined && registryUpdate.primaryEmail !== null) {
              const emailConflict = await this.contactRepo.existsByEmail(
                appointment.tenantId,
                registryUpdate.primaryEmail,
                contact.contactId,
              );
              if (emailConflict) {
                throw new ContactEmailAlreadyExistsError();
              }
            }

            await this.contactRepo.update(contact.contactId, appointment.tenantId, registryUpdate);
          } catch (err) {
            if (err instanceof ContactEmailAlreadyExistsError) {
              // Conflict: skip registry update silently, audit for operator reconciliation
              this.auditService.log({
                action: 'contact.portal_update_skipped_conflict',
                actorType: 'ANONYMOUS',
                entityType: 'contact',
                entityId: contact.contactId,
                tenantId: appointment.tenantId,
                metadata: {
                  appointmentId: input.appointmentId,
                  conflictingEmail: registryUpdate.primaryEmail,
                  reason: 'Email already exists on another active contact in this tenant',
                },
              });
            } else {
              throw err; // Re-throw unexpected errors
            }
          }
        }
      }
    }

    // 6. Record CONTACT_UPDATED activity
    const activity = new RentalTenantPortalActivityEntity({
      id: crypto.randomUUID(),
      appointmentId: input.appointmentId,
      rentalTenantPortalTokenId: input.tokenId,
      action: 'CONTACT_UPDATED',
      previousValuesJson: previousValues,
      newValuesJson: newValues,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      createdAt: new Date(),
    });
    await this.activityRepo.save(activity);

    // 7. Audit log
    this.auditService.log({
      action: 'rental_tenant_portal.contact_updated',
      actorType: 'ANONYMOUS',
      entityType: 'appointment_contact',
      entityId: input.appointmentId,
      tenantId: appointment.tenantId,
      before: previousValues,
      after: newValues,
      ipAddress: input.ipAddress ?? undefined,
    });

    // 8. Emit domain event
    if (this.domainEventBus) {
      await this.domainEventBus.emit({
        type: TENANT_PORTAL_EVENTS.CONTACT_UPDATED,
        payload: {
          appointmentId: input.appointmentId,
          tenantId: appointment.tenantId,
          tokenId: input.tokenId,
          updatedFields: Object.keys(newValues),
        },
        occurredAt: new Date(),
      });
    }

    // 9. Return the updated contact fields merged with existing (use effective accessors for fallback)
    return {
      rentalTenantName: contact?.effectiveName ?? null,
      primaryEmail:
        input.contact.primaryEmail !== undefined
          ? input.contact.primaryEmail
          : (contact?.effectiveEmail ?? null),
      secondaryEmail:
        input.contact.secondaryEmail !== undefined
          ? input.contact.secondaryEmail
          : (contact?.secondaryEmail ?? null),
      primaryPhone:
        input.contact.primaryPhone !== undefined
          ? input.contact.primaryPhone
          : (contact?.effectivePhone ?? null),
      secondaryPhone:
        input.contact.secondaryPhone !== undefined
          ? input.contact.secondaryPhone
          : (contact?.secondaryPhone ?? null),
    };
  }
}
