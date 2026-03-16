import type { FinancialEntryType, FinancialEntryStatus } from '@properfy/shared';

export interface FinancialEntry {
  id: string;
  tenantId: string;
  appointmentCode: string;
  entryType: FinancialEntryType;
  amount: number;
  currency: string;
  status: FinancialEntryStatus;
  description: string;
  relatedEntityName: string;
  effectiveAt: string;
  approvedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialFiltersState {
  search: string;
  entryType: string;
  status: string;
}

export const DEFAULT_FILTERS: FinancialFiltersState = {
  search: '',
  entryType: '',
  status: '',
};
