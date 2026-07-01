import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from '../db/harness';
import { PrismaReportDataReader } from '../../../src/modules/report/infrastructure/prisma-report-data-reader';
import type { ReportDataFilters } from '../../../src/modules/report/domain/report-data-reader';

/**
 * Real-Postgres coverage for the report data reader. Verifies the WHERE semantics
 * that mocks cannot: date-axis column selection + boundary, suburb match, status
 * filter, group-by-property ordering, ledger revenue/expense classification, and
 * agency distinct counts.
 */

let harness: DbHarness;
let reader: PrismaReportDataReader;

// Seeded ids
let tenantId: string;
let branchId: string;
let inspectorId: string;
let propBondiId: string;
let propManlyId: string;
let apt1Number: number; // DONE, scheduled Mar 10, created Feb 01, completed Mar 11
let apt2Number: number; // SCHEDULED, scheduled Mar 20, created Mar 05
let apt3Number: number; // CANCELLED, scheduled Mar 15, created Mar 02

const baseFilters = (overrides: Partial<ReportDataFilters> = {}): ReportDataFilters => ({
  fromDate: '2026-03-01',
  toDate: '2026-03-31',
  dateAxis: 'SCHEDULED',
  ...overrides,
});

beforeAll(async () => {
  harness = await setupDbHarness();
  reader = new PrismaReportDataReader(harness.prisma);
  const prisma = harness.prisma;
  const rnd = () => Math.random().toString(36).slice(2, 10);

  const tenant = await prisma.tenant.create({
    data: { name: 'Acme Realty', legal_name: `Acme Realty ${rnd()}`, status: 'ACTIVE', currency: 'AUD' },
  });
  tenantId = tenant.id;
  const branch = await prisma.branch.create({ data: { tenant_id: tenantId, name: 'CBD', status: 'ACTIVE' } });
  branchId = branch.id;
  const user = await prisma.user.create({
    data: { tenant_id: tenantId, branch_id: branchId, role: 'OP', name: 'Op', email: `op-${rnd()}@t.local`, password_hash: 'x'.repeat(20), status: 'ACTIVE' },
  });
  const inspector = await prisma.inspector.create({ data: { name: 'Ivy', email: `ivy-${rnd()}@t.local`, status: 'ACTIVE' } });
  inspectorId = inspector.id;

  const mkProp = async (code: string, suburb: string) =>
    prisma.property.create({
      data: { tenant_id: tenantId, branch_id: branchId, property_code: `${code}-${rnd()}`, type: 'RESIDENTIAL', street: `${code} St`, suburb, postcode: '2000', state: 'NSW', country: 'AU', geocoding_status: 'SUCCESS' },
    });
  const propBondi = await mkProp('P1', 'Bondi');
  const propManly = await mkProp('P2', 'Manly');
  propBondiId = propBondi.id;
  propManlyId = propManly.id;

  const serviceType = await prisma.serviceType.create({
    data: { code: `ST-${rnd()}`, name: 'Routine', flow_type: 'ROUTINE', requires_rental_tenant_confirmation: true, status: 'ACTIVE' },
  });

  const mkApt = async (opts: { propertyId: string; status: 'DONE' | 'SCHEDULED' | 'CANCELLED'; scheduled: string; created: string; completed?: string; inspector?: boolean }) => {
    const a = await prisma.appointment.create({
      data: {
        tenant_id: tenantId,
        branch_id: branchId,
        property_id: opts.propertyId,
        service_type_id: serviceType.id,
        inspector_id: opts.inspector ? inspectorId : null,
        status: opts.status,
        scheduled_date: new Date(`${opts.scheduled}T00:00:00.000Z`),
        time_slot: 'MORNING',
        price_amount: '100.00',
        payout_amount: '80.00',
        pricing_rule_snapshot_json: {},
        rental_tenant_confirmation_status: 'CONFIRMED',
        created_by_user_id: user.id,
        created_at: new Date(`${opts.created}T00:00:00.000Z`),
        done_checked_at: opts.completed ? new Date(`${opts.completed}T00:00:00.000Z`) : null,
      },
    });
    return a.appointment_number;
  };

  apt1Number = await mkApt({ propertyId: propBondiId, status: 'DONE', scheduled: '2026-03-10', created: '2026-02-01', completed: '2026-03-11', inspector: true });
  apt2Number = await mkApt({ propertyId: propBondiId, status: 'SCHEDULED', scheduled: '2026-03-20', created: '2026-03-05', inspector: true });
  apt3Number = await mkApt({ propertyId: propManlyId, status: 'CANCELLED', scheduled: '2026-03-15', created: '2026-03-02' });

  // Financial ledger — all in March; one PENDING to prove APPROVED-only filtering.
  const fe = (data: Record<string, unknown>) =>
    prisma.financialEntry.create({
      data: { tenant_id: tenantId, currency: 'AUD', status: 'APPROVED', description: 'x', initiated_by_user_id: user.id, effective_at: new Date('2026-03-11T00:00:00.000Z'), ...data } as any,
    });
  await fe({ entry_type: 'TENANT_DEBIT', amount: '100.00' });
  await fe({ entry_type: 'INSPECTOR_PAYOUT', amount: '80.00', inspector_id: inspectorId });
  await fe({ entry_type: 'REFUND', amount: '20.00' });
  await fe({ entry_type: 'MANUAL_ADJUSTMENT', amount: '15.00', inspector_id: inspectorId }); // inspector-scoped → expense
  await fe({ entry_type: 'MANUAL_ADJUSTMENT', amount: '10.00' }); // tenant-scoped → revenue
  await fe({ entry_type: 'TENANT_DEBIT', amount: '999.00', status: 'PENDING' }); // excluded
}, 180_000);

afterAll(async () => { await teardownDbHarness(harness); });

describe('getAppointmentRows', () => {
  it('SCHEDULED axis returns all three March appointments', async () => {
    const rows = await reader.getAppointmentRows(baseFilters());
    expect(rows).toHaveLength(3);
  });

  it('applies the status filter', async () => {
    const rows = await reader.getAppointmentRows(baseFilters({ status: 'DONE' }));
    expect(rows).toHaveLength(1);
    expect(rows[0].appointmentNumber).toBe(apt1Number);
    expect(rows[0].suburb).toBe('Bondi');
    expect(rows[0].agency).toBe('Acme Realty');
  });

  it('filters by suburb case-insensitively', async () => {
    const rows = await reader.getAppointmentRows(baseFilters({ suburb: 'bondi' }));
    expect(rows.map((r) => r.appointmentNumber).sort()).toEqual([apt1Number, apt2Number].sort());
  });

  it('filters by branch', async () => {
    const rows = await reader.getAppointmentRows(baseFilters({ branchId }));
    expect(rows).toHaveLength(3);
    const none = await reader.getAppointmentRows(baseFilters({ branchId: '00000000-0000-0000-0000-000000000000' }));
    expect(none).toHaveLength(0);
  });

  it('CREATED axis ranges on created_at (Feb window returns only apt1)', async () => {
    const rows = await reader.getAppointmentRows(baseFilters({ fromDate: '2026-02-01', toDate: '2026-02-28', dateAxis: 'CREATED' }));
    expect(rows).toHaveLength(1);
    expect(rows[0].appointmentNumber).toBe(apt1Number);
  });

  it('COMPLETED axis excludes rows with null done_checked_at', async () => {
    const rows = await reader.getAppointmentRows(baseFilters({ dateAxis: 'COMPLETED' }));
    expect(rows).toHaveLength(1);
    expect(rows[0].appointmentNumber).toBe(apt1Number);
  });

  it('groupProperties makes each property block contiguous (regardless of block order)', async () => {
    // Ordering is by property_id (random UUID), so the property that comes first is
    // non-deterministic — the guarantee is contiguity, not a specific block order.
    const grouped = (await reader.getAppointmentRows(baseFilters({ groupProperties: true }))).map((r) => r.suburb as string);
    // Collapsing consecutive duplicates must leave each property's suburb appearing once.
    const collapsed = grouped.filter((s, i) => i === 0 || s !== grouped[i - 1]);
    expect(new Set(collapsed).size).toBe(collapsed.length);

    // Sanity: without grouping, the date-ordered sequence interleaves the two Bondi
    // appointments around the Manly one, so it is NOT contiguous.
    const ungrouped = (await reader.getAppointmentRows(baseFilters())).map((r) => r.suburb as string);
    const ungroupedCollapsed = ungrouped.filter((s, i) => i === 0 || s !== ungrouped[i - 1]);
    expect(new Set(ungroupedCollapsed).size).toBeLessThan(ungroupedCollapsed.length);
  });
});

describe('getFinancialRows', () => {
  it('classifies the ledger and totals revenue/expense (APPROVED only)', async () => {
    const rows = await reader.getFinancialRows(baseFilters());
    // 5 approved detail rows + TOTAL + NET
    expect(rows).toHaveLength(7);
    const total = rows.find((r) => r.description === 'TOTAL')!;
    // Revenue = debit(100) - refund(20) + tenant-adjustment(10) = 90
    expect(total.revenue).toBe(90);
    // Expense = payout(80) + inspector-adjustment(15) = 95
    expect(total.expense).toBe(95);
    const net = rows.find((r) => String(r.description).startsWith('NET'))!;
    expect(net.revenue).toBe(-5);
    // The PENDING debit (999) must not appear.
    expect(rows.some((r) => r.revenue === 999)).toBe(false);
  });
});

describe('getAgencyRows', () => {
  it('aggregates per agency with status breakdown and distinct branch/property counts', async () => {
    const rows = await reader.getAgencyRows(baseFilters());
    expect(rows).toHaveLength(1);
    const a = rows[0];
    expect(a.agency).toBe('Acme Realty');
    expect(a.totalAppointments).toBe(3);
    expect(a.completed).toBe(1);
    expect(a.cancelled).toBe(1);
    expect(a.scheduled).toBe(1);
    expect(a.activeBranches).toBe(1);
    expect(a.activeProperties).toBe(2);
  });
});

describe('getPerformanceRows', () => {
  it('computes per-inspector metrics for appointments in the period', async () => {
    const rows = await reader.getPerformanceRows(baseFilters());
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.inspectorName).toBe('Ivy');
    expect(r.totalAppointments).toBe(2); // apt1 + apt2 carry the inspector
    expect(r.completed).toBe(1);
    expect(r.completionRate).toBe(50);
  });
});
