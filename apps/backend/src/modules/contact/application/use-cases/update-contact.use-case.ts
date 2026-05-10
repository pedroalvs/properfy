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
  /**
   * 024 §FR-303 — for AM/OP this stays nullable (cross-tenant). For CL
   * roles the route handler resolves their JWT tenant before calling and
   * passes it both as the row filter and as the visibility tenant.
   */
  tenantId: string | null;
  actorId: string;
  /**
   * 024 — actor's own JWT tenant, recorded as `metadata.actor_tenant_id`
   * on the audit row.
   */
  actorTenantId?: string | null;
  /**
   * 024 §FR-303 — when present and the actor is a CL role, the use case
   * runs an `existsLinkedToTenant` check before applying the patch (CL
   * roles can only update contacts they can see). Optional for backwards
   * compatibility with AM/OP callers.
   */
  visibilityTenantId?: string | null;
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

    // 024 §FR-303 — CL roles only update contacts they can see (operational
    // junction in their tenant). The route handler passes
    // `visibilityTenantId` for CL_ADMIN/CL_USER; AM/OP omit it.
    if (input.visibilityTenantId) {
      const visible = await this.contactRepo.existsLinkedToTenant(input.contactId, input.visibilityTenantId);
      if (!visible) throw new ContactNotFoundError();
    }

    // 024 §FR-301 — `tenantId` may be null on the existing row (standalone
    // contact). Audit row records the contact's current tenant — `null` if
    // standalone. Actor's home tenant is preserved in metadata.
    const auditTenantId = existing.tenantId ?? input.tenantId ?? null;

    // Merge for validation: apply patch on top of existing
    const mergedEmail = input.data.primaryEmail !== undefined ? input.data.primaryEmail : existing.primaryEmail;
    const mergedPhone = input.data.primaryPhone !== undefined ? input.data.primaryPhone : existing.primaryPhone;
    const mergedChannels = input.data.additionalChannels !== undefined
      ? input.data.additionalChannels
      : existing.additionalChannels;

    validateAtLeastOneChannel(mergedEmail, mergedPhone);
    validateNoDuplicateChannels(mergedEmail, mergedPhone, mergedChannels);
    validateNoIntraArrayDuplicates(mergedChannels);

    // 024 §FR-310 — uniqueness is global; the repo ignores the tenant
    // argument. Kept at the call site for compatibility.
    if (mergedEmail && mergedEmail !== existing.primaryEmail) {
      const exists = await this.contactRepo.existsByEmail(auditTenantId, mergedEmail, input.contactId);
      if (exists) throw new ContactEmailAlreadyExistsError();
    }
    if (mergedPhone && mergedPhone !== existing.primaryPhone) {
      const exists = await this.contactRepo.existsByPhone(auditTenantId, mergedPhone, input.contactId);
      if (exists) throw new ContactPhoneAlreadyExistsError();
    }

    const before = {
      type: existing.type,
      displayName: existing.displayName,
      primaryEmail: existing.primaryEmail,
      primaryPhone: existing.primaryPhone,
      isActive: existing.isActive,
    };

    await this.contactRepo.update(input.contactId, input.tenantId, input.data);

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
      tenantId: auditTenantId,
      metadata: { actor_tenant_id: input.actorTenantId ?? null },
      before,
      after: {
        type: input.data.type ?? existing.type,
        displayName: input.data.displayName ?? existing.displayName,
        primaryEmail: mergedEmail,
        primaryPhone: mergedPhone,
        isActive: nowActive,
      },
    });

    return this.contactRepo.findById(input.contactId, input.tenantId);
  }
}
