import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GOAL_METRIC_LABELS, REWARD_AWARD_STATUS_LABELS, describeGoal } from '@properfy/shared';
import { setupDbHarness, teardownDbHarness, type DbHarness } from '../db/harness';
import { PrismaReportDataReader } from '../../../src/modules/report/infrastructure/prisma-report-data-reader';
import { INSPECTOR_PROGRAM_COLUMNS } from '../../../src/modules/report/domain/report.constants';
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
// A third appointment (CANCELLED, Manly) and a second agency are seeded for the
// aggregate/isolation cases; their numbers are asserted via counts, not directly.

// Scoped to the first agency by default so per-report assertions are deterministic;
// the isolation test overrides `tenantId` to exercise cross-agency behavior.
const baseFilters = (overrides: Partial<ReportDataFilters> = {}): ReportDataFilters => ({
  fromDate: '2026-03-01',
  toDate: '2026-03-31',
  dateAxis: 'SCHEDULED',
  tenantId,
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
      data: { tenant_id: tenantId, branch_id: branchId, property_code: `${code}-${rnd()}`, type: 'HOUSE', street: `${code} St`, suburb, postcode: '2000', state: 'NSW', country: 'AU', geocoding_status: 'SUCCESS' },
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
        time_slot_start: '09:00',
        time_slot_end: '10:00',
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
  await mkApt({ propertyId: propManlyId, status: 'CANCELLED', scheduled: '2026-03-15', created: '2026-03-02' });

  // Second agency (same March window) — proves the tenant_id filter isolates cross-agency data.
  const otherTenant = await prisma.tenant.create({
    data: { name: 'Beta Realty', legal_name: `Beta Realty ${rnd()}`, status: 'ACTIVE', currency: 'AUD' },
  });
  const otherBranch = await prisma.branch.create({ data: { tenant_id: otherTenant.id, name: 'Beta CBD', status: 'ACTIVE' } });
  const otherUser = await prisma.user.create({
    data: { tenant_id: otherTenant.id, branch_id: otherBranch.id, role: 'OP', name: 'Op2', email: `op2-${rnd()}@t.local`, password_hash: 'x'.repeat(20), status: 'ACTIVE' },
  });
  const otherProp = await prisma.property.create({
    data: { tenant_id: otherTenant.id, branch_id: otherBranch.id, property_code: `BP-${rnd()}`, type: 'HOUSE', street: 'Beta St', suburb: 'Bondi', postcode: '2000', state: 'NSW', country: 'AU', geocoding_status: 'SUCCESS' },
  });
  await prisma.appointment.create({
    data: {
      tenant_id: otherTenant.id,
      branch_id: otherBranch.id,
      property_id: otherProp.id,
      service_type_id: serviceType.id,
      status: 'DONE',
      scheduled_date: new Date('2026-03-12T00:00:00.000Z'),
      time_slot_start: '09:00',
      time_slot_end: '10:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'CONFIRMED',
      created_by_user_id: otherUser.id,
    },
  });

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
  it('SCHEDULED axis returns three March appointments for the agency', async () => {
    const rows = await reader.getAppointmentRows(baseFilters());
    expect(rows).toHaveLength(3);
  });

  it('renders dates and time slots in the display format the operator reads', async () => {
    // The XLSX is read by humans, so these columns carry dd/mm/yyyy and 12-hour
    // times rather than the ISO values the database stores.
    //
    // Asserted as exact values, not shapes: a /^\d{2}\/\d{2}\/\d{4}$/ regex is
    // satisfied by both 10/03/2026 and 03/10/2026, so it cannot detect the
    // day/month inversion this whole change exists to prevent.
    const rows = await reader.getAppointmentRows(baseFilters({ status: 'DONE' }));

    // apt1 is seeded at 2026-03-10T00:00Z — the 10th of March, not the 3rd of October.
    expect(rows[0].scheduledDate).toBe('10/03/2026');
    expect(rows[0].timeSlot).toBe('9:00 am – 10:00 am');
    // Seeded created_at 2026-02-01T00:00Z is 11:00 the same day in Sydney (UTC+11
    // under DST). Previously this column dumped a raw ISO timestamp.
    expect(rows[0].createdAt).toBe('01/02/2026, 11:00 am');
  });

  it('applies the status filter', async () => {
    const rows = await reader.getAppointmentRows(baseFilters({ status: 'DONE' }));
    expect(rows).toHaveLength(1);
    expect(rows[0].appointmentNumber).toBe(apt1Number);
    expect(rows[0].suburb).toBe('Bondi');
    expect(rows[0].agency).toBe('Acme Realty');
  });

  it('scopes to a single agency via tenantId and excludes other agencies', async () => {
    const acmeOnly = await reader.getAppointmentRows(baseFilters());
    expect(acmeOnly.every((r) => r.agency === 'Acme Realty')).toBe(true);

    // Cross-agency (no tenantId) must additionally surface Beta Realty's March appointment.
    const crossAgency = await reader.getAppointmentRows(baseFilters({ tenantId: undefined }));
    expect(crossAgency.length).toBeGreaterThan(acmeOnly.length);
    expect(crossAgency.some((r) => r.agency === 'Beta Realty')).toBe(true);
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
    // These ledger entries carry no appointment, so the confirmation-date column
    // exists but stays blank.
    expect(rows.every((r) => r.confirmationDate === '')).toBe(true);
  });

  // An agency must never see the platform↔inspector leg. Asserted against real
  // Postgres because this is a WHERE-clause behaviour a stubbed repo would fake.
  it('excludes the inspector leg entirely when agency-scoped', async () => {
    const rows = await reader.getFinancialRows({ ...baseFilters(), agencyScoped: true });

    // debit(100) + refund(20) + tenant-adjustment(10) = 3 detail rows + TOTAL
    expect(rows).toHaveLength(4);
    expect(rows.some((r) => r.entryType === 'INSPECTOR_PAYOUT')).toBe(false);
    // The inspector-scoped MANUAL_ADJUSTMENT (15) is part of the inspector leg too.
    expect(rows.some((r) => r.amount === 15 || r.amount === -15)).toBe(false);

    const total = rows.find((r) => r.description === 'TOTAL')!;
    expect(total.amount).toBe(90); // 100 - 20 + 10

    // No NET row and no inspector/expense columns to populate.
    expect(rows.some((r) => String(r.description).startsWith('NET'))).toBe(false);
    for (const row of rows) {
      expect(row).not.toHaveProperty('inspector');
      expect(row).not.toHaveProperty('expense');
    }
  });
});

describe('getFinancialRows — confirmation date column', () => {
  // Isolated dataset (own tenant + August window) so it never perturbs the
  // shared ledger the counts/totals above assert against.
  let cdTenantId: string;
  let routineAptNumber: number;
  let ingoingAptNumber: number;
  const rnd = () => Math.random().toString(36).slice(2, 10);
  const cdFilters = (overrides: Partial<ReportDataFilters> = {}): ReportDataFilters => ({
    fromDate: '2026-08-01',
    toDate: '2026-08-31',
    dateAxis: 'SCHEDULED',
    tenantId: cdTenantId,
    ...overrides,
  });

  beforeAll(async () => {
    const prisma = harness.prisma;
    const tenant = await prisma.tenant.create({
      data: { name: 'Confirm Co', legal_name: `Confirm Co ${rnd()}`, status: 'ACTIVE', currency: 'AUD' },
    });
    cdTenantId = tenant.id;
    const branch = await prisma.branch.create({ data: { tenant_id: cdTenantId, name: 'HQ', status: 'ACTIVE' } });
    const user = await prisma.user.create({
      data: { tenant_id: cdTenantId, branch_id: branch.id, role: 'OP', name: 'Op', email: `op-${rnd()}@t.local`, password_hash: 'x'.repeat(20), status: 'ACTIVE' },
    });
    const property = await prisma.property.create({
      data: { tenant_id: cdTenantId, branch_id: branch.id, property_code: `CD-${rnd()}`, type: 'HOUSE', street: 'Confirm St', suburb: 'Bondi', postcode: '2000', state: 'NSW', country: 'AU', geocoding_status: 'SUCCESS' },
    });
    const routineST = await prisma.serviceType.create({
      data: { code: `RT-${rnd()}`, name: `Routine ${rnd()}`, flow_type: 'ROUTINE', requires_rental_tenant_confirmation: true, status: 'ACTIVE' },
    });
    const ingoingST = await prisma.serviceType.create({
      data: { code: `IN-${rnd()}`, name: `Ingoing ${rnd()}`, flow_type: 'INGOING', requires_rental_tenant_confirmation: false, status: 'ACTIVE' },
    });

    // Both appointments are DONE and operator-cross-checked, since a ledger
    // entry only ever exists after that point.
    const mkApt = async (serviceTypeId: string, confirmationStatus: 'CONFIRMED' | 'PENDING') =>
      prisma.appointment.create({
        data: {
          tenant_id: cdTenantId,
          branch_id: branch.id,
          property_id: property.id,
          service_type_id: serviceTypeId,
          status: 'DONE',
          scheduled_date: new Date('2026-08-05T00:00:00.000Z'),
          time_slot_start: '09:00',
          time_slot_end: '10:00',
          price_amount: '100.00',
          payout_amount: '80.00',
          pricing_rule_snapshot_json: {},
          rental_tenant_confirmation_status: confirmationStatus,
          created_by_user_id: user.id,
          done_marked_by_user_id: user.id,
          done_checked_by_user_id: user.id,
          done_checked_at: new Date('2026-08-06T00:00:00.000Z'),
        },
      });

    // Confirmed routine appointment: attach a CONFIRMED active cycle carrying the timestamp.
    const routineApt = await mkApt(routineST.id, 'CONFIRMED');
    routineAptNumber = routineApt.appointment_number;
    const cycle = await prisma.appointmentConfirmationCycle.create({
      data: {
        appointment_id: routineApt.id,
        cycle_number: 1,
        scheduled_date: new Date('2026-08-05T00:00:00.000Z'),
        status: 'CONFIRMED',
        confirmation_source: 'RENTAL_TENANT_PORTAL',
        confirmed_at: new Date('2026-08-05T02:00:00.000Z'), // 12:00 Sydney (AEST) → 05/08/2026
      },
    });
    await prisma.appointment.update({
      where: { id: routineApt.id },
      data: { active_confirmation_cycle_id: cycle.id },
    });

    // Ingoing appointment: no occupant to confirm (never gets a confirmation).
    const ingoingApt = await mkApt(ingoingST.id, 'PENDING');
    ingoingAptNumber = ingoingApt.appointment_number;

    const fe = (appointmentId: string) =>
      prisma.financialEntry.create({
        data: {
          tenant_id: cdTenantId,
          currency: 'AUD',
          status: 'APPROVED',
          description: 'debit',
          initiated_by_user_id: user.id,
          effective_at: new Date('2026-08-06T00:00:00.000Z'),
          entry_type: 'TENANT_DEBIT',
          amount: '100.00',
          appointment_id: appointmentId,
        } as any,
      });
    await fe(routineApt.id);
    await fe(ingoingApt.id);
  }, 180_000);

  it('puts the confirmation date on the confirmed routine row and N/A on the ingoing row', async () => {
    const rows = await reader.getFinancialRows(cdFilters());

    const routineRow = rows.find((r) => r.appointmentNumber === routineAptNumber);
    const ingoingRow = rows.find((r) => r.appointmentNumber === ingoingAptNumber);
    expect(routineRow?.confirmationDate).toBe('05/08/2026');
    expect(ingoingRow?.confirmationDate).toBe('N/A');
  });

  it('carries the confirmation date through the agency-scoped variant too', async () => {
    const rows = await reader.getFinancialRows(cdFilters({ agencyScoped: true }));

    const routineRow = rows.find((r) => r.appointmentNumber === routineAptNumber);
    const ingoingRow = rows.find((r) => r.appointmentNumber === ingoingAptNumber);
    expect(routineRow?.confirmationDate).toBe('05/08/2026');
    expect(ingoingRow?.confirmationDate).toBe('N/A');
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
    expect(r.inspectorEmail).toBeDefined();
  });

  it('omits the inspector email when agency-scoped', async () => {
    const rows = await reader.getPerformanceRows({ ...baseFilters(), agencyScoped: true });
    expect(rows).toHaveLength(1);
    expect(rows[0].inspectorName).toBe('Ivy');
    expect(rows[0]).not.toHaveProperty('inspectorEmail');
  });
});

/**
 * Inspector Program report (F08-5, 03.14). Platform-scoped: one row per reward
 * (P9 order), one "No achievers" row per empty closure, one "Skipped (goal
 * inactive)" row per SKIPPED_INACTIVE closure; out-of-range closures excluded.
 * Covers the Q12 bonus ledger/invoice columns and the L-F08-13 scope fallback.
 */
describe('getInspectorProgramRows (INSPECTOR_PROGRAM report)', () => {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
  const programFilters: ReportDataFilters = {
    fromDate: '2026-03-01',
    toDate: '2026-03-31',
    dateAxis: 'SCHEDULED',
    timezone: 'Australia/Sydney',
  };

  let programRows: Record<string, unknown>[];
  const row = (inspectorName: string) => {
    const found = programRows.find((r) => r.inspector === inspectorName);
    if (!found) throw new Error(`no program row for inspector ${inspectorName}`);
    return found;
  };

  beforeAll(async () => {
    const prisma = harness.prisma;
    const rnd = () => Math.random().toString(36).slice(2, 10);

    const amUser = await prisma.user.create({
      data: { role: 'AM', name: 'Program Admin', email: `am-${rnd()}@t.local`, password_hash: 'x'.repeat(20), status: 'ACTIVE' },
    });

    // Eight inspectors: I1..I7 for the achievers closure, I8 for the out-of-range one.
    const inspectorIds: Record<string, string> = {};
    for (const label of ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8']) {
      const insp = await prisma.inspector.create({ data: { name: label, email: `${label.toLowerCase()}-${rnd()}@t.local`, status: 'ACTIVE' } });
      inspectorIds[label] = insp.id;
    }

    // Unique name: the suite already seeds a 'Routine' service type (case-insensitive unique).
    // The report reads the frozen `scope_label` snapshot, never this row's name, so the goal's
    // scope FK can point at a differently-named type while the closures still label it 'Routine'.
    const serviceType = await prisma.serviceType.create({
      data: { code: `ST-${rnd()}`, name: `Routine ${rnd()}`, flow_type: 'ROUTINE', requires_rental_tenant_confirmation: true, status: 'ACTIVE' },
    });

    const goalV = await prisma.inspectorGoal.create({
      data: { title: 'Volume 10', metric: 'VOLUME', comparator: 'GTE', target: '10', period: 'WEEKLY', reward_amount: '30.00', starts_at: d('2026-03-02'), created_by_user_id: amUser.id },
    });
    // A SERVICE_TYPE_VOLUME goal exercises the scope-label columns + describeGoal fallback (L-F08-13).
    const goalR = await prisma.inspectorGoal.create({
      data: { title: 'Service type 9', metric: 'SERVICE_TYPE_VOLUME', comparator: 'GTE', target: '9', period: 'WEEKLY', reward_amount: '50.00', starts_at: d('2026-03-02'), scope_service_type_id: serviceType.id, created_by_user_id: amUser.id },
    });

    const closure = (data: Record<string, unknown>) =>
      prisma.goalPeriodClosure.create({ data: { participant_ids: [], closed_at: d('2026-03-09'), ...data } as never });

    // Goal V closures.
    await closure({ goal_id: goalV.id, period_type: 'WEEKLY', period_start: d('2026-03-02'), period_end: d('2026-03-08'), participants_count: 7, achievers_count: 7, promised_amount: '210.00', trigger: 'SCHEDULED' });
    await closure({ goal_id: goalV.id, period_type: 'WEEKLY', period_start: d('2026-03-09'), period_end: d('2026-03-15'), participants_count: 3, achievers_count: 0, promised_amount: '90.00', trigger: 'SCHEDULED' });
    // Out of range (period_end before the window) — must not appear.
    await closure({ goal_id: goalV.id, period_type: 'WEEKLY', period_start: d('2026-02-16'), period_end: d('2026-02-22'), participants_count: 1, achievers_count: 1, promised_amount: '30.00', trigger: 'SCHEDULED' });
    // Goal R: a skipped-inactive period (scope captured) and a no-achievers period with a deleted scope.
    await closure({ goal_id: goalR.id, period_type: 'WEEKLY', period_start: d('2026-03-02'), period_end: d('2026-03-08'), participants_count: 0, achievers_count: 0, promised_amount: '0.00', trigger: 'SKIPPED_INACTIVE', scope_label: 'Routine' });
    await closure({ goal_id: goalR.id, period_type: 'WEEKLY', period_start: d('2026-03-09'), period_end: d('2026-03-15'), participants_count: 2, achievers_count: 0, promised_amount: '100.00', trigger: 'SCHEDULED', scope_label: null });

    // Invoices the awards link to (the "invoiced" marker).
    const inv = (num: number, status: 'CLOSED' | 'PAID', inspector: string, paidAt?: string) =>
      prisma.inspectorInvoice.create({
        data: { invoice_number: num, inspector_id: inspectorIds[inspector], period_start: d('2026-03-02'), period_end: d('2026-03-08'), period_type: 'WEEKLY', status, currency: 'AUD', total_amount: '30.00', ...(paidAt ? { paid_at: d(paidAt) } : {}) },
      });
    const invoice42 = await inv(42, 'PAID', 'I1', '2026-03-20');
    const invoice43 = await inv(43, 'PAID', 'I6', '2026-03-20');
    const invoice99 = await inv(99, 'CLOSED', 'I2');
    const invoice100 = await inv(100, 'CLOSED', 'I7');

    // Awards of the achievers closure — distinct achieved_value so P9 order is deterministic (desc).
    const award = (data: Record<string, unknown>) =>
      prisma.rewardAward.create({
        data: {
          goal_id: goalV.id,
          period_type: 'WEEKLY',
          period_start: d('2026-03-02'),
          period_end: d('2026-03-08'),
          goal_title: 'Volume 10',
          metric: 'VOLUME',
          comparator: 'GTE',
          target: '10',
          amount: '30.00',
          service_count: 12,
          achieved_on: d('2026-03-05'),
          ...data,
        } as never,
      });

    const aPaid = await award({ inspector_id: inspectorIds.I1, achieved_value: '20', index_score_at_close: '90.0', level_at_close: 'GOLD', status: 'PAID', approved_by_user_id: amUser.id, approved_at: d('2026-03-09'), paid_at: d('2026-03-20'), inspector_invoice_id: invoice42.id });
    const aApprInv = await award({ inspector_id: inspectorIds.I2, achieved_value: '19', status: 'APPROVED', approved_by_user_id: amUser.id, approved_at: d('2026-03-09'), inspector_invoice_id: invoice99.id });
    const aApprUn = await award({ inspector_id: inspectorIds.I3, achieved_value: '18', status: 'APPROVED', approved_by_user_id: amUser.id, approved_at: d('2026-03-09') });
    await award({ inspector_id: inspectorIds.I4, achieved_value: '17', status: 'PENDING' });
    const aVoidPre = await award({ inspector_id: inspectorIds.I5, achieved_value: '16', status: 'VOID', voided_by_user_id: amUser.id, voided_at: d('2026-03-10'), void_reason: 'Agency rejected the job', inspector_note: 'Sorry about that' });
    const aVoidRev = await award({ inspector_id: inspectorIds.I6, achieved_value: '15', status: 'VOID', approved_by_user_id: amUser.id, approved_at: d('2026-03-09'), paid_at: d('2026-03-20'), voided_by_user_id: amUser.id, voided_at: d('2026-03-22'), void_reason: 'Done in error', inspector_invoice_id: invoice43.id });
    const aVoidUnrev = await award({ inspector_id: inspectorIds.I7, achieved_value: '14', status: 'VOID', approved_by_user_id: amUser.id, approved_at: d('2026-03-09'), paid_at: d('2026-03-20'), voided_by_user_id: amUser.id, voided_at: d('2026-03-22'), void_reason: 'Done in error', inspector_invoice_id: invoice100.id });
    // Award of the out-of-range closure (must be excluded by period_end).
    await award({ inspector_id: inspectorIds.I8, achieved_value: '50', status: 'APPROVED', approved_by_user_id: amUser.id, approved_at: d('2026-02-23'), period_start: d('2026-02-16'), period_end: d('2026-02-22') });

    // Bonus ledger: original entry (1:1 with the reward) + reversal (reference_entry_id → original).
    // INSPECTOR_BONUS entries carry inspector_id, null tenant_id and no appointment (F08-6 shape CHECK).
    const bonus = (data: Record<string, unknown>) =>
      prisma.financialEntry.create({
        data: { entry_type: 'INSPECTOR_BONUS', tenant_id: null, currency: 'AUD', description: 'Inspector goal bonus', effective_at: d('2026-03-09'), ...data } as never,
      });
    await bonus({ reward_award_id: aPaid.id, inspector_id: inspectorIds.I1, amount: '30.00', status: 'APPROVED' });
    await bonus({ reward_award_id: aApprInv.id, inspector_id: inspectorIds.I2, amount: '30.00', status: 'APPROVED' });
    await bonus({ reward_award_id: aApprUn.id, inspector_id: inspectorIds.I3, amount: '30.00', status: 'APPROVED' });
    // I5 void-before-invoicing: the bonus entry was voided in the same transaction (F08-6).
    await bonus({ reward_award_id: aVoidPre.id, inspector_id: inspectorIds.I5, amount: '30.00', status: 'VOIDED' });

    // aVoidRev: original (invoiced) stays APPROVED; a negative reversal lands on invoice 57 (CLOSED).
    const origRev = await bonus({ reward_award_id: aVoidRev.id, inspector_id: inspectorIds.I6, amount: '30.00', status: 'APPROVED' });
    const reversalRev = await bonus({ reference_entry_id: origRev.id, inspector_id: inspectorIds.I6, amount: '-30.00', status: 'APPROVED' });
    await prisma.inspectorInvoice.create({
      data: {
        invoice_number: 57, inspector_id: inspectorIds.I6, period_start: d('2026-03-09'), period_end: d('2026-03-15'), period_type: 'WEEKLY', status: 'CLOSED', currency: 'AUD', total_amount: '0.00',
        line_items_snapshot: [
          { kind: 'BONUS', serviceDate: '2026-03-09', appointmentId: null, appointmentCode: null, propertyAddress: null, serviceType: null, amount: -30, agencyId: null, agencyName: null, branchId: null, branchName: null, entryId: reversalRev.id, rewardAwardId: null, description: 'Bonus reversal' },
        ],
      },
    });

    // aVoidUnrev: original (invoiced) stays APPROVED; a reversal exists but is NOT on any invoice yet.
    const origUnrev = await bonus({ reward_award_id: aVoidUnrev.id, inspector_id: inspectorIds.I7, amount: '30.00', status: 'APPROVED' });
    await bonus({ reference_entry_id: origUnrev.id, inspector_id: inspectorIds.I7, amount: '-30.00', status: 'APPROVED' });

    programRows = await reader.getInspectorProgramRows(programFilters);
  }, 180_000);

  it('emits one row per reward plus a no-achievers and a skipped row, excluding out-of-range closures', () => {
    // 7 achiever rows + 1 no-achievers (goalV) + 1 skipped (goalR) + 1 no-achievers deleted-scope (goalR) = 10.
    expect(programRows).toHaveLength(10);
    // The out-of-range inspector never appears.
    expect(programRows.find((r) => r.inspector === 'I8')).toBeUndefined();
  });

  it('orders a closure\'s awards by value descending (P9)', () => {
    const achievers = programRows.filter((r) => ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7'].includes(r.inspector as string));
    expect(achievers.map((r) => r.inspector)).toEqual(['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7']);
  });

  it('renders civil dates as dd/mm/yyyy and an instant (approved at) in the requester timezone', () => {
    const r = row('I1');
    expect(r.periodStart).toBe('02/03/2026');
    expect(r.periodEnd).toBe('08/03/2026');
    expect(r.achievedOn).toBe('05/03/2026');
    expect(typeof r.approvedAt).toBe('string');
    expect((r.approvedAt as string).length).toBeGreaterThan(0);
  });

  it('shows the invoice, ledger status and paid-at for a PAID reward', () => {
    const r = row('I1');
    expect(r.status).toBe(REWARD_AWARD_STATUS_LABELS.PAID);
    // The Metric column renders the human label, never the raw enum code (award-row path).
    expect(r.metric).toBe(GOAL_METRIC_LABELS.VOLUME);
    expect(r.invoice).toBe('PINV-000042');
    expect(r.ledgerStatus).toBe('Approved');
    expect((r.paidAt as string).length).toBeGreaterThan(0);
    expect(r.voidedAfterInvoicing).toBe('No');
    expect(r.indexAtClose).toBe(90);
    expect(r.levelAtClose).toBe('GOLD');
  });

  it('shows an invoice for an APPROVED invoiced reward and none for an un-invoiced one', () => {
    expect(row('I2').invoice).toBe('PINV-000099');
    expect(row('I2').ledgerStatus).toBe('Approved');
    expect(row('I3').invoice).toBe('');
    expect(row('I3').ledgerStatus).toBe('Approved');
  });

  it('leaves ledger/invoice columns empty for a PENDING reward', () => {
    const r = row('I4');
    expect(r.status).toBe(REWARD_AWARD_STATUS_LABELS.PENDING);
    expect(r.ledgerStatus).toBe('');
    expect(r.invoice).toBe('');
    expect(r.paidAt).toBe('');
    expect(r.reversalInvoice).toBe('');
    expect(r.voidedAfterInvoicing).toBe('No');
  });

  it('shows a void reason, inspector note and Voided ledger for a pre-invoice void', () => {
    const r = row('I5');
    expect(r.status).toBe(REWARD_AWARD_STATUS_LABELS.VOID);
    expect(r.ledgerStatus).toBe('Voided');
    expect(r.voidReason).toBe('Agency rejected the job');
    expect(r.inspectorNote).toBe('Sorry about that');
    expect(r.voidedAfterInvoicing).toBe('No');
    expect(r.reversalInvoice).toBe('');
  });

  it('marks a void-after-paid reward and resolves its reversal invoice', () => {
    const r = row('I6');
    expect(r.voidedAfterInvoicing).toBe('Yes');
    expect((r.paidAt as string).length).toBeGreaterThan(0);
    expect(r.invoice).toBe('PINV-000043');
    expect(r.reversalInvoice).toBe('PINV-000057');
  });

  it('leaves the reversal invoice empty until the reversal is itself invoiced', () => {
    const r = row('I7');
    expect(r.voidedAfterInvoicing).toBe('Yes');
    expect(r.invoice).toBe('PINV-000100');
    expect(r.reversalInvoice).toBe('');
  });

  it('emits a no-achievers row with the in-force per-winner amount and empty inspector columns', () => {
    const noAch = programRows.find((r) => r.status === 'No achievers' && r.goal === 'Volume 10');
    expect(noAch).toBeDefined();
    expect(noAch!.participants).toBe(3);
    expect(noAch!.achievers).toBe(0);
    expect(noAch!.promised).toBe(90);
    expect(noAch!.perWinner).toBe(30);
    expect(noAch!.inspector).toBe('');
    expect(noAch!.amount).toBe('');
  });

  it('emits a skipped-inactive row carrying the frozen scope label', () => {
    const skipped = programRows.find((r) => r.status === 'Skipped (goal inactive)');
    expect(skipped).toBeDefined();
    expect(skipped!.participants).toBe(0);
    expect(skipped!.promised).toBe(0);
    expect(skipped!.scope).toBe('Routine');
    // The Metric column renders the human label, never the raw enum code (closure-row path).
    expect(skipped!.metric).toBe(GOAL_METRIC_LABELS.SERVICE_TYPE_VOLUME);
    expect(skipped!.goalDescription).toBe(describeGoal({ metric: 'SERVICE_TYPE_VOLUME', target: 9, scopeLabel: 'Routine' }));
  });

  it('uses the deleted-scope fallback when a scoped closure has no scope label', () => {
    const deleted = programRows.find((r) => r.status === 'No achievers' && r.goal === 'Service type 9');
    expect(deleted).toBeDefined();
    expect(deleted!.scope).toBe('');
    expect(deleted!.goalDescription).toBe(describeGoal({ metric: 'SERVICE_TYPE_VOLUME', target: 9, scopeLabel: null }));
    expect(deleted!.goalDescription).toContain('deleted service type');
  });

  it('exposes exactly the declared columns — no coordinate column — and never a raw id value', () => {
    const expectedKeys = INSPECTOR_PROGRAM_COLUMNS.map((c) => c.key).sort();
    // The fixed column set contains no latitude/longitude key (proves no coordinate leak).
    expect(expectedKeys.some((k) => /latitude|longitude/i.test(k))).toBe(false);
    for (const r of programRows) {
      expect(Object.keys(r).sort()).toEqual(expectedKeys);
      for (const value of Object.values(r)) {
        if (typeof value === 'string') expect(value).not.toMatch(UUID_RE);
      }
    }
  });
});
