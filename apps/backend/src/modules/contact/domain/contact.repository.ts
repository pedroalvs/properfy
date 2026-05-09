import type { ContactEntity } from './contact.entity';
import type { ContactType } from '@properfy/shared';

export interface ContactFilters {
  tenantId: string;
  /**
   * Multi-select filter (023 §FR-204). Backwards-compatible: a single value is
   * still accepted (the use case wraps it into an array) but the repository
   * now matches against `IN`.
   */
  type?: ContactType[];
  isActive?: boolean;
  search?: string;
  /**
   * Branch filter (023 §FR-204). Returns only contacts that have at least one
   * appointment_contact whose `appointment.property.branch_id` is in the set.
   */
  branchIds?: string[];
  /**
   * "Primary" filter (023 §FR-205). When true, returns only contacts with
   * `primaryInPropertyCount > 0` (i.e. primary on at least one non-CANCELLED
   * / non-REJECTED appointment).
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
  findAll(filters: ContactFilters, pagination: ContactPagination): Promise<ContactEntity[]>;
  count(filters: ContactFilters): Promise<number>;
  search(tenantId: string, query: string, type?: ContactType, isActive?: boolean): Promise<ContactEntity[]>;
  save(contact: ContactEntity): Promise<void>;
  update(contactId: string, tenantId: string, data: Partial<{
    type: ContactType;
    displayName: string;
    company: string | null;
    primaryEmail: string | null;
    primaryPhone: string | null;
    additionalChannels: unknown;
    notes: string | null;
    isActive: boolean;
  }>): Promise<void>;
  existsByEmail(tenantId: string, email: string, excludeContactId?: string): Promise<boolean>;
  existsByPhone(tenantId: string, phone: string, excludeContactId?: string): Promise<boolean>;
  /**
   * Find the first active contact in the tenant that matches the given email
   * or phone. Used by the appointment inline-contact path to reuse an
   * existing registry row instead of hitting the partial unique index
   * (contacts_tenant_email_active_unique / ..._phone_active_unique).
   */
  findActiveByEmailOrPhone(
    tenantId: string,
    email: string | null,
    phone: string | null,
  ): Promise<ContactEntity | null>;
  findAppointmentsByContactId(contactId: string, pagination: ContactPagination): Promise<ContactAppointmentSummary[]>;
  countAppointmentsByContactId(contactId: string): Promise<number>;
  /**
   * Returns a Map<contactId, propertyCount> for the given contact ids — counts
   * distinct property_ids across appointment_contacts → appointments. Used by
   * the list endpoint to avoid an N+1.
   */
  countDistinctPropertiesByContactIds(contactIds: string[]): Promise<Map<string, number>>;
  /**
   * Returns a Map<contactId, primaryInPropertyCount> — distinct property_ids
   * where `is_primary = true` AND the appointment is not CANCELLED/REJECTED
   * (023 §FR-202 / NFR-201). Mirrors the batched pattern of
   * `countDistinctPropertiesByContactIds`.
   */
  countPrimaryDistinctPropertiesByContactIds(contactIds: string[]): Promise<Map<string, number>>;
  /**
   * Returns the distinct properties this contact has appeared in, with
   * appointment counts and the "is primary in any active appointment" flag.
   */
  findPropertiesByContactId(contactId: string, pagination: ContactPagination): Promise<ContactPropertyAggregate[]>;
  countPropertiesByContactId(contactId: string): Promise<number>;
}
