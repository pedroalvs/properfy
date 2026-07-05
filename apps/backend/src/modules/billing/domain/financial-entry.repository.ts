import type { FinancialEntryEntity } from './financial-entry.entity';
import type { FinancialEntryType, FinancialEntryStatus, InvoiceSnapshotLine } from '@properfy/shared';

export interface FinancialEntryFilters {
  tenantId?: string;
  appointmentId?: string;
  inspectorId?: string;
  entryType?: FinancialEntryType;
  /**
   * Restrict to a set of entry types (WHERE entry_type IN (...)). Used to scope
   * Agency (CL) reads to their visible types, excluding INSPECTOR_PAYOUT. A
   * specific `entryType` takes precedence over `entryTypeIn`.
   */
  entryTypeIn?: FinancialEntryType[];
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

export interface FinancialEntrySummary {
  totalDebits: number;
  totalPayouts: number;
  totalAdjustments: number;
  totalRefunds: number;
  pendingCount: number;
  currency: string | null;
}

/**
 * Aggregates for the inspector's own earnings view (PWA): all-time approved
 * total, pending ("next payment") total, and per-month approved totals from
 * `monthlyFrom` onwards. `monthly` contains only months with data — the use
 * case zero-fills the window.
 */
export interface InspectorEarningsSummary {
  totalApproved: number;
  nextPayment: number;
  currency: string | null;
  monthly: { month: string; total: number }[];
}

export interface FinancialEntryEnriched {
  entity: FinancialEntryEntity;
  appointmentCode: string | null;
  relatedEntityName: string | null;
  approvedByName: string | null;
}

export interface IFinancialEntryRepository {
  findById(id: string, tenantId?: string): Promise<FinancialEntryEntity | null>;
  findByIdEnriched(id: string, tenantId?: string): Promise<FinancialEntryEnriched | null>;
  findAllEnriched(filters: FinancialEntryFilters, pagination: FinancialEntryPagination): Promise<FinancialEntryEnriched[]>;
  getSummary(tenantId?: string, dateRange?: { effectiveFrom?: string; effectiveTo?: string }): Promise<FinancialEntrySummary>;
  /** Own-payout aggregates for the inspector earnings screen (see InspectorEarningsSummary). */
  getInspectorEarningsSummary(inspectorId: string, monthlyFrom: Date): Promise<InspectorEarningsSummary>;
  findByAppointmentAndType(appointmentId: string, entryType: FinancialEntryType): Promise<FinancialEntryEntity | null>;
  findByReferenceEntryIdAndType(referenceEntryId: string, entryType: FinancialEntryType): Promise<FinancialEntryEntity | null>;
  findAll(filters: FinancialEntryFilters, pagination: FinancialEntryPagination): Promise<FinancialEntryEntity[]>;
  count(filters: FinancialEntryFilters): Promise<number>;
  save(entry: FinancialEntryEntity): Promise<void>;
  updateStatus(id: string, tenantId: string, status: FinancialEntryStatus, approvedByUserId?: string, approvedAt?: Date): Promise<void>;
  transitionStatus(id: string, tenantId: string, fromStatus: FinancialEntryStatus, toStatus: FinancialEntryStatus, approvedByUserId?: string, approvedAt?: Date): Promise<void>;
  sumApprovedPayoutsForInspectorInPeriod(inspectorId: string, periodStart: Date, periodEnd: Date): Promise<number>;
  /**
   * Aggregate of approved INSPECTOR_PAYOUT entries in a period: total, count and distinct
   * currencies. Used by the invoice request/preview flow (spec 032) to build previews and to
   * detect empty periods / mixed currencies without a live re-query per line.
   */
  aggregateApprovedPayoutsForInspectorInPeriod(
    inspectorId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{ totalAmount: number; count: number; currencies: string[] }>;
  /**
   * Builds the frozen snapshot lines for an invoice from a SINGLE read: one line per approved
   * INSPECTOR_PAYOUT entry in the period, joined to appointment → property / branch / service type
   * / tenant (agency), plus the distinct currencies across those entries. Returning currencies here
   * lets the approval validate emptiness/currency against the exact rows being frozen (no TOCTOU
   * window between a separate aggregate check and the snapshot). Agency/branch are line-level only.
   * (spec 032)
   */
  findApprovedPayoutLinesForSnapshot(
    inspectorId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{ lines: InvoiceSnapshotLine[]; currencies: string[] }>;
  sumRefundsByReferenceEntryId(referenceEntryId: string): Promise<number>;
  sumApprovedEntriesForTenantInPeriod(tenantId: string, periodStart: Date, periodEnd: Date): Promise<{
    totalDebit: number;
    totalRefund: number;
    totalAdjustment: number;
  }>;
  voidEntry(id: string, tenantId: string, voidedByUserId: string, voidedAt: Date, voidReason: string): Promise<void>;
}
