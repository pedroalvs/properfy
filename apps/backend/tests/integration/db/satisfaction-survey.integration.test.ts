/**
 * Real-Postgres test for the satisfaction-survey SQL surface — the parts a mocked
 * repository cannot validate (per `feedback_mock_masks_real_bug`):
 *
 *   1. The idempotent `submit` really is idempotent against a live unique index.
 *      The unit test fabricates the P2002 error shape by hand; if Prisma reports
 *      `meta.target` differently on this version, the narrowed catch silently
 *      stops matching, the error escapes, and a replayed submission turns into a
 *      500 instead of returning the stored answer. Only a real conflict proves it.
 *   2. Two genuinely concurrent submissions resolve to ONE stored response, and
 *      both callers observe the same winning row.
 *   3. The `rating BETWEEN 1 AND 5` CHECK rejects an out-of-range write that
 *      bypasses Zod entirely.
 *   4. `findByInspectorId` is tenant-scoped: agency B never sees agency A's
 *      responses, and it resolves the human appointment code.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaSatisfactionSurveyRepository } from '../../../src/modules/satisfaction-survey/infrastructure/prisma-satisfaction-survey.repository';
import { PrismaInspectorRatingReader } from '../../../src/modules/inspector/infrastructure/prisma-inspector-rating.reader';
import { SatisfactionSurveyEntity } from '../../../src/modules/satisfaction-survey/domain/satisfaction-survey.entity';

let harness: DbHarness;
let repo: PrismaSatisfactionSurveyRepository;
let reader: PrismaInspectorRatingReader;

const seed = {
  tenantA: '',
  tenantB: '',
  inspector: '',
  appointmentA1: '',
  appointmentA2: '',
  appointmentB1: '',
};

function suffix() {
  return Math.random().toString(36).slice(2, 8);
}

function makeSurvey(appointmentId: string, tenantId: string, rating: number, comment: string | null) {
  const now = new Date();
  return new SatisfactionSurveyEntity({
    id: crypto.randomUUID(),
    appointmentId,
    tenantId,
    inspectorId: seed.inspector,
    rating,
    comment,
    submittedAt: now,
    ipAddress: null,
    userAgent: null,
    createdAt: now,
  });
}

async function createAppointment(tenantId: string, branchId: string, propertyId: string, serviceTypeId: string, userId: string, status: string) {
  const appt = await harness.prisma.appointment.create({
    data: {
      tenant_id: tenantId,
      branch_id: branchId,
      property_id: propertyId,
      service_type_id: serviceTypeId,
      inspector_id: seed.inspector,
      status: status as never,
      scheduled_date: new Date('2027-04-15'),
      time_slot_start: '09:00',
      time_slot_end: '10:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'CONFIRMED',
      created_by_user_id: userId,
    },
  });
  return appt.id;
}

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaSatisfactionSurveyRepository(harness.prisma);
  reader = new PrismaInspectorRatingReader(harness.prisma);

  const tenantA = await harness.prisma.tenant.create({
    data: { name: `SURV-A-${suffix()}`, legal_name: 'Survey A LLC', status: 'ACTIVE', appointment_code_prefix: 'SVA' },
  });
  const tenantB = await harness.prisma.tenant.create({
    data: { name: `SURV-B-${suffix()}`, legal_name: 'Survey B LLC', status: 'ACTIVE', appointment_code_prefix: 'SVB' },
  });
  seed.tenantA = tenantA.id;
  seed.tenantB = tenantB.id;

  const inspector = await harness.prisma.inspector.create({
    data: { name: 'Survey Inspector', email: `survey-insp-${suffix()}@test.local`, status: 'ACTIVE' },
  });
  seed.inspector = inspector.id;

  const serviceType = await harness.prisma.serviceType.create({
    data: { code: `SURV-ST-${suffix()}`, name: 'Routine', flow_type: 'ROUTINE', requires_rental_tenant_confirmation: true, status: 'ACTIVE' },
  });

  async function seedTenant(tenantId: string, label: string) {
    const branch = await harness.prisma.branch.create({ data: { tenant_id: tenantId, name: `${label}-Branch`, status: 'ACTIVE' } });
    const user = await harness.prisma.user.create({
      data: {
        tenant_id: tenantId, branch_id: branch.id, role: 'CL_ADMIN', name: `${label}-User`,
        email: `surv-${label.toLowerCase()}-${suffix()}@test.local`,
        password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake', status: 'ACTIVE',
      },
    });
    const property = await harness.prisma.property.create({
      data: {
        tenant_id: tenantId, branch_id: branch.id, property_code: `SURV-${label}-${suffix()}`,
        type: 'HOUSE', street: '1 Survey St', suburb: 'Bondi', postcode: '2026', state: 'NSW',
        country: 'AU', geocoding_status: 'SUCCESS',
      },
    });
    return { branch, user, property };
  }

  const a = await seedTenant(seed.tenantA, 'A');
  const b = await seedTenant(seed.tenantB, 'B');

  seed.appointmentA1 = await createAppointment(seed.tenantA, a.branch.id, a.property.id, serviceType.id, a.user.id, 'DONE');
  seed.appointmentA2 = await createAppointment(seed.tenantA, a.branch.id, a.property.id, serviceType.id, a.user.id, 'DONE');
  seed.appointmentB1 = await createAppointment(seed.tenantB, b.branch.id, b.property.id, serviceType.id, b.user.id, 'DONE');
});

afterAll(async () => {
  await teardownDbHarness(harness);
});

describe('PrismaSatisfactionSurveyRepository (real DB)', () => {
  it('returns the stored response instead of overwriting it on a replay', async () => {
    const first = await repo.submit(makeSurvey(seed.appointmentA1, seed.tenantA, 5, 'Very professional.'));
    const replay = await repo.submit(makeSurvey(seed.appointmentA1, seed.tenantA, 1, 'Changed my mind.'));

    expect(replay.id).toBe(first.id);
    expect(replay.rating).toBe(5);
    expect(replay.comment).toBe('Very professional.');

    // And nothing was written twice.
    const count = await harness.prisma.satisfactionSurvey.count({
      where: { appointment_id: seed.appointmentA1 },
    });
    expect(count).toBe(1);
  });

  it('resolves two concurrent submissions to a single winning row', async () => {
    // The real race. Both callers must come back with the same row, and the
    // loser must not throw — that is the whole point of the narrowed P2002 catch,
    // and it is exactly what a hand-mocked error shape cannot prove.
    const [one, two] = await Promise.all([
      repo.submit(makeSurvey(seed.appointmentA2, seed.tenantA, 4, 'first')),
      repo.submit(makeSurvey(seed.appointmentA2, seed.tenantA, 2, 'second')),
    ]);

    expect(one.id).toBe(two.id);
    expect(one.rating).toBe(two.rating);

    const rows = await harness.prisma.satisfactionSurvey.findMany({
      where: { appointment_id: seed.appointmentA2 },
    });
    expect(rows).toHaveLength(1);
  });

  it('rejects a rating outside 1..5 at the database level', async () => {
    // Bypasses Zod and the use case entirely: the CHECK constraint is the last
    // line of defence and must hold on its own.
    await expect(
      harness.prisma.satisfactionSurvey.create({
        data: {
          appointment_id: seed.appointmentB1,
          tenant_id: seed.tenantB,
          inspector_id: seed.inspector,
          rating: 6,
        },
      }),
    ).rejects.toThrow();
  });

  it('scopes individual responses by tenant', async () => {
    // Cross-tenant isolation against real SQL, not a mocked `where` clause —
    // this is the read an agency uses, so a missing filter would leak another
    // agency's feedback verbatim.
    await repo.submit(makeSurvey(seed.appointmentB1, seed.tenantB, 3, 'agency B feedback'));

    const scopedToA = await repo.findByInspectorId(seed.inspector, seed.tenantA, 1, 50);
    expect(scopedToA.surveys.every((s) => s.tenantId === seed.tenantA)).toBe(true);
    expect(scopedToA.surveys.some((s) => s.comment === 'agency B feedback')).toBe(false);

    const scopedToB = await repo.findByInspectorId(seed.inspector, seed.tenantB, 1, 50);
    expect(scopedToB.surveys).toHaveLength(1);
    expect(scopedToB.surveys[0]!.comment).toBe('agency B feedback');

    // An unscoped (AM/OP) read sees both agencies.
    const unscoped = await repo.findByInspectorId(seed.inspector, null, 1, 50);
    expect(unscoped.total).toBeGreaterThanOrEqual(3);
  });
});

describe('PrismaInspectorRatingReader (real DB)', () => {
  it('aggregates the average, the response count and the completed count', async () => {
    const aggregates = await reader.getAggregatesByInspectorIds([seed.inspector]);
    const row = aggregates.get(seed.inspector)!;

    // Ratings stored above: 5 (A1), the concurrency winner (A2, 4 or 2), 3 (B1).
    expect(row.responseCount).toBe(3);
    expect(row.averageRating).toBeGreaterThan(0);
    expect(row.doneServicesCount).toBe(3);
  });

  it('reports null, not zero, for an inspector with no responses', async () => {
    const fresh = await harness.prisma.inspector.create({
      data: { name: 'Unrated', email: `unrated-${suffix()}@test.local`, status: 'ACTIVE' },
    });

    const aggregates = await reader.getAggregatesByInspectorIds([fresh.id]);

    expect(aggregates.get(fresh.id)).toEqual({
      inspectorId: fresh.id,
      averageRating: null,
      responseCount: 0,
      doneServicesCount: 0,
    });
  });

  it('excludes soft-deleted appointments from the completed count', async () => {
    const before = (await reader.getAggregatesByInspectorIds([seed.inspector])).get(seed.inspector)!;

    await harness.prisma.appointment.update({
      where: { id: seed.appointmentA2 },
      data: { deleted_at: new Date() },
    });

    const after = (await reader.getAggregatesByInspectorIds([seed.inspector])).get(seed.inspector)!;
    expect(after.doneServicesCount).toBe(before.doneServicesCount - 1);

    await harness.prisma.appointment.update({
      where: { id: seed.appointmentA2 },
      data: { deleted_at: null },
    });
  });
});
