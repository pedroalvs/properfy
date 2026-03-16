import type { AppointmentEntity } from './appointment.entity';
import type { AppointmentContactEntity } from './appointment-contact.entity';
import type { AppointmentRestrictionEntity } from './appointment-restriction.entity';

export interface AppointmentFilters {
  tenantId: string;
  status?: string;
  serviceTypeId?: string;
  branchId?: string;
  inspectorId?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  tenantConfirmationStatus?: string;
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
}

export interface IAppointmentRepository {
  findById(id: string, tenantId: string): Promise<AppointmentWithRelations | null>;
  findAll(filters: AppointmentFilters, pagination: PaginationParams): Promise<AppointmentEntity[]>;
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
      doneCheckedByUserId: string | null;
      doneCheckedAt: Date | null;
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
}
