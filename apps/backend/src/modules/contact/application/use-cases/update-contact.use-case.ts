import type { ContactType } from '@properfy/shared';
import type { IContactRepository } from '../../domain/contact.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AdditionalChannel } from '../../domain/contact.entity';
import {
  ContactNotFoundError,
  ContactEmailAlreadyExistsError,
  ContactPhoneAlreadyExistsError,
} from '../../domain/contact.errors';
import {
  validateAtLeastOneChannel,
  validateNoDuplicateChannels,
  validateNoIntraArrayDuplicates,
} from '../../domain/contact-validation.service';

export interface UpdateContactInput {
  contactId: string;
  tenantId: string | null;
  actorId: string;
  data: {
    type?: ContactType;
    displayName?: string;
    company?: string | null;
    primaryEmail?: string | null;
    primaryPhone?: string | null;
    additionalChannels?: AdditionalChannel[];
    notes?: string | null;
    isActive?: boolean;
  };
}

export class UpdateContactUseCase {
  constructor(
    private readonly contactRepo: IContactRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: UpdateContactInput) {
    const existing = await this.contactRepo.findById(input.contactId, input.tenantId);
    if (!existing) throw new ContactNotFoundError();

    // AM passes tenantId=null; derive from loaded entity
    const tenantId = input.tenantId ?? existing.tenantId;

    // Merge for validation: apply patch on top of existing
    const mergedEmail = input.data.primaryEmail !== undefined ? input.data.primaryEmail : existing.primaryEmail;
    const mergedPhone = input.data.primaryPhone !== undefined ? input.data.primaryPhone : existing.primaryPhone;
    const mergedChannels = input.data.additionalChannels !== undefined
      ? input.data.additionalChannels
      : existing.additionalChannels;

    validateAtLeastOneChannel(mergedEmail, mergedPhone);
    validateNoDuplicateChannels(mergedEmail, mergedPhone, mergedChannels);
    validateNoIntraArrayDuplicates(mergedChannels);

    // Uniqueness checks only when the value changed
    if (mergedEmail && mergedEmail !== existing.primaryEmail) {
      const exists = await this.contactRepo.existsByEmail(tenantId, mergedEmail, input.contactId);
      if (exists) throw new ContactEmailAlreadyExistsError();
    }
    if (mergedPhone && mergedPhone !== existing.primaryPhone) {
      const exists = await this.contactRepo.existsByPhone(tenantId, mergedPhone, input.contactId);
      if (exists) throw new ContactPhoneAlreadyExistsError();
    }

    const before = {
      type: existing.type,
      displayName: existing.displayName,
      primaryEmail: existing.primaryEmail,
      primaryPhone: existing.primaryPhone,
      isActive: existing.isActive,
    };

    await this.contactRepo.update(input.contactId, tenantId, input.data);

    // Determine audit action
    const wasActive = existing.isActive;
    const nowActive = input.data.isActive !== undefined ? input.data.isActive : wasActive;
    let auditAction = 'contact.updated';
    if (wasActive && !nowActive) auditAction = 'contact.deactivated';
    if (!wasActive && nowActive) auditAction = 'contact.reactivated';

    this.auditService.log({
      action: auditAction,
      actorType: 'USER',
      actorId: input.actorId,
      entityType: 'contact',
      entityId: input.contactId,
      tenantId,
      before,
      after: {
        type: input.data.type ?? existing.type,
        displayName: input.data.displayName ?? existing.displayName,
        primaryEmail: mergedEmail,
        primaryPhone: mergedPhone,
        isActive: nowActive,
      },
    });

    return this.contactRepo.findById(input.contactId, tenantId);
  }
}
