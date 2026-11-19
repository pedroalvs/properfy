import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';

/** Extract the SQL between the `-- backfill:begin` / `-- backfill:end` markers of the migration. */
function loadBackfillBlock(): string {
  const migrationsDir = resolve(__dirname, '../../../prisma/migrations');
  const dir = readdirSync(migrationsDir).find((d) => d.endsWith('_service_type_default_duration'));
  if (!dir) throw new Error('service_type_default_duration migration not found');
  const sql = readFileSync(resolve(migrationsDir, dir, 'migration.sql'), 'utf8');
  const begin = sql.indexOf('-- backfill:begin');
  const end = sql.indexOf('-- backfill:end');
  if (begin === -1 || end === -1) throw new Error('backfill markers not found');
  return sql.slice(begin + '-- backfill:begin'.length, end).trim();
}

describe('service_type default_duration_minutes backfill (real DB)', () => {
  let harness: DbHarness;
  let backfillSql: string;
  let base: { tenantId: string; branchId: string; propertyId: string; userId: string; inspectorId: string };

  const START = new Date('2026-01-01T00:00:00.000Z');

  beforeAll(async () => {
    harness = await setupDbHarness();
    backfillSql = loadBackfillBlock();
    const p = harness.prisma;
    const tenant = await p.tenant.create({
      data: { name: 'Backfill T', legal_name: `Backfill LLC ${Math.random()}`, status: 'ACTIVE' },
    });
    const branch = await p.branch.create({ data: { tenant_id: tenant.id, name: 'B', status: 'ACTIVE' } });
    const user = await p.user.create({
      data: {
        tenant_id: tenant.id,
        branch_id: branch.id,
        role: 'OP',
        name: 'Actor',
        email: `bf-${Math.random().toString(36).slice(2)}@test.local`,
        password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
        status: 'ACTIVE',
      },
    });
    const property = await p.property.create({
      data: {
        tenant_id: tenant.id,
        branch_id: branch.id,
        property_code: `BF-${Math.random().toString(36).slice(2)}`,
        type: 'HOUSE',
        street: '1 St',
        suburb: 'X',
        postcode: '2000',
        state: 'NSW',
        country: 'AU',
        geocoding_status: 'SUCCESS',
      },
    });
    const inspector = await p.inspector.create({
      data: { name: 'Insp', email: `insp-${Math.random().toString(36).slice(2)}@test.local`, phone: '+61400000000', status: 'ACTIVE' },
    });
    base = {
      tenantId: tenant.id,
      branchId: branch.id,
      propertyId: property.id,
      userId: user.id,
      inspectorId: inspector.id,
    };
  }, 120_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  async function makeServiceType(code: string): Promise<string> {
    const st = await harness.prisma.serviceType.create({
      data: { code, name: `${code} Type`, flow_type: 'ROUTINE', requires_rental_tenant_confirmation: true, status: 'ACTIVE' },
    });
    return st.id; // default_duration_minutes defaults to 45 at the DB level
  }

  async function addExecution(serviceTypeId: string, durationMinutes: number, opts: { abandoned?: boolean } = {}): Promise<void> {
    const p = harness.prisma;
    const appt = await p.appointment.create({
      data: {
        tenant_id: base.tenantId,
        branch_id: base.branchId,
        property_id: base.propertyId,
        service_type_id: serviceTypeId,
        status: 'DONE',
        scheduled_date: new Date('2026-01-01'),
        time_slot_start: '09:00',
        time_slot_end: '12:00',
        price_amount: '100.00',
        payout_amount: '80.00',
        pricing_rule_snapshot_json: {},
        rental_tenant_confirmation_status: 'CONFIRMED',
        created_by_user_id: base.userId,
      },
    });
    await p.inspectionExecution.create({
      data: {
        appointment_id: appt.id,
        inspector_id: base.inspectorId,
        started_at: START,
        finished_at: new Date(START.getTime() + durationMinutes * 60_000),
        start_latitude: '-33.9',
        start_longitude: '151.18',
        abandoned_at: opts.abandoned ? new Date() : null,
      },
    });
  }

  async function durationOf(serviceTypeId: string): Promise<number> {
    const rows = await harness.prisma.$queryRawUnsafe<Array<{ default_duration_minutes: number }>>(
      `SELECT default_duration_minutes FROM service_types WHERE id = $1`,
      serviceTypeId,
    );
    return rows[0]!.default_duration_minutes;
  }

  it('backfills measured averages, honours the >=10 sample and 5-480 bounds, is idempotent (test 27)', async () => {
    const x = await makeServiceType('BF-X'); // 12 execs of 62 min -> 60 (rounded to 5)
    for (let i = 0; i < 12; i += 1) await addExecution(x, 62);
    await addExecution(x, 5, { abandoned: true }); // abandoned -> must not count

    const y = await makeServiceType('BF-Y'); // 9 execs -> below the 10-sample floor -> 45
    for (let i = 0; i < 9; i += 1) await addExecution(y, 50);

    const z = await makeServiceType('BF-Z'); // 3-min (below 5) and 600-min (above 480) -> no valid sample -> 45
    for (let i = 0; i < 10; i += 1) await addExecution(z, 3);
    for (let i = 0; i < 10; i += 1) await addExecution(z, 600);

    const abandonedOnly = await makeServiceType('BF-AB'); // 12 abandoned -> none counted -> 45
    for (let i = 0; i < 12; i += 1) await addExecution(abandonedOnly, 70, { abandoned: true });

    await harness.prisma.$executeRawUnsafe(backfillSql);

    expect(await durationOf(x)).toBe(60);
    expect(await durationOf(y)).toBe(45);
    expect(await durationOf(z)).toBe(45);
    expect(await durationOf(abandonedOnly)).toBe(45);

    // Idempotent: a second run yields the same values.
    await harness.prisma.$executeRawUnsafe(backfillSql);
    expect(await durationOf(x)).toBe(60);
    expect(await durationOf(y)).toBe(45);
  }, 60_000);
});
