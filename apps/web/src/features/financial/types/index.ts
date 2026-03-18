import type { FinancialEntryType, FinancialEntryStatus } from '@properfy/shared';
import type { InvoiceStatus } from '@/lib/status-colors';

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

export interface FinancialEntryDetail extends FinancialEntry {
  notes: string | null;
  approvedAt: string | null;
  referenceNumber: string | null;
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

export interface FinancialEntryFormData {
  entryType: string;
  amount: string;
  description: string;
  relatedEntityName: string;
  effectiveAt: string;
  referenceNumber: string;
  notes: string;
}

export type FinancialEntryFormErrors = Partial<Record<keyof FinancialEntryFormData, string>>;

export interface FinancialSummary {
  totalDebits: number;
  totalPayouts: number;
  totalAdjustments: number;
  totalRefunds: number;
  pendingCount: number;
}

export interface Invoice {
  id: string;
  tenantId: string;
  inspectorId: string;
  inspectorName: string;
  periodStart: string;
  periodEnd: string;
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  totalAmount: number;
  currency: string;
  status: InvoiceStatus;
  entryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceDetail extends Invoice {
  entries: FinancialEntry[];
  downloadUrl: string | null;
  notes: string | null;
}

export interface InvoiceFiltersState {
  search: string;
  status: string;
  periodStart: string;
  periodEnd: string;
}

export const DEFAULT_INVOICE_FILTERS: InvoiceFiltersState = {
  search: '',
  status: '',
  periodStart: '',
  periodEnd: '',
};

export const EMPTY_FINANCIAL_ENTRY_FORM: FinancialEntryFormData = {
  entryType: '',
  amount: '',
  description: '',
  relatedEntityName: '',
  effectiveAt: '',
  referenceNumber: '',
  notes: '',
};
