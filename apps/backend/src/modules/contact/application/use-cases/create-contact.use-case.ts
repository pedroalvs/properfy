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
  /**
   * 024 §FR-301 — nullable. AM/OP may pass `null` (or omit) to create a
   * standalone contact (no tenant linkage until an appointment is created).
   * For CL_ADMIN/CL_USER the route handler resolves this from the JWT
   * before calling the use case (preserves 021 behaviour).
   */
  tenantId: string | null;
  type: ContactType;
  displayName: string;
  company?: string | null;
  primaryEmail?: string | null;
  primaryPhone?: string | null;
  additionalChannels?: AdditionalChannel[];
  notes?: string | null;
  actorId: string;
  /**
   * 024 — actor's own JWT tenant, recorded as `metadata.actor_tenant_id`
   * on the audit row so cross-tenant AM/OP creates are still traceable
   * back to the operator's home tenant context (AM may have null).
   */
  actorTenantId?: string | null;
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

    // 024 §FR-310 — uniqueness is now global. The repo ignores the
    // tenantId argument; we keep the parameter at this call site for
    // compatibility but the check spans every active contact.
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
      // 024 — `tenantId` on the audit row is the contact's own (may be null
      // for standalone). The actor's home tenant is preserved separately in
      // `metadata.actor_tenant_id` for traceability.
      tenantId: input.tenantId,
      metadata: { actor_tenant_id: input.actorTenantId ?? null },
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
