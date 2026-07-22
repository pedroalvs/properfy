import type { ContactEntity } from './contact.entity';
import type { ContactScope } from './contact.scope';
import type { ContactType } from '@properfy/shared';

export interface ContactFilters {
  /**
   * 023 §FR-204 — multi-select; backwards-compatible (single value wrapped
   * by the use case before reaching the repository).
   */
  type?: ContactType[];
  isActive?: boolean;
  search?: string;
  /**
   * 023 §FR-204 — branch filter. Returns only contacts that have at least
   * one appointment_contact whose `appointment.property.branch_id` is in
   * the set.
   */
  branchIds?: string[];
  /**
   * 023 §FR-205 — "primary" filter. When `true`, returns only contacts with
   * `primaryInPropertyCount > 0` (i.e. primary on at least one
   * non-CANCELLED/non-REJECTED appointment).
   */
  primary?: boolean;
}

export interface ContactPagination {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export interface ContactAppointmentSummary {
  appointmentId: string;
  appointmentNumber: number;
  status: string;
  scheduledDate: Date;
  role: string;
  isPrimary: boolean;
  propertyId: string;
  propertyCode: string;
}

export interface ContactPropertyAggregate {
  propertyId: string;
  propertyCode: string;
  street: string;
  suburb: string;
  postcode: string;
  state: string;
  appointmentCount: number;
  isPrimaryInActiveAppointment: boolean;
}

export interface IContactRepository {
  findById(contactId: string, tenantId: string | null): Promise<ContactEntity | null>;
  /**
   * 024 §FR-303 — `findAll`/`count` accept a `scope` to apply the visibility
   * predicate (CL roles + AM/OP-with-explicit-tenant: OR of EXISTS-via-junction
   * and legacy `tenant_id` match; AM/OP global: no scope predicate).
   */
  findAll(filters: ContactFilters, pagination: ContactPagination, scope: ContactScope): Promise<ContactEntity[]>;
  count(filters: ContactFilters, scope: ContactScope): Promise<number>;
  search(tenantId: string, query: string, type?: ContactType, isActive?: boolean): Promise<ContactEntity[]>;
  save(contact: ContactEntity): Promise<void>;
  update(contactId: string, tenantId: string | null, data: Partial<{
    type: ContactType;
    displayName: string;
    company: string | null;
    primaryEmail: string | null;
    primaryPhone: string | null;
    additionalChannels: unknown;
    notes: string | null;
    isActive: boolean;
  }>): Promise<void>;
  /**
   * 024 §FR-310 — global uniqueness. The `tenantId` parameter from the 021
   * signature is ignored (kept only for callers; the partial unique indexes
   * `contacts_email_active_unique` / `contacts_phone_active_unique` enforce
   * the constraint). Reserved for future per-tenant validation if reintroduced.
   */
  existsByEmail(tenantId: string | null, email: string, excludeContactId?: string): Promise<boolean>;
  existsByPhone(tenantId: string | null, phone: string, excludeContactId?: string): Promise<boolean>;
  /**
   * All active contacts (globally) matching any of the given emails/phones in
   * one query. Callers (appointment inline-contact paths, the
   * appointment-import row resolver) decide reuse per candidate via
   * `isIdenticalContact` — a partial channel match must never silently link.
   */
  findManyActiveByEmailsOrPhones(emails: string[], phones: string[]): Promise<ContactEntity[]>;
  /**
   * 024 §FR-303 — visibility check used by the get/update/deactivate use
   * cases for CL roles. Returns true iff the contact has at least one
   * `appointment_contacts` row joined to an appointment in the given tenant.
   */
  existsLinkedToTenant(contactId: string, tenantId: string): Promise<boolean>;
  /**
   * 024 §FR-303 — when present, the result is scoped to the actor tenant so
   * CL roles only see appointments visible to them. AM/OP omit it.
   */
  findAppointmentsByContactId(
    contactId: string,
    pagination: ContactPagination,
    scopeTenantId?: string,
  ): Promise<ContactAppointmentSummary[]>;
  countAppointmentsByContactId(contactId: string, scopeTenantId?: string): Promise<number>;
  /**
   * Returns a Map<contactId, propertyCount> — counts distinct property_ids
   * across appointment_contacts → appointments. When `scopeTenantId` is
   * provided, the join filters by `appointments.tenant_id` (CL visibility).
   */
  countDistinctPropertiesByContactIds(
    contactIds: string[],
    scopeTenantId?: string,
  ): Promise<Map<string, number>>;
  /**
   * Returns a Map<contactId, primaryInPropertyCount> — distinct property_ids
   * where `is_primary = true` AND the appointment is not CANCELLED/REJECTED.
   * `scopeTenantId` filter applies for CL roles (023 §FR-202 + 024 §FR-303).
   */
  countPrimaryDistinctPropertiesByContactIds(
    contactIds: string[],
    scopeTenantId?: string,
  ): Promise<Map<string, number>>;
  /**
   * Returns the distinct properties this contact has appeared in, with
   * appointment counts and the "is primary in any active appointment" flag.
   * `scopeTenantId` scopes to the actor tenant for CL roles.
   */
  findPropertiesByContactId(
    contactId: string,
    pagination: ContactPagination,
    scopeTenantId?: string,
  ): Promise<ContactPropertyAggregate[]>;
  countPropertiesByContactId(contactId: string, scopeTenantId?: string): Promise<number>;
}
