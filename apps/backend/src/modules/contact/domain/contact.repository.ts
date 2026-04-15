import type { ContactEntity } from './contact.entity';
import type { ContactType } from '@properfy/shared';

export interface ContactFilters {
  tenantId?: string;
  type?: ContactType;
  isActive?: boolean;
  search?: string;
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
  findAppointmentsByContactId(contactId: string, pagination: ContactPagination): Promise<ContactAppointmentSummary[]>;
  countAppointmentsByContactId(contactId: string): Promise<number>;
}
