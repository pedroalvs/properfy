/**
 * Execution-density aggregation against a real PostgreSQL database (F09-1).
 *
 * A mocked Prisma cannot tell "the tenant join isolated the rows" from "the
 * predicate was dropped", nor can it exercise the `FLOOR(coord * 1000)` cell
 * index at grid boundaries or the DST-exact civil-date window. The spatial
 * aggregation therefore needs a real DB.
 *
 * Requires Docker (testcontainers). Run via: `pnpm --filter backend test:integration:db`
 */

import type { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  EXECUTION_DENSITY_GRID_SCALE,
  MAX_EXECUTION_DENSITY_CELLS,
} from '@properfy/shared';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaExecutionDensityReader } from '../../../src/modules/inspector-execution/infrastructure/prisma-execution-density.reader';
import {
  periodToInstants,
  toCellIndex,
} from '../../../src/modules/inspector-execution/domain/execution-density-grid';
import type { ExecutionDensityFilters } from '../../../src/modules/inspector-execution/domain/execution-density.reader';

let harness: DbHarness | undefined;
let prisma: PrismaClient;
let reader: PrismaExecutionDensityReader;

const suffix = (): string => Math.random().toString(36).slice(2, 10);

interface Agency {
  tenantId: string;
  branchId: string;
  userId: string;
  propertyId: string;
}

let serviceTypeId: string;

async function createAgency(name: string): Promise<Agency> {
  const tenant = await prisma.tenant.create({
    data: { name, legal_name: `${name} Pty Ltd ${suffix()}`, status: 'ACTIVE' },
  });
  const branch = await prisma.branch.create({
    data: { tenant_id: tenant.id, name: `${name} Branch`, status: 'ACTIVE' },
  });
  const user = await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      role: 'OP',
      name: `${name} Actor`,
      email: `density-${suffix()}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
      status: 'ACTIVE',
    },
  });
  const property = await prisma.property.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      property_code: `DN-${suffix()}`,
      type: 'HOUSE',
      street: `${Math.floor(Math.random() * 100_000)} Test St`,
      suburb: 'Testville',
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
      lat: -33.9,
      lng: 151.18,
      geocoding_status: 'SUCCESS',
    },
  });
  return { tenantId: tenant.id, branchId: branch.id, userId: user.id, propertyId: property.id };
}

async function createInspector(name: string): Promise<string> {
  const inspector = await prisma.inspector.create({
    data: {
      name,
      email: `insp-${suffix()}@test.local`,
      phone: `+6140000${Math.floor(Math.random() * 10000)}`,
      status: 'ACTIVE',
    },
  });
  return inspector.id;
}

async function createAppointment(
  agency: Agency,
  opts: { status?: 'SCHEDULED' | 'DONE' | 'REJECTED'; deleted?: boolean } = {},
): Promise<string> {
  const appointment = await prisma.appointment.create({
    data: {
      tenant_id: agency.tenantId,
      branch_id: agency.branchId,
      property_id: agency.propertyId,
      service_type_id: serviceTypeId,
      status: opts.status ?? 'DONE',
      scheduled_date: new Date('2026-10-10T00:00:00.000Z'),
      time_slot_start: '09:00',
      time_slot_end: '12:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'PENDING',
      created_by_user_id: agency.userId,
      deleted_at: opts.deleted ? new Date() : null,
    },
  });
  return appointment.id;
}

async function createExecution(opts: {
  agency: Agency;
  inspectorId: string;
  startedAt: string;
  lat: string;
  lng: string;
  abandoned?: boolean;
  resumedAt?: string;
  status?: 'SCHEDULED' | 'DONE' | 'REJECTED';
  deletedAppointment?: boolean;
}): Promise<void> {
  const appointmentId = await createAppointment(opts.agency, {
    status: opts.status,
    deleted: opts.deletedAppointment,
  });
  await prisma.inspectionExecution.create({
    data: {
      appointment_id: appointmentId,
      inspector_id: opts.inspectorId,
      started_at: new Date(opts.startedAt),
      finished_at: null,
      resumed_at: opts.resumedAt ? new Date(opts.resumedAt) : null,
      abandoned_at: opts.abandoned ? new Date('2026-10-13T01:00:00.000Z') : null,
      start_latitude: opts.lat,
      start_longitude: opts.lng,
    },
  });
}

/** Cell A ≈ (-33869, 151209); Cell B ≈ (-33880, 151215). */
async function seedMainFixtures(): Promise<{ t1: Agency; t2: Agency; i1: string; i2: string }> {
  const t1 = await createAgency('T1');
  const t2 = await createAgency('T2');
  const i1 = await createInspector('I1');
  const i2 = await createInspector('I2');

  // e1, e2 — cell A, T1, I1
  await createExecution({ agency: t1, inspectorId: i1, startedAt: '2026-10-10T00:00:00.000Z', lat: '-33.86882', lng: '151.20929' });
  await createExecution({ agency: t1, inspectorId: i1, startedAt: '2026-10-11T00:00:00.000Z', lat: '-33.86811', lng: '151.20901' });
  // e3 — cell B, T1, I2
  await createExecution({ agency: t1, inspectorId: i2, startedAt: '2026-10-12T00:00:00.000Z', lat: '-33.87950', lng: '151.21500' });
  // e4 — cell A, T2, I1 (other agency)
  await createExecution({ agency: t2, inspectorId: i1, startedAt: '2026-10-12T00:00:00.000Z', lat: '-33.86890', lng: '151.20950' });
  // e5 — abandoned, T1, I1
  await createExecution({ agency: t1, inspectorId: i1, startedAt: '2026-10-13T00:00:00.000Z', lat: '-33.90000', lng: '151.25000', abandoned: true });
  // e6 — soft-deleted appointment, T1, I1
  await createExecution({ agency: t1, inspectorId: i1, startedAt: '2026-10-13T00:00:00.000Z', lat: '-33.91000', lng: '151.26000', deletedAppointment: true });
  // e7 — invalid coordinate (0,0), T1, I2
  await createExecution({ agency: t1, inspectorId: i2, startedAt: '2026-10-14T00:00:00.000Z', lat: '0', lng: '0' });
  // e8 — 30/09 23:59:59 Sydney (out), T1, I1
  await createExecution({ agency: t1, inspectorId: i1, startedAt: '2026-09-30T13:59:59.000Z', lat: '-33.86882', lng: '151.20929' });
  // e9 — 01/10 00:00 Sydney (in), T1, I1
  await createExecution({ agency: t1, inspectorId: i1, startedAt: '2026-09-30T14:00:00.000Z', lat: '-33.86882', lng: '151.20929' });

  return { t1, t2, i1, i2 };
}

const CELL_A = { latIndex: -33869, lngIndex: 151209 };
const CELL_B = { latIndex: -33880, lngIndex: 151215 };

function filters(overrides: Partial<ExecutionDensityFilters> = {}): ExecutionDensityFilters {
  return {
    ...periodToInstants('2026-10-01', '2026-10-31'),
    gridScale: EXECUTION_DENSITY_GRID_SCALE,
    minCellCount: 1,
    limit: MAX_EXECUTION_DENSITY_CELLS,
    ...overrides,
  };
}

function cell(rows: Array<{ latIndex: number; lngIndex: number; count: number }>, c: { latIndex: number; lngIndex: number }) {
  return rows.find((r) => r.latIndex === c.latIndex && r.lngIndex === c.lngIndex);
}

describe('PrismaExecutionDensityReader (real DB)', () => {
  beforeAll(async () => {
    harness = await setupDbHarness();
    prisma = harness.prisma;
    reader = new PrismaExecutionDensityReader(prisma);
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "inspection_executions", "appointments", "properties", "service_types", "users", "branches", "tenants" CASCADE`,
    );
    const st = await prisma.serviceType.create({
      data: {
        code: `DN-ROUTINE-${suffix()}`,
        name: `Routine Inspection ${suffix()}`,
        flow_type: 'ROUTINE',
      },
    });
    serviceTypeId = st.id;
  });

  it('D1: no tenant — cell A=4, cell B=1, invalid=1, excludes abandoned/deleted/out-of-window', async () => {
    await seedMainFixtures();
    const { rows, totals } = await reader.aggregate(filters());
    expect(cell(rows, CELL_A)?.count).toBe(4);
    expect(cell(rows, CELL_B)?.count).toBe(1);
    expect(totals.valid).toBe(5);
    expect(totals.invalid).toBe(1);
  });

  it('D2: tenantId T1 — cell A=3, cell B=1, e4 (T2) absent', async () => {
    const { t1 } = await seedMainFixtures();
    const { rows } = await reader.aggregate(filters({ tenantId: t1.tenantId }));
    expect(cell(rows, CELL_A)?.count).toBe(3);
    expect(cell(rows, CELL_B)?.count).toBe(1);
  });

  it('D3: tenantId T2 — only cell A=1, no T1 rows', async () => {
    const { t2 } = await seedMainFixtures();
    const { rows } = await reader.aggregate(filters({ tenantId: t2.tenantId }));
    expect(rows).toHaveLength(1);
    expect(cell(rows, CELL_A)?.count).toBe(1);
  });

  it('D4: tenantId T1 + inspectorId I2 — only cell B=1, invalid=1 (e7 is I2)', async () => {
    const { t1, i2 } = await seedMainFixtures();
    const { rows, totals } = await reader.aggregate(
      filters({ tenantId: t1.tenantId, inspectorId: i2 }),
    );
    expect(rows).toHaveLength(1);
    expect(cell(rows, CELL_B)?.count).toBe(1);
    expect(totals.invalid).toBe(1);
  });

  it('D5: tenantId T1 + inspectorId I1 — only cell A=3', async () => {
    const { t1, i1 } = await seedMainFixtures();
    const { rows } = await reader.aggregate(filters({ tenantId: t1.tenantId, inspectorId: i1 }));
    expect(rows).toHaveLength(1);
    expect(cell(rows, CELL_A)?.count).toBe(3);
  });

  it('D6: single-day window 2026-10-01 — only e9 in cell A=1', async () => {
    await seedMainFixtures();
    const { rows } = await reader.aggregate(filters(periodToInstants('2026-10-01', '2026-10-01')));
    expect(rows).toHaveLength(1);
    expect(cell(rows, CELL_A)?.count).toBe(1);
  });

  it('D7: an empty window returns no rows and zero totals', async () => {
    await seedMainFixtures();
    const { rows, totals } = await reader.aggregate(
      filters(periodToInstants('2026-11-01', '2026-11-30')),
    );
    expect(rows).toEqual([]);
    expect(totals).toEqual({ valid: 0, invalid: 0 });
  });

  it('D8: an in-progress execution (finished_at null) still counts', async () => {
    // seedMainFixtures already stores finished_at null for every execution; e3 is such a row.
    const { t1, i2 } = await seedMainFixtures();
    const { rows } = await reader.aggregate(filters({ tenantId: t1.tenantId, inspectorId: i2 }));
    expect(cell(rows, CELL_B)?.count).toBe(1);
  });

  it('D9: a restarted execution counts once at the new check-in cell', async () => {
    const t1 = await createAgency('T1');
    const i1 = await createInspector('I1');
    // One appointment, one execution row restarted into cell B coordinates.
    await createExecution({
      agency: t1,
      inspectorId: i1,
      startedAt: '2026-10-10T00:00:00.000Z',
      lat: '-33.87950',
      lng: '151.21500',
      resumedAt: '2026-10-10T02:00:00.000Z',
    });
    const { rows } = await reader.aggregate(filters({ tenantId: t1.tenantId }));
    expect(rows).toHaveLength(1);
    expect(cell(rows, CELL_B)?.count).toBe(1);
  });

  it('D10: limit=1 returns limit+1 rows ordered by count DESC then position', async () => {
    await seedMainFixtures();
    const { rows } = await reader.aggregate(filters({ limit: 1 }));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ ...CELL_A, count: 4 });
    expect(rows[1]).toMatchObject({ ...CELL_B, count: 1 });
  });

  it('D11: rows carry only latIndex, lngIndex, count (no raw coordinate leaves the DB)', async () => {
    await seedMainFixtures();
    const { rows } = await reader.aggregate(filters());
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['count', 'latIndex', 'lngIndex']);
    }
  });

  it('D12: CL k=3 with tenantId T1 — cell A shown (3), cell B hidden (1)', async () => {
    const { t1 } = await seedMainFixtures();
    const { rows } = await reader.aggregate(filters({ tenantId: t1.tenantId, minCellCount: 3 }));
    expect(cell(rows, CELL_A)?.count).toBe(3);
    expect(cell(rows, CELL_B)).toBeUndefined();
  });

  it('D13: cell B at 2 stays hidden with k=3', async () => {
    const { t1, i2 } = await seedMainFixtures();
    await createExecution({ agency: t1, inspectorId: i2, startedAt: '2026-10-15T00:00:00.000Z', lat: '-33.87950', lng: '151.21500' });
    const { rows } = await reader.aggregate(filters({ tenantId: t1.tenantId, minCellCount: 3 }));
    expect(cell(rows, CELL_B)).toBeUndefined();
  });

  it('D14: cell B at 3 appears with k=3', async () => {
    const { t1, i2 } = await seedMainFixtures();
    await createExecution({ agency: t1, inspectorId: i2, startedAt: '2026-10-15T00:00:00.000Z', lat: '-33.87950', lng: '151.21500' });
    await createExecution({ agency: t1, inspectorId: i2, startedAt: '2026-10-16T00:00:00.000Z', lat: '-33.87950', lng: '151.21500' });
    const { rows } = await reader.aggregate(filters({ tenantId: t1.tenantId, minCellCount: 3 }));
    expect(cell(rows, CELL_B)?.count).toBe(3);
  });

  it('D15: the same seed with k=1 (AM/OP) shows cell B at 2', async () => {
    const { t1, i2 } = await seedMainFixtures();
    await createExecution({ agency: t1, inspectorId: i2, startedAt: '2026-10-15T00:00:00.000Z', lat: '-33.87950', lng: '151.21500' });
    const { rows } = await reader.aggregate(filters({ tenantId: t1.tenantId, minCellCount: 1 }));
    expect(cell(rows, CELL_B)?.count).toBe(2);
  });

  it('D16: grid-boundary SQL indices match toCellIndex point for point', async () => {
    const t3 = await createAgency('T3');
    const i = await createInspector('I-boundary');
    const points = [
      { lat: '-33.8690000', lng: '151.2090000' },
      { lat: '-33.8690001', lng: '151.2090000' },
      { lat: '-33.8689999', lng: '151.2089999' },
    ];
    for (const p of points) {
      await createExecution({ agency: t3, inspectorId: i, startedAt: '2026-10-10T00:00:00.000Z', lat: p.lat, lng: p.lng });
    }
    const { rows } = await reader.aggregate(filters({ tenantId: t3.tenantId }));
    for (const p of points) {
      const expected = { latIndex: toCellIndex(p.lat), lngIndex: toCellIndex(p.lng) };
      expect(cell(rows, expected)?.count).toBe(1);
    }
  });

  it('D17: a DONE→REJECTED appointment counts as a check-in (L-F09-02)', async () => {
    const t4 = await createAgency('T4');
    const i = await createInspector('I-t4');
    await createExecution({
      agency: t4,
      inspectorId: i,
      startedAt: '2026-10-10T00:00:00.000Z',
      lat: '-33.86882',
      lng: '151.20929',
      status: 'REJECTED',
    });
    const { rows } = await reader.aggregate(filters({ tenantId: t4.tenantId, minCellCount: 1 }));
    expect(cell(rows, CELL_A)?.count).toBe(1);
  });

  it('D18: a reopened appointment counts once at the original cell (total T4 = 2)', async () => {
    const t4 = await createAgency('T4');
    const i = await createInspector('I-t4');
    // The DONE->REJECTED one from D17 ...
    await createExecution({ agency: t4, inspectorId: i, startedAt: '2026-10-10T00:00:00.000Z', lat: '-33.86882', lng: '151.20929', status: 'REJECTED' });
    // ... plus a reopened one (resumed_at set, original started_at/coords preserved).
    await createExecution({ agency: t4, inspectorId: i, startedAt: '2026-10-10T00:00:00.000Z', lat: '-33.86882', lng: '151.20929', resumedAt: '2026-10-10T03:00:00.000Z', status: 'SCHEDULED' });
    const { rows, totals } = await reader.aggregate(filters({ tenantId: t4.tenantId, minCellCount: 1 }));
    expect(cell(rows, CELL_A)?.count).toBe(2);
    expect(totals.valid).toBe(2);
  });
});
