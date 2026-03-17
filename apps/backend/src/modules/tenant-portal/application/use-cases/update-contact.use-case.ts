import type { ITenantPortalActivityRepository } from '../../domain/tenant-portal-activity.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { TenantPortalActivityEntity } from '../../domain/tenant-portal-activity.entity';
import {
  PortalAppointmentInactiveError,
  PortalNoContactFieldsError,
} from '../../domain/tenant-portal.errors';

export interface UpdateContactInput {
  tokenId: string;
  appointmentId: string;
  contact: {
    primaryEmail?: string | null;
    secondaryEmail?: string | null;
    primaryPhone?: string | null;
    secondaryPhone?: string | null;
  };
  ipAddress: string | null;
  userAgent: string | null;
}

export class UpdateContactUseCase {
  constructor(
    private readonly activityRepo: ITenantPortalActivityRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: UpdateContactInput) {
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

    // 3. Snapshot previous contact values (only the fields being updated)
    const previousValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    for (const [field, value] of fieldsToUpdate) {
      previousValues[field] = contact ? (contact as unknown as Record<string, unknown>)[field] : null;
      newValues[field] = value;
    }

    // 4. Build update data — only include fields explicitly provided (not undefined)
    const updateData: Partial<{
      tenantName: string;
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

    // 5. Update contact
    await this.appointmentRepo.updateContact(input.appointmentId, updateData);

    // 6. Record CONTACT_UPDATED activity
    const activity = new TenantPortalActivityEntity({
      id: crypto.randomUUID(),
      appointmentId: input.appointmentId,
      tenantPortalTokenId: input.tokenId,
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
      action: 'tenant_portal.contact_updated',
      actorType: 'ANONYMOUS',
      entityType: 'appointment_contact',
      entityId: input.appointmentId,
      tenantId: appointment.tenantId,
      before: previousValues,
      after: newValues,
      ipAddress: input.ipAddress ?? undefined,
    });

    // 8. Return the updated contact fields merged with existing
    return {
      tenantName: contact?.tenantName ?? null,
      primaryEmail:
        input.contact.primaryEmail !== undefined
          ? input.contact.primaryEmail
          : (contact?.primaryEmail ?? null),
      secondaryEmail:
        input.contact.secondaryEmail !== undefined
          ? input.contact.secondaryEmail
          : (contact?.secondaryEmail ?? null),
      primaryPhone:
        input.contact.primaryPhone !== undefined
          ? input.contact.primaryPhone
          : (contact?.primaryPhone ?? null),
      secondaryPhone:
        input.contact.secondaryPhone !== undefined
          ? input.contact.secondaryPhone
          : (contact?.secondaryPhone ?? null),
    };
  }
}
