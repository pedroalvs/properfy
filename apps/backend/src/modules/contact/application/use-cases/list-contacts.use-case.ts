import type { ContactType } from '@properfy/shared';
import type { IContactRepository } from '../../domain/contact.repository';
import type { ContactEntity } from '../../domain/contact.entity';
import type { ContactScope } from '../../domain/contact.scope';

/**
 * 024 §FR-303 — actor context the route layer passes to the use case so
 * scope resolution lives in one place.
 */
export interface ListContactsActor {
  role: 'AM' | 'OP' | 'CL_ADMIN' | 'CL_USER' | string;
  tenantId: string | null;
}

export interface ListContactsInput {
  /**
   * 024 — for AM/OP this is the explicit Agency-selector tenant filter (may
   * be null/undefined for the cross-tenant view). For CL_ADMIN/CL_USER it
   * is ignored — scope is resolved from `actor.tenantId`.
   */
  tenantId?: string | null;
  actor: ListContactsActor;
  /** 023 §FR-204: multiselect; single value still accepted (wrapped). */
  type?: ContactType | ContactType[];
  isActive?: boolean;
  search?: string;
  /** 023 §FR-204: branch multiselect. */
  branchIds?: string[];
  /** 023 §FR-205: only contacts with `primaryInPropertyCount > 0`. */
  primary?: boolean;
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export interface ListContactsItem {
  contact: ContactEntity;
  propertyCount: number;
  /** 023 §FR-202 — distinct properties on which this contact is primary. */
  primaryInPropertyCount: number;
}

export interface ListContactsResult {
  data: ListContactsItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 024 §FR-303 — resolve the visibility scope from the actor + optional
 * explicit tenant filter. AM/OP get a global scope (with optional
 * Agency-selector pin); CL_ADMIN/CL_USER are tenant-pinned to their JWT
 * tenant. Callers may share this helper across get/list use cases.
 */
export function resolveScope(actor: ListContactsActor, queryTenantId?: string | null): ContactScope {
  if (actor.role === 'AM' || actor.role === 'OP') {
    return { kind: 'global', explicitTenantId: queryTenantId ?? null };
  }
  if (!actor.tenantId) {
    // Defence in depth: a CL_* token without a tenant_id should never
    // reach a contact query (auth middleware enforces). Throwing here
    // surfaces the misconfiguration loudly rather than silently leaking.
    throw new Error('CL_ADMIN/CL_USER actor missing tenantId — refusing to resolve a contact scope');
  }
  return { kind: 'tenant_pinned', tenantId: actor.tenantId };
}

/**
 * Lists contacts and hydrates the `propertyCount` and
 * `primaryInPropertyCount` aggregates per row in two batched queries
 * (avoids N+1; one row scan + one aggregation per metric).
 *
 * 024 §FR-303 — visibility for CL roles is enforced at the repository via
 * the scope predicate; aggregations carry `scopeTenantId` so the per-row
 * counts only reflect properties visible to the actor tenant.
 */
export class ListContactsUseCase {
  constructor(private readonly contactRepo: IContactRepository) {}

  async execute(input: ListContactsInput): Promise<ListContactsResult> {
    const scope = resolveScope(input.actor, input.tenantId);
    const scopeTenantId = scope.kind === 'tenant_pinned'
      ? scope.tenantId
      : (scope.explicitTenantId ?? undefined);

    const types = input.type === undefined
      ? undefined
      : Array.isArray(input.type)
        ? input.type
        : [input.type];

    const filters = {
      type: types,
      isActive: input.isActive ?? true,
      search: input.search,
      branchIds: input.branchIds,
      primary: input.primary,
    };
    const pagination = {
      page: input.page,
      pageSize: input.pageSize,
      sortBy: input.sortBy,
      sortOrder: input.sortOrder,
    };

    const [contacts, total] = await Promise.all([
      this.contactRepo.findAll(filters, pagination, scope),
      this.contactRepo.count(filters, scope),
    ]);

    const ids = contacts.map((c) => c.id);
    const [propertyCounts, primaryCounts] = ids.length > 0
      ? await Promise.all([
          this.contactRepo.countDistinctPropertiesByContactIds(ids, scopeTenantId),
          this.contactRepo.countPrimaryDistinctPropertiesByContactIds(ids, scopeTenantId),
        ])
      : [new Map<string, number>(), new Map<string, number>()];

    const data: ListContactsItem[] = contacts.map((contact) => ({
      contact,
      propertyCount: propertyCounts.get(contact.id) ?? 0,
      primaryInPropertyCount: primaryCounts.get(contact.id) ?? 0,
    }));

    return { data, total, page: input.page, pageSize: input.pageSize };
  }
}
