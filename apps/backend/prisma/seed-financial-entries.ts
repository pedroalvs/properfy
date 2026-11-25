/**
 * Seed financial entries, extracted as a pure builder so the seed's shape can be
 * unit-tested without running `main()` (which connects to the database).
 *
 * Product rule mirrored here (O-22): a `TENANT_DEBIT` (and a `REFUND`) is the
 * agency leg and is written with `inspector_id: null` — only the inspector leg
 * (`INSPECTOR_PAYOUT`) carries an inspector. The agency statement lists an entry
 * only when `inspector_id IS NULL`, so a debit with an inspector would be hidden
 * from the agency. See `seedDebitsNeedingInspectorReset` for the re-seed fix.
 */

export type SeedFinancialEntryType =
  | 'TENANT_DEBIT'
  | 'INSPECTOR_PAYOUT'
  | 'MANUAL_ADJUSTMENT'
  | 'REFUND';

export type SeedFinancialEntryStatus = 'APPROVED' | 'PENDING' | 'CANCELLED';

export interface SeedFinancialEntry {
  id: string;
  tenant_id: string;
  appointment_id: string | null;
  inspector_id: string | null;
  entry_type: SeedFinancialEntryType;
  amount: number;
  currency: string;
  status: SeedFinancialEntryStatus;
  description: string;
  effective_at: Date;
  initiated_by_user_id: string;
  approved_by_user_id?: string;
  approved_at?: Date;
  reference_entry_id?: string | null;
  reason?: string;
}

/** The id keys the financial-entry seed needs (a structural subset of the seed's `IDS`). */
export interface SeedFinancialEntryIds {
  tenant: string;
  tenant2: string;
  apptDone: string;
  apptDone2: string;
  apptCancelled: string;
  apptDoneT2: string;
  inspectorLinked: string;
  inspectorIndep: string;
  inspectorLinked2: string;
  userOP: string;
  userAM: string;
  fe1: string;
  fe2: string;
  fe3: string;
  fe4: string;
  fe5: string;
  fe6: string;
  fe7: string;
  fe8: string;
  fe9: string;
}

export function buildSeedFinancialEntries(
  ids: SeedFinancialEntryIds,
  pastDate: (days: number) => Date,
): SeedFinancialEntry[] {
  return [
    // apptDone: approved debit + payout
    {
      id: ids.fe1, tenant_id: ids.tenant, appointment_id: ids.apptDone, inspector_id: null,
      entry_type: 'TENANT_DEBIT', amount: 150.0, currency: 'AUD', status: 'APPROVED',
      description: 'Routine inspection at 200 Pacific Hwy, Crows Nest',
      effective_at: pastDate(3), initiated_by_user_id: ids.userOP,
      approved_by_user_id: ids.userAM, approved_at: pastDate(2),
    },
    {
      id: ids.fe2, tenant_id: ids.tenant, appointment_id: ids.apptDone, inspector_id: ids.inspectorLinked,
      entry_type: 'INSPECTOR_PAYOUT', amount: 80.0, currency: 'AUD', status: 'APPROVED',
      description: 'Payout to Mike Inspector — Routine inspection 200 Pacific Hwy',
      effective_at: pastDate(3), initiated_by_user_id: ids.userOP,
      approved_by_user_id: ids.userAM, approved_at: pastDate(2),
    },
    // apptDone2: pending debit + payout
    {
      id: ids.fe3, tenant_id: ids.tenant, appointment_id: ids.apptDone2, inspector_id: null,
      entry_type: 'TENANT_DEBIT', amount: 160.0, currency: 'AUD', status: 'PENDING',
      description: 'Routine inspection at 5 Blue St, North Sydney',
      effective_at: pastDate(7), initiated_by_user_id: ids.userOP,
    },
    {
      id: ids.fe4, tenant_id: ids.tenant, appointment_id: ids.apptDone2, inspector_id: ids.inspectorIndep,
      entry_type: 'INSPECTOR_PAYOUT', amount: 88.0, currency: 'AUD', status: 'PENDING',
      description: 'Payout to Carlos Mendez — Routine inspection 5 Blue St',
      effective_at: pastDate(7), initiated_by_user_id: ids.userOP,
    },
    // Manual adjustments
    {
      id: ids.fe5, tenant_id: ids.tenant, appointment_id: null, inspector_id: null,
      entry_type: 'MANUAL_ADJUSTMENT', amount: 50.0, currency: 'AUD', status: 'APPROVED',
      description: 'Adjustment for double-billing error on March invoices',
      effective_at: pastDate(10), initiated_by_user_id: ids.userAM,
      approved_by_user_id: ids.userAM, approved_at: pastDate(9),
      reason: 'Billing correction — duplicate charge identified',
    },
    {
      id: ids.fe6, tenant_id: ids.tenant, appointment_id: null, inspector_id: null,
      entry_type: 'MANUAL_ADJUSTMENT', amount: 25.0, currency: 'AUD', status: 'CANCELLED',
      description: 'Incorrect adjustment — reversed',
      effective_at: pastDate(15), initiated_by_user_id: ids.userOP,
      reason: 'Entry created in error, voided by AM',
    },
    // Refund
    {
      id: ids.fe7, tenant_id: ids.tenant, appointment_id: ids.apptCancelled, inspector_id: null,
      entry_type: 'REFUND', amount: 180.0, currency: 'AUD', status: 'PENDING',
      description: 'Refund for cancelled outgoing inspection',
      effective_at: pastDate(1), initiated_by_user_id: ids.userOP,
      reference_entry_id: null,
      reason: 'Service not rendered, tenant relocated',
    },
    // Tenant 2 approved entries
    {
      id: ids.fe8, tenant_id: ids.tenant2, appointment_id: ids.apptDoneT2, inspector_id: null,
      entry_type: 'TENANT_DEBIT', amount: 140.0, currency: 'AUD', status: 'APPROVED',
      description: 'Routine inspection at 100 St Kilda Rd, Southbank',
      effective_at: pastDate(4), initiated_by_user_id: ids.userOP,
      approved_by_user_id: ids.userAM, approved_at: pastDate(3),
    },
    {
      id: ids.fe9, tenant_id: ids.tenant2, appointment_id: ids.apptDoneT2, inspector_id: ids.inspectorLinked2,
      entry_type: 'INSPECTOR_PAYOUT', amount: 75.0, currency: 'AUD', status: 'APPROVED',
      description: 'Payout to Lisa Wong — Routine inspection 100 St Kilda Rd',
      effective_at: pastDate(4), initiated_by_user_id: ids.userOP,
      approved_by_user_id: ids.userAM, approved_at: pastDate(3),
    },
  ];
}

/**
 * The seed debits whose `inspector_id` must be reset to null on re-seed (O-22).
 * The original seed created fe1/fe3/fe8 with an inspector; the `upsert` update
 * clears it so re-running the seed fixes rows already present in an environment.
 */
export function seedDebitsNeedingInspectorReset(ids: SeedFinancialEntryIds): Set<string> {
  return new Set([ids.fe1, ids.fe3, ids.fe8]);
}
