/**
 * Real-DB coverage for the F06-2 notice log (FR-018). Proves the EARLY_CHANGE
 * morning-band read (latest-per-appointment, since-bounded; L-F06-05) and the
 * cross-tenant daily-volume SMS count (L-F06-11).
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaTenantEtaNoticeLog } from '../../../src/modules/tenant-eta/infrastructure/prisma-tenant-eta-notice-log';

let harness: DbHarness;
let log: PrismaTenantEtaNoticeLog;

// Sydney AEDT (UTC+11) midnight of 2026-11-05 = 2026-11-04T13:00:00Z.
const MIDNIGHT = new Date('2026-11-04T13:00:00.000Z');
const TODAY = new Date('2026-11-04T21:00:00.000Z'); // ~08:00 Sydney 05/11
const TODAY_LATER = new Date('2026-11-04T21:30:00.000Z');
const YESTERDAY = new Date('2026-11-04T12:00:00.000Z'); // before Sydney midnight

const ctx = { tenant1: '', tenant2: '', apptA: '', apptB: '', apptC: '' };

async function seedTenant(name: string): Promise<string> {
  const t = await harness.prisma.tenant.create({
    data: { name, legal_name: `${name} LLC`, status: 'ACTIVE', timezone: 'Australia/Sydney' },
  });
  return t.id;
}

async function seedAppointment(tenantId: string): Promise<string> {
  const branch = await harness.prisma.branch.create({ data: { tenant_id: tenantId, name: `B-${randomUUID().slice(0, 8)}`, status: 'ACTIVE' } });
  const st = await harness.prisma.serviceType.create({
    data: { code: `ST-${randomUUID().slice(0, 6)}`, name: `Routine-${randomUUID().slice(0, 6)}`, flow_type: 'ROUTINE', requires_rental_tenant_confirmation: true, status: 'ACTIVE' },
  });
  const prop = await harness.prisma.property.create({
    data: { tenant_id: tenantId, branch_id: branch.id, property_code: `P-${randomUUID().slice(0, 6)}`, type: 'HOUSE', street: `${randomUUID().slice(0, 8)} A St`, suburb: 'Surry Hills', postcode: '2010', state: 'NSW', country: 'AU', geocoding_status: 'SUCCESS' },
  });
  const user = await harness.prisma.user.create({
    data: { tenant_id: tenantId, branch_id: branch.id, role: 'CL_ADMIN', name: 'U', email: `u-${randomUUID().slice(0, 8)}@test.local`, password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake', status: 'ACTIVE' },
  });
  const appt = await harness.prisma.appointment.create({
    data: {
      tenant_id: tenantId, branch_id: branch.id, property_id: prop.id, service_type_id: st.id,
      status: 'SCHEDULED', scheduled_date: new Date('2026-11-05'), time_slot_start: '08:00', time_slot_end: '17:00',
      price_amount: '100.00', payout_amount: '80.00', pricing_rule_snapshot_json: {}, created_by_user_id: user.id,
    },
  });
  return appt.id;
}

async function seedNotification(opts: {
  tenantId: string | null;
  appointmentId?: string | null;
  channel: 'EMAIL' | 'SMS';
  templateCode: string;
  createdAt: Date;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await harness.prisma.notification.create({
    data: {
      tenant_id: opts.tenantId,
      appointment_id: opts.appointmentId ?? null,
      recipient: 'r@test.local',
      channel: opts.channel,
      template_code: opts.templateCode,
      status: 'SENT',
      payload_json: opts.payload ?? {},
      created_at: opts.createdAt,
    },
  });
}

beforeAll(async () => {
  harness = await setupDbHarness();
  log = new PrismaTenantEtaNoticeLog(harness.prisma);

  ctx.tenant1 = await seedTenant('T1');
  ctx.tenant2 = await seedTenant('T2');
  ctx.apptA = await seedAppointment(ctx.tenant1);
  ctx.apptB = await seedAppointment(ctx.tenant1);
  ctx.apptC = await seedAppointment(ctx.tenant1);
}, 120_000);

afterAll(async () => { await teardownDbHarness(harness); });

describe('PrismaTenantEtaNoticeLog (real DB)', () => {
  it('findMorningBands returns the latest in-window morning band per appointment (L-F06-05)', async () => {
    // apptA: an earlier and a later morning today → the later band wins; a yesterday row is ignored.
    await seedNotification({ tenantId: ctx.tenant1, appointmentId: ctx.apptA, channel: 'EMAIL', templateCode: 'TENANT_ETA_MORNING', createdAt: TODAY, payload: { etaBandFromAt: '2026-11-04T22:00:00.000Z' } });
    await seedNotification({ tenantId: ctx.tenant1, appointmentId: ctx.apptA, channel: 'SMS', templateCode: 'TENANT_ETA_MORNING', createdAt: TODAY_LATER, payload: { etaBandFromAt: '2026-11-04T22:15:00.000Z' } });
    await seedNotification({ tenantId: ctx.tenant1, appointmentId: ctx.apptA, channel: 'EMAIL', templateCode: 'TENANT_ETA_MORNING', createdAt: YESTERDAY, payload: { etaBandFromAt: '2026-11-03T22:00:00.000Z' } });
    // apptB: one morning today.
    await seedNotification({ tenantId: ctx.tenant1, appointmentId: ctx.apptB, channel: 'SMS', templateCode: 'TENANT_ETA_MORNING', createdAt: TODAY, payload: { etaBandFromAt: '2026-11-04T23:00:00.000Z' } });
    // apptB also has a DELAY today → must not be read as a morning band.
    await seedNotification({ tenantId: ctx.tenant1, appointmentId: ctx.apptB, channel: 'SMS', templateCode: 'TENANT_ETA_DELAY', createdAt: TODAY_LATER, payload: { etaBandFromAt: '2026-11-04T23:30:00.000Z' } });
    // apptC: only a yesterday morning → omitted.
    await seedNotification({ tenantId: ctx.tenant1, appointmentId: ctx.apptC, channel: 'EMAIL', templateCode: 'TENANT_ETA_MORNING', createdAt: YESTERDAY, payload: { etaBandFromAt: '2026-11-03T22:00:00.000Z' } });

    const since = new Map<string, Date>([
      [ctx.apptA, MIDNIGHT],
      [ctx.apptB, MIDNIGHT],
      [ctx.apptC, MIDNIGHT],
    ]);
    const bands = await log.findMorningBands([ctx.apptA, ctx.apptB, ctx.apptC], since);

    expect(bands.get(ctx.apptA)?.toISOString()).toBe('2026-11-04T22:15:00.000Z');
    expect(bands.get(ctx.apptB)?.toISOString()).toBe('2026-11-04T23:00:00.000Z');
    expect(bands.has(ctx.apptC)).toBe(false);
  });

  it('findMorningBands returns an empty map for no ids', async () => {
    const bands = await log.findMorningBands([], new Map());
    expect(bands.size).toBe(0);
  });

  it('countSmsCreatedSince counts only TENANT_ETA_* SMS created at/after since, across tenants (L-F06-11)', async () => {
    // countSmsCreatedSince is cross-tenant by design, so assert the DELTA from
    // whatever earlier tests seeded rather than an absolute count.
    const tA = await seedTenant('CountA');
    const tB = await seedTenant('CountB');
    const sinceCount = new Date('2026-11-04T20:00:00.000Z');
    const before = await log.countSmsCreatedSince(sinceCount);
    // Counted (+3): eta SMS today across both tenants.
    await seedNotification({ tenantId: tA, channel: 'SMS', templateCode: 'TENANT_ETA_MORNING', createdAt: TODAY });
    await seedNotification({ tenantId: tA, channel: 'SMS', templateCode: 'TENANT_ETA_DELAY', createdAt: TODAY });
    await seedNotification({ tenantId: tB, channel: 'SMS', templateCode: 'TENANT_ETA_ON_THE_WAY', createdAt: TODAY_LATER });
    // Not counted: EMAIL eta, non-eta SMS, eta SMS before `since`.
    await seedNotification({ tenantId: tA, channel: 'EMAIL', templateCode: 'TENANT_ETA_MORNING', createdAt: TODAY });
    await seedNotification({ tenantId: tA, channel: 'SMS', templateCode: 'TENANT_PORTAL_LINK', createdAt: TODAY });
    await seedNotification({ tenantId: tB, channel: 'SMS', templateCode: 'TENANT_ETA_MORNING', createdAt: YESTERDAY });

    const after = await log.countSmsCreatedSince(sinceCount);
    expect(after - before).toBe(3);
  });
});
