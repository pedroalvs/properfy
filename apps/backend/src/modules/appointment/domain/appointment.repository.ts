import type { AppointmentEntity } from './appointment.entity';
import type { AppointmentContactEntity } from './appointment-contact.entity';
import type { AppointmentRestrictionEntity } from './appointment-restriction.entity';

export interface AppointmentFilters {
  tenantId?: string;
  status?: string;
  serviceTypeId?: string;
  branchId?: string;
  inspectorId?: string;
  propertyId?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  tenantConfirmationStatus?: string;
  showCancelled?: boolean;
  overdueOnly?: boolean;
  ungroupedOnly?: boolean;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export interface AppointmentWithRelations {
  appointment: AppointmentEntity;
  contact: AppointmentContactEntity | null;
  restrictions: AppointmentRestrictionEntity[];
  // Enriched join fields (populated by findById)
  propertyCode?: string;
  propertyAddress?: string;
  propertySuburb?: string;
  propertyLatitude?: number | null;
  propertyLongitude?: number | null;
  branchName?: string;
  serviceTypeName?: string;
  inspectorName?: string | null;
}

export interface AppointmentListItem {
  appointment: AppointmentEntity;
  contact: AppointmentContactEntity | null;
  propertyCode: string;
  propertyAddress: string;
  tenantName: string;
  branchName: string;
  serviceTypeName: string;
  inspectorName: string | null;
}

export interface ContactFilters {
  tenantId?: string;
  confirmationStatus?: string;
  search?: string;
}

export interface ContactListItem {
  id: string;
  appointmentId: string;
  name: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  confirmationStatus: string;
  propertyAddress: string;
  appointmentDate: Date;
  lastActivityAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactDetail extends ContactListItem {
  alternativePhone: string | null;
  notes: string | null;
}

export interface IAppointmentRepository {
  findById(id: string, tenantId: string | null): Promise<AppointmentWithRelations | null>;
  findAll(filters: AppointmentFilters, pagination: PaginationParams): Promise<AppointmentListItem[]>;
  count(filters: AppointmentFilters): Promise<number>;
  save(appointment: AppointmentEntity): Promise<void>;
  update(
    id: string,
    tenantId: string,
    data: Partial<{
      status: string;
      inspectorId: string | null;
      scheduledDate: Date;
      timeSlot: string;
      keyRequired: boolean;
      meetingLocation: string | null;
      keyLocation: string | null;
      tenantConfirmationStatus: string;
      notes: string | null;
      customFieldsJson: Record<string, unknown> | null;
      reason: string | null;
      cancellationReasonCode: string | null;
      rejectionReasonCode: string | null;
      doneCheckedByUserId: string | null;
      doneCheckedAt: Date | null;
      serviceGroupId: string | null;
      deletedAt: Date | null;
    }>,
  ): Promise<void>;
  saveContact(contact: AppointmentContactEntity): Promise<void>;
  updateContact(
    appointmentId: string,
    data: Partial<{
      tenantName: string;
      primaryEmail: string | null;
      secondaryEmail: string | null;
      primaryPhone: string | null;
      secondaryPhone: string | null;
    }>,
  ): Promise<void>;
  saveRestriction(restriction: AppointmentRestrictionEntity): Promise<void>;
  deleteRestrictionsByAppointmentId(appointmentId: string): Promise<void>;
  findScheduledOnDate(date: Date): Promise<AppointmentWithRelations[]>;
  findAllContacts(filters: ContactFilters, pagination: PaginationParams): Promise<ContactListItem[]>;
  countContacts(filters: ContactFilters): Promise<number>;
  findContactById(id: string): Promise<ContactDetail | null>;
  findDuplicateForImport(
    propertyId: string,
    serviceTypeId: string,
    tenantId: string,
    sinceDate: Date,
  ): Promise<AppointmentEntity | null>;
}
