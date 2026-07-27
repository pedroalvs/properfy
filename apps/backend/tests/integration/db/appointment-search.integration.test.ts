/**
 * Appointment list search — real-database verification.
 *
 * The search box (appointments list AND the map, both `GET /v1/appointments`)
 * advertises "Code, address, contact...". Measured against staging before this
 * fix, it silently returned zero for two natural inputs:
 *
 *   - `Kogarah`  → 0, because `property.suburb` was not in the OR (only
 *                  `street` was) — even though /v1/properties DID match suburb,
 *                  so the same property was findable on one screen and
 *                  invisible on the other.
 *   - `0071`     → 0, because the code parser required the full `PREFIX-NNNN`
 *                  form. The padding exists only in the FORMATTED code; the
 *                  column stores a plain integer (71).
 *
 * The filter is a Prisma `where` built in `buildWhere`, so a mocked repository
 * would pass no matter what the OR actually matches. This pins it on PostgreSQL.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';
import { AppointmentCodeFormatter } from '../../../src/modules/appointment/domain/appointment-code.formatter';
import { futureDateStr } from '../../helpers/date-fixtures';

const PAGINATION = { page: 1, pageSize: 50, sortOrder: 'desc' as const };

describe('appointment search filter (real DB)', () => {
  let harness: DbHarness | undefined;
  let prisma: PrismaClient;
  let repo: PrismaAppointmentRepository;
  let tenantId: string;
  let targetId: string;
  let targetNumber: number;

  /**
   * Runs the search exactly as the use case does — including the numeric-code
   * derivation — so the test exercises the real end-to-end filter, not just the
   * repository half.
   */
  async function search(term: string) {
    const filters = {
      tenantId,
      search: term,
      searchAppointmentNumber: AppointmentCodeFormatter.parseSearchTerm(term) ?? undefined,
    };
    const [rows, total] = await Promise.all([
      repo.findAll(filters, PAGINATION),
      repo.count(filters),
    ]);
    return { ids: rows.map((r) => r.appointment.id), total };
  }

  beforeAll(async () => {
    harness = await setupDbHarness();
    prisma = harness.prisma;
    repo = new PrismaAppointmentRepository(prisma);

    const suffix = Math.random().toString(36).slice(2, 10);
    const tenant = await prisma.tenant.create({
      data: { name: 'APSF Tenant', legal_name: `APSF LLC ${suffix}`, status: 'ACTIVE' },
    });
    tenantId = tenant.id;
    const branch = await prisma.branch.create({
      data: { tenant_id: tenantId, name: 'APSF Branch', status: 'ACTIVE' },
    });
    const user = await prisma.user.create({
      data: {
        tenant_id: tenantId,
        role: 'OP',
        name: 'APSF Actor',
        email: `apsf-${suffix}@test.local`,
        password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
        status: 'ACTIVE',
      },
    });
    const serviceType = await prisma.serviceType.create({
      data: {
        code: `APSF-ST-${suffix}`,
        name: `APSF Routine ${suffix}`,
        flow_type: 'ROUTINE',
        requires_rental_tenant_confirmation: true,
        status: 'ACTIVE',
      },
    });

    async function seedAppointment(
      property: {
        code: string;
        street: string;
        suburb: string;
        postcode: string;
        state: string;
      },
      owner: { tenantId: string; branchId: string } = { tenantId, branchId: branch.id },
    ) {
      const prop = await prisma.property.create({
        data: {
          tenant_id: owner.tenantId,
          branch_id: owner.branchId,
          property_code: property.code,
          type: 'HOUSE',
          street: property.street,
          suburb: property.suburb,
          postcode: property.postcode,
          state: property.state,
          country: 'AU',
          geocoding_status: 'SUCCESS',
        },
      });
      return prisma.appointment.create({
        data: {
          tenant_id: owner.tenantId,
          branch_id: owner.branchId,
          property_id: prop.id,
          service_type_id: serviceType.id,
          status: 'AWAITING_INSPECTOR',
          scheduled_date: new Date(futureDateStr(30)),
          time_slot_start: '09:00',
          time_slot_end: '10:00',
          price_amount: '100.00',
          payout_amount: '80.00',
          pricing_rule_snapshot_json: {},
          rental_tenant_confirmation_status: 'PENDING',
          created_by_user_id: user.id,
        },
      });
    }

    const target = await seedAppointment({
      code: `APSF-A-${suffix}`,
      street: '24/173-179 Princes Hwy',
      suburb: 'Kogarah',
      postcode: '2217',
      state: 'NSW',
    });
    targetId = target.id;
    targetNumber = target.appointment_number;

    // A decoy in a different suburb/postcode so a passing search is not just
    // "everything matches everything".
    await seedAppointment({
      code: `APSF-B-${suffix}`,
      street: '9 Elsewhere Rd',
      suburb: 'Manly',
      postcode: '2095',
      state: 'NSW',
    });

    // A SECOND AGENCY holding an identical address. Every scoped search must
    // exclude it — otherwise the search OR is leaking across tenants.
    const otherTenant = await prisma.tenant.create({
      data: { name: 'APSF Other', legal_name: `APSF Other LLC ${suffix}`, status: 'ACTIVE' },
    });
    const otherBranch = await prisma.branch.create({
      data: { tenant_id: otherTenant.id, name: 'APSF Other Branch', status: 'ACTIVE' },
    });
    await seedAppointment(
      {
        code: `APSF-C-${suffix}`,
        street: '24/173-179 Princes Hwy',
        suburb: 'Kogarah',
        postcode: '2217',
        state: 'NSW',
      },
      { tenantId: otherTenant.id, branchId: otherBranch.id },
    );
  }, 180_000);

  afterAll(async () => {
    if (harness) await teardownDbHarness(harness);
  });

  it('finds the appointment by suburb — the reported gap', async () => {
    const { ids, total } = await search('Kogarah');
    expect(ids).toContain(targetId);
    expect(total).toBe(1);
  });

  it('finds the appointment by postcode', async () => {
    const { ids, total } = await search('2217');
    expect(ids).toContain(targetId);
    expect(total).toBe(1);
  });

  it('finds the appointment by the bare zero-padded code — the other reported gap', async () => {
    const padded = String(targetNumber).padStart(4, '0');
    const { ids } = await search(padded);
    expect(ids).toContain(targetId);
  });

  it('still finds it by the fully formatted code (no regression)', async () => {
    const { ids } = await search(`INS-${String(targetNumber).padStart(4, '0')}`);
    expect(ids).toContain(targetId);
  });

  it('still finds it by street (no regression)', async () => {
    const { ids } = await search('Princes');
    expect(ids).toContain(targetId);
  });

  it('matches by state, which spans both seeded rows', async () => {
    const { total } = await search('NSW');
    expect(total).toBe(2);
  });

  it('matches state exactly, so a fragment does not sweep the whole state', async () => {
    // `state` is a short code. With a substring match, "NS" would pull in every
    // NSW row — and "A" would pull in WA, SA and TAS. Exact-but-case-insensitive
    // keeps the field useful.
    expect((await search('NS')).total).toBe(0);
    expect((await search('nsw')).total).toBe(2);
  });

  it('keeps the search OR inside the tenant scope', async () => {
    // The OR spans joined relations (property, contacts). If it were not
    // constrained by tenant_id, an identical address under another agency would
    // leak into the results — a multi-tenant isolation break, not a search bug.
    const { ids, total } = await search('Kogarah');
    expect(ids).toEqual([targetId]);
    expect(total).toBe(1);
    // Sanity: the other tenant's row really does match the same term.
    const unscoped = await repo.count({ search: 'Kogarah' });
    expect(unscoped).toBeGreaterThan(1);
  });

  it('returns nothing for a term that matches no field', async () => {
    const { ids, total } = await search('Woolloomooloo');
    expect(ids).toHaveLength(0);
    expect(total).toBe(0);
  });

  it('keeps count and rows consistent — the paginated total must not lie', async () => {
    const { ids, total } = await search('Kogarah');
    expect(total).toBe(ids.length);
  });

  it('survives a numeric term above the int4 ceiling instead of throwing', async () => {
    // Without the guard, Postgres rejects the value and the search 500s.
    await expect(search('99999999999')).resolves.toMatchObject({ total: 0 });
  });
});
