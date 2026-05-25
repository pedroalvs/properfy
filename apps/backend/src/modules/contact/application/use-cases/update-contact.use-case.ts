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
    // 024 §FR-303 (review fix — Issue 1, mirrors BUG-024-002) — registry
    // lookup is always global; per-tenant visibility for CL roles is
    // gated below via `existsLinkedToTenant`. Passing the actor tenant
    // here would mask standalone contacts (`tenant_id = null`) and
    // operationally-visible cross-tenant rows.
    const existing = await this.contactRepo.findById(input.contactId, null);
    if (!existing) throw new ContactNotFoundError();

    // CL roles only update contacts they can see. The route handler
    // passes `visibilityTenantId` for CL_ADMIN/CL_USER; AM/OP omit it.
    // Fast path: registry already pinned to actor's tenant
    // (`existing.tenantId === visibilityTenantId`) skips the junction
    // lookup. Otherwise the operational-junction predicate decides.
    if (input.visibilityTenantId) {
      const ownsContact = existing.tenantId === input.visibilityTenantId;
      const visible = ownsContact
        || await this.contactRepo.existsLinkedToTenant(input.contactId, input.visibilityTenantId);
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

    // 024 §FR-303 (review fix — Issue 1) — visibility was already gated
    // above for CL roles via ownsContact/existsLinkedToTenant. The mutation
    // itself runs unscoped (tenantId=null) so a standalone or cross-tenant
    // contact is actually written; passing the JWT tenant here would let
    // a `WHERE tenant_id = $2` filter clip the row out of the UPDATE.
    await this.contactRepo.update(input.contactId, null, input.data);

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

    // Re-fetch unscoped — same reason as the update call above.
    return this.contactRepo.findById(input.contactId, null);
  }
}
