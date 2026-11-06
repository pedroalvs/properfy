/**
 * Real-DB coverage for the locked-time read (F05-1, Algorithm §7) through the use
 * case. The `$queryRaw` (base → regioned → UNION, D21 denominator/numerator) is only
 * exercised here, so this is the gate on the SQL. Region geometry (ST_Intersects) is
 * out of scope for this seed — with no group region and no intersecting region, every
 * appointment lands in the null "No region" bucket, which still exercises the whole
 * statement and the agency + overall aggregation.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaLiveDayReadRepository } from '../../../src/modules/live-day/infrastructure/prisma-live-day.read-repository';
import { GetLockedTimeUseCase } from '../../../src/modules/live-day/application/use-cases/get-locked-time.use-case';

const DATE = new Date('2026-11-05T00:00:00.000Z');
const clock = { now: () => new Date('2026-11-05T02:00:00.000Z') };
const amActor = {
  userId: 'u-am',
  tenantId: null,
  role: 'AM' as const,
  branchId: null,
  inspectorId: null,
  timezone: 'Australia/Sydney',
};

let harness: DbHarness;
let useCase: GetLockedTimeUseCase;

const ctx = { tenantId: '', branchId: '', userId: '', stRoutine: '', stIngoing: '', prop: '' };

async function makeAppointment(opts: {
  serviceTypeId: string;
  status?: 'SCHEDULED' | 'DONE' | 'REJECTED' | 'DRAFT';
  confirmation?: 'PENDING' | 'CONFIRMED' | 'UNAVAILABLE' | 'NO_RESPONSE';
  keyRequired?: boolean;
  rejectionReasonCode?: string | null;
}): Promise<void> {
  await harness.prisma.appointment.create({
    data: {
      tenant_id: ctx.tenantId,
      branch_id: ctx.branchId,
      property_id: ctx.prop,
      service_type_id: opts.serviceTypeId,
      status: opts.status ?? 'SCHEDULED',
      scheduled_date: DATE,
      time_slot_start: '08:00',
      time_slot_end: '17:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: opts.confirmation ?? 'CONFIRMED',
      key_required: opts.keyRequired ?? false,
      rejection_reason_code: opts.rejectionReasonCode ?? null,
      created_by_user_id: ctx.userId,
    },
  });
}

beforeAll(async () => {
  harness = await setupDbHarness();
  useCase = new GetLockedTimeUseCase(new PrismaLiveDayReadRepository(harness.prisma), clock);

  const tenant = await harness.prisma.tenant.create({
    data: { name: 'Ray White', legal_name: `RW-${randomUUID().slice(0, 8)}`, status: 'ACTIVE', timezone: 'Australia/Sydney' },
  });
  ctx.tenantId = tenant.id;
  const branch = await harness.prisma.branch.create({ data: { tenant_id: tenant.id, name: 'B', status: 'ACTIVE' } });
  ctx.branchId = branch.id;
  const user = await harness.prisma.user.create({
    data: { tenant_id: tenant.id, branch_id: branch.id, role: 'CL_ADMIN', name: 'U', email: `u-${randomUUID().slice(0, 8)}@test.local`, password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake', status: 'ACTIVE' },
  });
  ctx.userId = user.id;
  const st = await harness.prisma.serviceType.create({
    data: { code: `ST-${randomUUID().slice(0, 6)}`, name: 'Routine', flow_type: 'ROUTINE', requires_rental_tenant_confirmation: true, default_duration_minutes: 45, status: 'ACTIVE' },
  });
  ctx.stRoutine = st.id;
  const stIn = await harness.prisma.serviceType.create({
    data: { code: `STI-${randomUUID().slice(0, 6)}`, name: 'Ingoing', flow_type: 'INGOING', requires_rental_tenant_confirmation: false, default_duration_minutes: 45, status: 'ACTIVE' },
  });
  ctx.stIngoing = stIn.id;
  const prop = await harness.prisma.property.create({
    data: { tenant_id: tenant.id, branch_id: branch.id, property_code: `P-${randomUUID().slice(0, 6)}`, type: 'HOUSE', street: '1 A St', suburb: 'Surry Hills', postcode: '2010', state: 'NSW', country: 'AU', geocoding_status: 'SUCCESS' },
  });
  ctx.prop = prop.id;

  // In the denominator (E = routine, requires confirmation, no key):
  await makeAppointment({ serviceTypeId: st.id, status: 'SCHEDULED', confirmation: 'CONFIRMED' }); // locked (confirmed)
  await makeAppointment({ serviceTypeId: st.id, status: 'SCHEDULED', confirmation: 'PENDING' }); // not locked
  await makeAppointment({ serviceTypeId: st.id, status: 'REJECTED', confirmation: 'NO_RESPONSE', rejectionReasonCode: 'TENANT_NO_RESPONSE' }); // D21: counted, not locked
  // Out of the denominator:
  await makeAppointment({ serviceTypeId: st.id, status: 'DRAFT' }); // not released
  await makeAppointment({ serviceTypeId: st.id, status: 'REJECTED', rejectionReasonCode: 'INSPECTOR_UNABLE' }); // OP/inspector rejection
  await makeAppointment({ serviceTypeId: st.id, status: 'SCHEDULED', keyRequired: true }); // key access → not E
  await makeAppointment({ serviceTypeId: stIn.id, status: 'SCHEDULED' }); // ingoing → not E
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

describe('Locked time read (real DB, §7 / D21)', () => {
  it('counts the denominator and numerator per D21', async () => {
    const { response } = await useCase.execute({
      actor: amActor,
      query: { from: '2026-11-05', to: '2026-11-05' },
    });
    // Denominator = 3 (confirmed + pending + tenant-no-response); numerator = 1 (confirmed only).
    expect(response.overall).toEqual({ confirmed: 1, required: 3, percent: 33.3 });
  });

  it('breaks down by agency and by region (no region → "No region")', async () => {
    const { response } = await useCase.execute({
      actor: amActor,
      query: { from: '2026-11-05', to: '2026-11-05' },
    });
    expect(response.byAgency).toHaveLength(1);
    expect(response.byAgency[0]).toMatchObject({ tenantId: ctx.tenantId, agencyName: 'Ray White', confirmed: 1, required: 3 });
    // No group region and no intersecting region → the null "No region" bucket.
    expect(response.byRegion).toHaveLength(1);
    expect(response.byRegion[0]).toMatchObject({ regionId: null, regionName: 'No region', confirmed: 1, required: 3 });
  });
});
