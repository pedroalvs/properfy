/**
 * Real-DB end-to-end for the F06-2 morning job (acceptance 01.12-B / test 22):
 * the morning use case, over the real plan reader + appointment/tenant/notification
 * repos + notifier + CreateNotificationUseCase, creates the expected TENANT_ETA_*
 * rows with the correct bands; the agency rental-tenant switch and the per-agency
 * tenantEtaNoticesEnabled flag each suppress all of them. (The consent opt-out →
 * SKIPPED_OPT_OUT send path is proven in consent-email-case.integration.test.ts +
 * the send-notification unit tests.)
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaTenantEtaPlanReader } from '../../../src/modules/tenant-eta/infrastructure/prisma-tenant-eta-plan.reader';
import { PrismaInspectorFieldEventRepository } from '../../../src/modules/inspector-execution/infrastructure/prisma-inspector-field-event.repository';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';
import { PrismaTenantRepository } from '../../../src/modules/tenant/infrastructure/prisma-tenant.repository';
import { PrismaNotificationRepository } from '../../../src/modules/notification/infrastructure/prisma-notification.repository';
import { CreateNotificationUseCase } from '../../../src/modules/notification/application/use-cases/create-notification.use-case';
import { BuildNotificationPayloadService } from '../../../src/modules/notification/domain/build-notification-payload.service';
import { AppointmentCodeFormatter } from '../../../src/modules/appointment/domain/appointment-code.formatter';
import { TenantEtaNotifier } from '../../../src/modules/tenant-eta/application/tenant-eta-notifier.service';
import { SendMorningEtaNoticesUseCase } from '../../../src/modules/tenant-eta/application/use-cases/send-morning-eta-notices.use-case';

let harness: DbHarness;
let useCase: SendMorningEtaNoticesUseCase;

const DATE = new Date('2026-11-05');
const NOW = new Date('2026-11-04T20:00:00.000Z'); // 07:00 Sydney
const SETTINGS = { enabled: true, channelMode: 'BOTH', morningHour: 7, morningCutoffHour: 9, delayThresholdMinutes: 20, smsBudgetSharePercent: 80 } as const;

const ctx = { tenantId: '', inspectorId: '', dayPlanId: '', apptA: '', apptB: '', apptC: '' };

const CONTACTS: Record<string, { email: string | null; phone: string | null }> = {
  A: { email: 'ana@example.com', phone: '+61412000001' },
  B: { email: 'ben@example.com', phone: '+61412000002' },
  C: { email: null, phone: '+61412000003' },
};

async function makeApptWithContact(label: 'A' | 'B' | 'C', branchId: string, propertyId: string, serviceTypeId: string, userId: string): Promise<string> {
  const appt = await harness.prisma.appointment.create({
    data: {
      tenant_id: ctx.tenantId, branch_id: branchId, property_id: propertyId, service_type_id: serviceTypeId,
      inspector_id: ctx.inspectorId, status: 'SCHEDULED', scheduled_date: DATE,
      time_slot_start: '08:00', time_slot_end: '17:00', price_amount: '100.00', payout_amount: '80.00',
      pricing_rule_snapshot_json: {}, rental_tenant_confirmation_status: 'CONFIRMED', key_required: false,
      created_by_user_id: userId,
    },
  });
  const c = CONTACTS[label]!;
  await harness.prisma.appointmentContact.create({
    data: { appointment_id: appt.id, role: 'RENTAL_TENANT', is_primary: true, snapshot_name: `${label} Tenant`, snapshot_email: c.email, snapshot_phone: c.phone },
  });
  return appt.id;
}

beforeAll(async () => {
  harness = await setupDbHarness();
  const planReader = new PrismaTenantEtaPlanReader(harness.prisma, new PrismaInspectorFieldEventRepository(harness.prisma));
  const appointmentRepo = new PrismaAppointmentRepository(harness.prisma);
  const tenantRepo = new PrismaTenantRepository(harness.prisma);
  const notificationRepo = new PrismaNotificationRepository(harness.prisma);
  const templateRepo = { findByTenantCodeChannel: async () => null } as never;
  const logger = { info() {}, warn() {}, error() {}, debug() {} } as never;
  const createNotification = new CreateNotificationUseCase(notificationRepo, templateRepo, { enqueue: async () => {} } as never, logger);
  const notifier = new TenantEtaNotifier(createNotification, notificationRepo, new BuildNotificationPayloadService(), new AppointmentCodeFormatter(), 'https://app.properfy.me', { incrementTenantEtaNoticeCount() {} }, logger);
  const getFreshStop = { execute: async () => ({ status: 'FRESH' as const, dayPlanId: ctx.dayPlanId, planVersion: 1, serviceStartAt: null, eta: null, lateS: 0, approximate: false, manual: false, executed: false }) };
  const settingsReader = { get: async () => ({ ...SETTINGS }) } as never;
  useCase = new SendMorningEtaNoticesUseCase(planReader, getFreshStop, appointmentRepo, tenantRepo, notifier, settingsReader, logger, { now: () => NOW });

  const tenant = await harness.prisma.tenant.create({ data: { name: 'Syd', legal_name: 'Syd LLC', status: 'ACTIVE', timezone: 'Australia/Sydney', settings_json: {} } });
  ctx.tenantId = tenant.id;
  const branch = await harness.prisma.branch.create({ data: { tenant_id: tenant.id, name: `B-${randomUUID().slice(0, 8)}`, status: 'ACTIVE' } });
  const user = await harness.prisma.user.create({ data: { tenant_id: tenant.id, branch_id: branch.id, role: 'CL_ADMIN', name: 'U', email: `u-${randomUUID().slice(0, 8)}@test.local`, password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake', status: 'ACTIVE' } });
  const inspector = await harness.prisma.inspector.create({ data: { name: 'Insp', email: `i-${randomUUID().slice(0, 8)}@test.local`, status: 'ACTIVE' } });
  ctx.inspectorId = inspector.id;
  const st = await harness.prisma.serviceType.create({ data: { code: `ST-${randomUUID().slice(0, 6)}`, name: `Routine-${randomUUID().slice(0, 6)}`, flow_type: 'ROUTINE', requires_rental_tenant_confirmation: true, status: 'ACTIVE' } });
  const prop = async () => (await harness.prisma.property.create({ data: { tenant_id: tenant.id, branch_id: branch.id, property_code: `P-${randomUUID().slice(0, 6)}`, type: 'HOUSE', street: `${randomUUID().slice(0, 8)} St`, suburb: 'Surry Hills', postcode: '2010', state: 'NSW', country: 'AU', geocoding_status: 'SUCCESS' } })).id;

  ctx.apptA = await makeApptWithContact('A', branch.id, await prop(), st.id, user.id);
  ctx.apptB = await makeApptWithContact('B', branch.id, await prop(), st.id, user.id);
  ctx.apptC = await makeApptWithContact('C', branch.id, await prop(), st.id, user.id);

  const plan = await harness.prisma.dayPlan.create({
    data: {
      inspector_id: inspector.id, plan_date: DATE, timezone: 'Australia/Sydney', status: 'PUBLISHED', version: 1,
      input_fingerprint: 'fp', suggested_order_json: [], weights_json: { travel: 1, windowWait: 1, baseProximity: 1 },
      optimizer_method: 'FIXED', routing_provider: 'STUB', last_trigger: 'SCHEDULED_PUBLISH', computed_at: new Date(),
      published_at: new Date(), origin_source: 'BASE', departure_at: new Date('2026-11-04T20:40:00.000Z'), approximate: false,
      stops: {
        create: [
          { appointment_id: ctx.apptA, sequence: 1, travel_s: 1200, duration_minutes: 45, window_start_at: new Date('2026-11-04T21:00:00.000Z'), window_end_at: new Date('2026-11-04T23:00:00.000Z'), window_timezone: 'Australia/Sydney', missing_coordinates: false, service_start_at: new Date('2026-11-04T21:00:00.000Z'), published_service_start_at: new Date('2026-11-04T21:00:00.000Z') },
          { appointment_id: ctx.apptB, sequence: 2, travel_s: 900, duration_minutes: 60, window_start_at: new Date('2026-11-04T22:00:00.000Z'), window_end_at: new Date('2026-11-05T01:00:00.000Z'), window_timezone: 'Australia/Sydney', missing_coordinates: false, service_start_at: new Date('2026-11-04T22:00:00.000Z'), published_service_start_at: new Date('2026-11-04T22:00:00.000Z') },
          { appointment_id: ctx.apptC, sequence: 3, travel_s: 1500, duration_minutes: 45, window_start_at: new Date('2026-11-04T23:00:00.000Z'), window_end_at: new Date('2026-11-05T00:00:00.000Z'), window_timezone: 'Australia/Sydney', missing_coordinates: false, service_start_at: new Date('2026-11-04T23:00:00.000Z'), published_service_start_at: new Date('2026-11-04T23:00:00.000Z') },
        ],
      },
    },
  });
  ctx.dayPlanId = plan.id;
}, 120_000);

afterAll(async () => { await teardownDbHarness(harness); });

const group = () => ({ timezone: 'Australia/Sydney', todayCivil: '2026-11-05', tenantIds: [ctx.tenantId] });
const etaRows = async () => harness.prisma.notification.findMany({ where: { tenant_id: ctx.tenantId, template_code: { startsWith: 'TENANT_ETA_' } } });

beforeEach(async () => {
  await harness.prisma.notification.deleteMany({ where: { tenant_id: ctx.tenantId } });
  await harness.prisma.tenant.update({ where: { id: ctx.tenantId }, data: { settings_json: {} } });
});

describe('SendMorningEtaNoticesUseCase (real DB)', () => {
  it('creates the morning notices with the exact bands (A 2, B 2, C 1)', async () => {
    await useCase.execute(group());
    const rows = await etaRows();
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.template_code === 'TENANT_ETA_MORNING')).toBe(true);
    const a = rows.filter((r) => r.appointment_id === ctx.apptA);
    expect(a).toHaveLength(2);
    expect((a[0]!.payload_json as Record<string, string>)['etaFrom']).toBe('8:00 am');
    expect(rows.filter((r) => r.appointment_id === ctx.apptB)).toHaveLength(2);
    const c = rows.filter((r) => r.appointment_id === ctx.apptC);
    expect(c).toHaveLength(1);
    expect(c[0]!.channel).toBe('SMS');
    expect((c[0]!.payload_json as Record<string, string>)['etaFrom']).toBe('10:00 am');
  });

  it('sends nothing when the agency rental-tenant switch is off', async () => {
    await harness.prisma.tenant.update({ where: { id: ctx.tenantId }, data: { settings_json: { rentalTenantNotificationsEnabled: false } } });
    await useCase.execute(group());
    expect(await etaRows()).toHaveLength(0);
  });

  it('sends nothing when tenantEtaNoticesEnabled is off (L-F06-06)', async () => {
    await harness.prisma.tenant.update({ where: { id: ctx.tenantId }, data: { settings_json: { tenantEtaNoticesEnabled: false } } });
    await useCase.execute(group());
    expect(await etaRows()).toHaveLength(0);
  });

  it('is idempotent across a re-run', async () => {
    await useCase.execute(group());
    await useCase.execute(group());
    expect(await etaRows()).toHaveLength(5);
  });
});
