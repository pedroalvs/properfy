import type {
  IContactRepository,
  ContactPagination,
  ContactAppointmentSummary,
  ContactPropertyAggregate,
} from '../../domain/contact.repository';
import type { ContactEntity } from '../../domain/contact.entity';
import { ContactNotFoundError } from '../../domain/contact.errors';
import { resolveScope, type ListContactsActor } from './list-contacts.use-case';

export interface GetContactSubResourcePagination {
  page: number;
  pageSize: number;
  sortOrder?: 'asc' | 'desc';
}

export interface GetContactOptions {
  includeAppointments?: boolean;
  appointmentsPagination?: GetContactSubResourcePagination;
  includeProperties?: boolean;
  propertiesPagination?: GetContactSubResourcePagination;
  /**
   * 024 §FR-303 — when present, the use case enforces visibility for CL
   * roles via `existsLinkedToTenant` and scopes sub-resources to the
   * actor's tenant. Optional for backwards compatibility with AM/OP
   * callers that already pin via `tenantId`.
   */
  actor?: ListContactsActor;
}

export interface GetContactPaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GetContactResult {
  contact: ContactEntity;
  appointments?: GetContactPaginatedResult<ContactAppointmentSummary>;
  properties?: GetContactPaginatedResult<ContactPropertyAggregate>;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

function resolvePagination(p: GetContactSubResourcePagination | undefined): ContactPagination {
  return {
    page: p?.page ?? DEFAULT_PAGE,
    pageSize: p?.pageSize ?? DEFAULT_PAGE_SIZE,
    sortOrder: p?.sortOrder ?? 'desc',
  };
}

/**
 * Fetches a contact registry row plus optional, separately-paginated
 * sub-resources (appointments + properties). Each sub-resource is gated by
 * an `include*` flag so callers pay only for what they render.
 *
 * 024 §FR-303 — when an `actor` is supplied, CL_ADMIN/CL_USER visibility is
 * enforced post-fetch via `existsLinkedToTenant` (the contact row itself is
 * fetched without filter, but a subsequent junction check decides whether
 * to surface it). Sub-resources (appointments/properties) are scoped to the
 * actor's tenant for CL roles so the counts only reflect what they can see.
 */
export class GetContactUseCase {
  constructor(private readonly contactRepo: IContactRepository) {}

  async execute(
    contactId: string,
    tenantId: string | null,
    options: GetContactOptions = {},
  ): Promise<GetContactResult> {
    // 024 §FR-303 (review fix — Issue 1, mirrors BUG-024-002) — Contact is
    // a cross-tenant entity; the registry lookup MUST always be global
    // (no `tenant_id` WHERE filter). Otherwise a CL_ADMIN(B) requesting a
    // contact whose registry row is standalone (`tenant_id = null`) or
    // lives in another tenant — even when operationally visible to B via
    // `appointment_contacts` — gets a null findById and the visibility
    // gate is unreachable. Same shape as the appointment use cases.
    const contact = await this.contactRepo.findById(contactId, null);
    if (!contact) throw new ContactNotFoundError();

    // CL roles only see contacts reachable through their tenant's
    // operational junction. The check is post-fetch so the same 404
    // error covers both "no row" and "row exists but not visible to
    // you" — preserves 021 FR-022 leakage avoidance.
    if (options.actor) {
      const scope = resolveScope(options.actor, tenantId);
      if (scope.kind === 'tenant_pinned') {
        const ownsContact = contact.tenantId === scope.tenantId;
        const visible = ownsContact
          || await this.contactRepo.existsLinkedToTenant(contactId, scope.tenantId);
        if (!visible) throw new ContactNotFoundError();
      }
    }

    const scopeTenantId = options.actor
      ? (() => {
          const s = resolveScope(options.actor, tenantId);
          return s.kind === 'tenant_pinned' ? s.tenantId : undefined;
        })()
      : undefined;

    const result: GetContactResult = { contact };

    if (options.includeAppointments) {
      const pagination = resolvePagination(options.appointmentsPagination);
      const [data, total] = await Promise.all([
        this.contactRepo.findAppointmentsByContactId(contactId, pagination, scopeTenantId),
        this.contactRepo.countAppointmentsByContactId(contactId, scopeTenantId),
      ]);
      result.appointments = {
        data,
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
      };
    }

    if (options.includeProperties) {
      const pagination = resolvePagination(options.propertiesPagination);
      const [data, total] = await Promise.all([
        this.contactRepo.findPropertiesByContactId(contactId, pagination, scopeTenantId),
        this.contactRepo.countPropertiesByContactId(contactId, scopeTenantId),
      ]);
      result.properties = {
        data,
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
      };
    }

    return result;
  }
}
