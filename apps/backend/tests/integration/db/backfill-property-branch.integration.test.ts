/**
 * Real-Postgres coverage for the one-off branch backfill
 * (`src/scripts/backfill-property-branch.ts`).
 *
 * The script repairs properties the appointment import left with
 * `branch_id = NULL` by inferring the branch from their appointments. The
 * cases that matter are the ones it must NOT guess — a property operated
 * under two branches, or one with no appointments at all — plus the promise
 * that a dry run writes nothing. All three are properties of real rows and
 * real queries (`distinct` on `branch_id`), so they are asserted against a
 * live database rather than a mocked repository.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { backfillPropertyBranch } from '../../../src/scripts/backfill-property-branch';

let harness: DbHarness;

interface Scenario {
  tenantId: string;
  branchA: string;
  branchB: string;
  singleBranchProperty: string;
  multiBranchProperty: string;
  orphanProperty: string;
  alreadyBranchedProperty: string;
}

async function seedScenario(): Promise<Scenario> {
  const suffix = Math.random().toString(36).slice(2, 10);
  const prisma = harness.prisma;

  const tenant = await prisma.tenant.create({
    data: { name: `T-backfill-${suffix}`, legal_name: `T-backfill-${suffix} LLC`, status: 'ACTIVE' },
  });
  const [branchA, branchB] = await Promise.all([
    prisma.branch.create({ data: { tenant_id: tenant.id, name: 'North', status: 'ACTIVE' } }),
    prisma.branch.create({ data: { tenant_id: tenant.id, name: 'City', status: 'ACTIVE' } }),
  ]);
  const user = await prisma.user.create({
    data: {
      tenant_id: tenant.id, branch_id: branchA.id, role: 'OP', name: 'Actor',
      email: `backfill-${suffix}@test.local`, password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake', status: 'ACTIVE',
    },
  });
  const serviceType = await prisma.serviceType.create({
    data: {
      code: `BF-${suffix}`, name: `Routine ${suffix}`, flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: true, status: 'ACTIVE',
    },
  });

  const makeProperty = async (label: string, branchId: string | null) => {
    const property = await prisma.property.create({
      data: {
        tenant_id: tenant.id, branch_id: branchId,
        property_code: `IMP-${label}-${suffix}`, type: 'HOUSE',
        street: `${label} ${suffix} St`, suburb: 'Kogarah', postcode: '2217', state: 'NSW', country: 'AU',
        geocoding_status: 'PENDING',
      },
    });
    return property.id;
  };

  const makeAppointment = async (propertyId: string, branchId: string, status: string) => {
    await prisma.appointment.create({
      data: {
        tenant_id: tenant.id, branch_id: branchId, property_id: propertyId,
        service_type_id: serviceType.id, status: status as never,
        scheduled_date: new Date('2027-03-10'), time_slot_start: '09:00', time_slot_end: '10:00',
        price_amount: '100.00', payout_amount: '80.00', pricing_rule_snapshot_json: {},
        rental_tenant_confirmation_status: 'PENDING', created_by_user_id: user.id,
      },
    });
  };

  const singleBranchProperty = await makeProperty('single', null);
  const multiBranchProperty = await makeProperty('multi', null);
  const orphanProperty = await makeProperty('orphan', null);
  const alreadyBranchedProperty = await makeProperty('branched', branchB.id);

  // Two appointments on the SAME branch — one of them cancelled, to prove a
  // cancelled appointment still counts as evidence and does not split the set.
  await makeAppointment(singleBranchProperty, branchA.id, 'DRAFT');
  await makeAppointment(singleBranchProperty, branchA.id, 'CANCELLED');
  // Genuinely ambiguous: operated under both branches.
  await makeAppointment(multiBranchProperty, branchA.id, 'DRAFT');
  await makeAppointment(multiBranchProperty, branchB.id, 'DRAFT');
  // `orphanProperty` intentionally gets none.
  await makeAppointment(alreadyBranchedProperty, branchB.id, 'DRAFT');

  return {
    tenantId: tenant.id, branchA: branchA.id, branchB: branchB.id,
    singleBranchProperty, multiBranchProperty, orphanProperty, alreadyBranchedProperty,
  };
}

const branchOf = async (id: string) =>
  (await harness.prisma.property.findUnique({ where: { id }, select: { branch_id: true } }))!.branch_id;

beforeAll(async () => {
  harness = await setupDbHarness();
}, 180_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

describe('backfill-property-branch (real DB)', () => {
  it('reports what it would change without writing anything on a dry run', async () => {
    const s = await seedScenario();

    const summary = await backfillPropertyBranch(harness.prisma, { apply: false, tenantId: s.tenantId });

    expect(summary.dryRun).toBe(true);
    expect(summary.scanned).toBe(3); // the already-branched property is not selected
    expect(summary.inferable).toBe(1);
    expect(summary.applied).toBe(0);
    expect(await branchOf(s.singleBranchProperty)).toBeNull();
  });

  it('assigns the single branch its appointments agree on, and never guesses the rest', async () => {
    const s = await seedScenario();

    const summary = await backfillPropertyBranch(harness.prisma, { apply: true, tenantId: s.tenantId });

    expect(summary.applied).toBe(1);
    expect(await branchOf(s.singleBranchProperty)).toBe(s.branchA);

    // Ambiguous and evidence-less rows are left alone and reported by code.
    expect(await branchOf(s.multiBranchProperty)).toBeNull();
    expect(await branchOf(s.orphanProperty)).toBeNull();
    expect(summary.skipped.map((skip) => skip.reason).sort()).toEqual(['multiple_branches', 'no_appointments']);
    // Each skip names the property a human has to look at, with the count that
    // explains why it was skipped.
    const skipById = new Map(summary.skipped.map((skip) => [skip.propertyId, skip]));
    expect(skipById.get(s.multiBranchProperty)).toMatchObject({ reason: 'multiple_branches', branchCount: 2 });
    expect(skipById.get(s.orphanProperty)).toMatchObject({ reason: 'no_appointments', branchCount: 0 });
    expect(skipById.get(s.multiBranchProperty)!.propertyCode).toContain('IMP-multi');

    // A property that already had a branch is never touched.
    expect(await branchOf(s.alreadyBranchedProperty)).toBe(s.branchB);
  });

  it('leaves another agency branch-less properties alone when scoped to one tenant', async () => {
    const mine = await seedScenario();
    const theirs = await seedScenario();

    const summary = await backfillPropertyBranch(harness.prisma, { apply: true, tenantId: mine.tenantId });

    // Only this tenant's rows were even looked at…
    expect(summary.scanned).toBe(3);
    expect(summary.applied).toBe(1);
    expect(summary.skipped.map((s) => s.propertyId).sort())
      .toEqual([mine.multiBranchProperty, mine.orphanProperty].sort());
    // …and the other agency's repairable property is untouched.
    expect(await branchOf(theirs.singleBranchProperty)).toBeNull();
  });

  it('is safe to re-run — a second pass finds nothing left to repair', async () => {
    const s = await seedScenario();

    await backfillPropertyBranch(harness.prisma, { apply: true, tenantId: s.tenantId });
    const second = await backfillPropertyBranch(harness.prisma, { apply: true, tenantId: s.tenantId });

    expect(second.inferable).toBe(0);
    expect(second.applied).toBe(0);
    expect(second.scanned).toBe(2); // only the two unrepairable rows remain
  });
});
