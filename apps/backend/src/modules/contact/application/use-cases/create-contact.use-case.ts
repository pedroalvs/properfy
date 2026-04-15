import type { ContactType } from '@properfy/shared';
import type { IContactRepository } from '../../domain/contact.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AdditionalChannel } from '../../domain/contact.entity';
import { ContactEntity } from '../../domain/contact.entity';
import {
  ContactEmailAlreadyExistsError,
  ContactPhoneAlreadyExistsError,
} from '../../domain/contact.errors';
import {
  validateAtLeastOneChannel,
  validateNoDuplicateChannels,
  validateNoIntraArrayDuplicates,
} from '../../domain/contact-validation.service';

export interface CreateContactInput {
  tenantId: string;
  type: ContactType;
  displayName: string;
  company?: string | null;
  primaryEmail?: string | null;
  primaryPhone?: string | null;
  additionalChannels?: AdditionalChannel[];
  notes?: string | null;
  actorId: string;
}

export class CreateContactUseCase {
  constructor(
    private readonly contactRepo: IContactRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: CreateContactInput): Promise<ContactEntity> {
    const email = input.primaryEmail ?? null;
    const phone = input.primaryPhone ?? null;
    const channels = input.additionalChannels ?? [];

    validateAtLeastOneChannel(email, phone);
    validateNoDuplicateChannels(email, phone, channels);
    validateNoIntraArrayDuplicates(channels);

    if (email) {
      const exists = await this.contactRepo.existsByEmail(input.tenantId, email);
      if (exists) throw new ContactEmailAlreadyExistsError();
    }

    if (phone) {
      const exists = await this.contactRepo.existsByPhone(input.tenantId, phone);
      if (exists) throw new ContactPhoneAlreadyExistsError();
    }

    const contact = new ContactEntity({
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      type: input.type,
      displayName: input.displayName,
      company: input.company ?? null,
      primaryEmail: email,
      primaryPhone: phone,
      additionalChannels: channels,
      notes: input.notes ?? null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await this.contactRepo.save(contact);

    this.auditService.log({
      action: 'contact.created',
      actorType: 'USER',
      actorId: input.actorId,
      entityType: 'contact',
      entityId: contact.id,
      tenantId: input.tenantId,
      after: {
        type: contact.type,
        displayName: contact.displayName,
        primaryEmail: contact.primaryEmail,
        primaryPhone: contact.primaryPhone,
      },
    });

    return contact;
  }
}
