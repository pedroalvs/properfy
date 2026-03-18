import type { FinancialEntryEntity } from './financial-entry.entity';
import type { FinancialEntryType, FinancialEntryStatus } from '@properfy/shared';

export interface FinancialEntryFilters {
  tenantId?: string;
  appointmentId?: string;
  inspectorId?: string;
  entryType?: FinancialEntryType;
  status?: FinancialEntryStatus;
  fromDate?: string;
  toDate?: string;
}

export interface FinancialEntryPagination {
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export interface IFinancialEntryRepository {
  findById(id: string, tenantId?: string): Promise<FinancialEntryEntity | null>;
  findByAppointmentAndType(appointmentId: string, entryType: FinancialEntryType): Promise<FinancialEntryEntity | null>;
  findByReferenceEntryIdAndType(referenceEntryId: string, entryType: FinancialEntryType): Promise<FinancialEntryEntity | null>;
  findAll(filters: FinancialEntryFilters, pagination: FinancialEntryPagination): Promise<FinancialEntryEntity[]>;
  count(filters: FinancialEntryFilters): Promise<number>;
  save(entry: FinancialEntryEntity): Promise<void>;
  updateStatus(id: string, tenantId: string, status: FinancialEntryStatus, approvedByUserId?: string, approvedAt?: Date): Promise<void>;
  transitionStatus(id: string, tenantId: string, fromStatus: FinancialEntryStatus, toStatus: FinancialEntryStatus, approvedByUserId?: string, approvedAt?: Date): Promise<void>;
  sumApprovedPayoutsForInspectorInPeriod(inspectorId: string, periodStart: Date, periodEnd: Date): Promise<number>;
}
