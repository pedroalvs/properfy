import type { BillingPeriodType, FinancialEntryType, FinancialEntryStatus, InspectorInvoiceStatus } from '@properfy/shared';

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
  entryType: string;
  status: string;
}

export const DEFAULT_FILTERS: FinancialFiltersState = {
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
  currency: string | null;
}

export interface InvoiceSnapshotLine {
  serviceDate: string;
  appointmentId: string;
  appointmentCode: string;
  propertyAddress: string | null;
  serviceType: string | null;
  amount: number;
  agencyId: string | null;
  agencyName: string | null;
  branchId: string | null;
  branchName: string | null;
}

export interface Invoice {
  id: string;
  invoiceNumber: number | null;
  invoiceNumberDisplay: string | null;
  inspectorId: string;
  periodStart: string;
  periodEnd: string;
  periodType: BillingPeriodType;
  totalAmount: number;
  currency: string;
  status: InspectorInvoiceStatus;
  fileKey: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  // Payment reconciliation fields (feature 017)
  paidByUserId: string | null;
  paymentReference: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface InvoiceDetail extends Invoice {
  generatedByUserId?: string | null;
  lineItemsSnapshot: InvoiceSnapshotLine[] | null;
  notes: string | null;
}

export interface InvoiceFiltersState {
  inspectorId: string;
  agencyId: string;
  branchId: string;
  status: string; // 3-bucket: '' | 'pending' | 'approved' | 'rejected'
  periodStart: string;
  periodEnd: string;
}

export const DEFAULT_INVOICE_FILTERS: InvoiceFiltersState = {
  inspectorId: '',
  agencyId: '',
  branchId: '',
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
