import type { AuthContext, FyContactUpdated } from '@properfy/shared';
import { toE164Au } from '@properfy/shared';

import type { AuditService } from '../../../../shared/infrastructure/audit';
import { NotFoundError } from '../../../../shared/domain/errors';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import { AppointmentNotFoundError } from '../../../appointment/domain/appointment.errors';
import type { IContactRepository } from '../../../contact/domain/contact.repository';
import { ContactEmailAlreadyExistsError } from '../../../contact/domain/contact.errors';

export interface UpdateFyAppointmentContactInput {
  appointmentId: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  actor: AuthContext;
}

/**
 * Updates the primary contact snapshot on the appointment and dual-writes to
 * the contact registry — the same semantics as the tenant-portal contact
 * update (feature 021 FR-053), plus name support and E.164 phone
 * normalisation, with the machine principal as audit actor.
 */
export class UpdateFyAppointmentContactUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly contactRepo: IContactRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: UpdateFyAppointmentContactInput): Promise<FyContactUpdated> {
    const result = await this.appointmentRepo.findById(input.appointmentId, null);
    if (!result) {
      throw new AppointmentNotFoundError();
    }
    const { appointment, contact } = result;
    if (!contact) {
      throw new NotFoundError('CONTACT_NOT_FOUND', 'Appointment has no primary contact');
    }

    const phone =
      input.phone === undefined || input.phone === null ? input.phone : toE164Au(input.phone);

    const before = {
      name: contact.effectiveName,
      email: contact.effectiveEmail,
      phone: contact.effectivePhone,
    };

    const snapshotUpdate: Partial<{
      snapshotName: string;
      snapshotEmail: string | null;
      snapshotPhone: string | null;
    }> = {};
    if (input.name !== undefined) snapshotUpdate.snapshotName = input.name;
    if (input.email !== undefined) snapshotUpdate.snapshotEmail = input.email;
    if (phone !== undefined) snapshotUpdate.snapshotPhone = phone;

    await this.appointmentRepo.updateContactSnapshot(
      input.appointmentId,
      contact.id,
      snapshotUpdate,
    );

    // Dual-write to the contact registry; an email-uniqueness conflict skips
    // the registry silently (audited) — mirrors the portal behaviour.
    if (contact.contactId) {
      const registryUpdate: Partial<{
        displayName: string;
        primaryEmail: string | null;
        primaryPhone: string | null;
      }> = {};
      if (input.name !== undefined) registryUpdate.displayName = input.name;
      if (input.email !== undefined) registryUpdate.primaryEmail = input.email;
      if (phone !== undefined) registryUpdate.primaryPhone = phone;

      try {
        if (registryUpdate.primaryEmail) {
          const conflict = await this.contactRepo.existsByEmail(
            appointment.tenantId,
            registryUpdate.primaryEmail,
            contact.contactId,
          );
          if (conflict) throw new ContactEmailAlreadyExistsError();
        }
        await this.contactRepo.update(contact.contactId, appointment.tenantId, registryUpdate);
      } catch (err) {
        if (!(err instanceof ContactEmailAlreadyExistsError)) throw err;
        this.auditService.log({
          action: 'contact.fy_update_skipped_conflict',
          actorType: 'SYSTEM',
          actorId: input.actor.userId,
          entityType: 'contact',
          entityId: contact.contactId,
          tenantId: appointment.tenantId,
          metadata: {
            appointmentId: input.appointmentId,
            conflictingEmail: registryUpdate.primaryEmail,
          },
        });
      }
    }

    const after = {
      name: input.name ?? before.name,
      email: input.email !== undefined ? input.email : before.email,
      phone: phone !== undefined ? phone : before.phone,
    };

    this.auditService.log({
      action: 'fy.contact_updated',
      actorType: 'SYSTEM',
      actorId: input.actor.userId,
      entityType: 'appointment_contact',
      entityId: input.appointmentId,
      tenantId: appointment.tenantId,
      before,
      after,
    });

    return { contact: after };
  }
}
