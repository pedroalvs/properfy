/**
 * Real-database test for the marketplace-acceptance notification gap
 * (escopo-pendencias item 01).
 *
 * `AcceptOfferUseCase` schedules appointments via a bulk `updateMany` that
 * bypasses `ExecuteStatusTransitionUseCase`, so `NotifyOnStatusTransitionHandler`
 * never ran for this path: no INSPECTION_NOTICE notification, no portal token.
 * `NotifyOnGroupAcceptedSubscriber` closes the gap by bridging
 * SERVICE_GROUP_EVENTS.ACCEPTED / MANUALLY_ASSIGNED to the handler.
 *
 * This test wires the REAL production graph (real Prisma repositories, real
 * event bus, real handler + token mint) with only outbound edges mocked
 * (job queue, audit, idempotency).
 *
 * Requires Docker (testcontainers). Run via: `pnpm --filter backend test:integration:db`
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { seedTenant } from '../service-region/helpers/service-region-fixtures';
import {
  DomainEventBus,
  SERVICE_GROUP_EVENTS,
} from '../../../src/shared/application/events/domain-event-bus';
import { PrismaServiceGroupRepository } from '../../../src/modules/service-group/infrastructure/prisma-service-group.repository';
import { PrismaInspectorRepository } from '../../../src/modules/inspector/infrastructure/prisma-inspector.repository';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';
import { PrismaPropertyRepository } from '../../../src/modules/property/infrastructure/prisma-property.repository';
import { PrismaTenantRepository } from '../../../src/modules/tenant/infrastructure/prisma-tenant.repository';
import { PrismaNotificationRepository } from '../../../src/modules/notification/infrastructure/prisma-notification.repository';
import { PrismaNotificationTemplateRepository } from '../../../src/modules/notification/infrastructure/prisma-notification-template.repository';
import { PrismaRentalTenantPortalTokenRepository } from '../../../src/modules/rental-tenant-portal/infrastructure/prisma-rental-tenant-portal-token.repository';
import { TokenService } from '../../../src/modules/rental-tenant-portal/domain/token.service';
import { MintPortalTokenService } from '../../../src/modules/rental-tenant-portal/domain/mint-portal-token.service';
import { BuildNotificationPayloadService } from '../../../src/modules/notification/domain/build-notification-payload.service';
import { AppointmentCodeFormatter } from '../../../src/modules/appointment/domain/appointment-code.formatter';
import { CreateNotificationUseCase } from '../../../src/modules/notification/application/use-cases/create-notification.use-case';
import { NotifyOnStatusTransitionHandler } from '../../../src/modules/notification/application/handlers/notify-on-status-transition.handler';
import { NotifyOnGroupAcceptedSubscriber } from '../../../src/modules/notification/application/subscribers/notify-on-group-accepted.subscriber';
import { AcceptOfferUseCase } from '../../../src/modules/service-group/application/use-cases/accept-offer.use-case';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { IIdempotencyService } from '../../../src/shared/domain/idempotency.service';
import type { IJobQueue } from '../../../src/shared/domain/job-queue';
import type { AuthContext } from '@properfy/shared';

let harness: DbHarness;

beforeAll(async () => {
  harness = await setupDbHarness();
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await harness.prisma.$executeRawUnsafe(
    `TRUNCATE TABLE notifications, rental_tenant_portal_tokens, appointment_contacts, appointments, service_groups, inspectors, properties, service_types, users, branches, tenants CASCADE`,
  );
});

const SCHEDULED_DATE = new Date('2026-08-01T00:00:00.000Z');

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function getBranchId(prisma: PrismaClient, tenantId: string): Promise<string> {
  const branch = await prisma.branch.findFirst({ where: { tenant_id: tenantId } });
  if (!branch) throw new Error('Branch not found for tenant');
  return branch.id;
}

async function seedServiceType(prisma: PrismaClient): Promise<string> {
  const suffix = rand();
  const st = await prisma.serviceType.create({
    data: {
      code: `ST-${suffix}`, name: `Routine ${suffix}`, flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: true, status: 'ACTIVE',
    },
  });
  return st.id;
}

async function seedInspector(prisma: PrismaClient, serviceTypeId: string): Promise<string> {
  const inspector = await prisma.inspector.create({
    data: {
      name: 'Insp One',
      email: `insp-${rand()}@test.local`,
      status: 'ACTIVE',
      service_types_json: [{ serviceTypeId, certified: true }],
      blocked_clients_json: [],
    },
  });
  return inspector.id;
}

async function seedProperty(prisma: PrismaClient, tenantId: string, branchId: string): Promise<string> {
  const p = await prisma.property.create({
    data: {
      tenant_id: tenantId, branch_id: branchId, property_code: `P-${rand()}`, type: 'HOUSE',
      street: '1 Test St', suburb: 'Sydney', postcode: '2000', state: 'NSW', country: 'AU',
      geocoding_status: 'SUCCESS',
    },
  });
  return p.id;
}

async function seedGroup(prisma: PrismaClient, serviceTypeId: string, createdByUserId: string): Promise<string> {
  const g = await prisma.serviceGroup.create({
    data: {
      service_type_id: serviceTypeId, status: 'PUBLISHED', group_size: 5,
      scheduled_date: SCHEDULED_DATE, time_window: '08:00-12:00',
      published_at: new Date(), created_by_user_id: createdByUserId,
    },
  });
  return g.id;
}

async function seedAppointment(
  prisma: PrismaClient,
  params: {
    tenantId: string; branchId: string; propertyId: string; serviceTypeId: string;
    createdByUserId: string; groupId: string; contactEmail?: string | null;
  },
): Promise<string> {
  const appt = await prisma.appointment.create({
    data: {
      tenant_id: params.tenantId, branch_id: params.branchId, property_id: params.propertyId,
      service_type_id: params.serviceTypeId, status: 'AWAITING_INSPECTOR',
      scheduled_date: SCHEDULED_DATE, time_slot_start: '09:00', time_slot_end: '12:00',
      price_amount: '100.00', payout_amount: '80.00', pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'PENDING',
      created_by_user_id: params.createdByUserId, service_group_id: params.groupId,
    },
  });
  await prisma.appointmentContact.create({
    data: {
      appointment_id: appt.id, role: 'RENTAL_TENANT', is_primary: true,
      snapshot_name: 'Renter Test',
      snapshot_email: params.contactEmail === undefined ? `renter-${rand()}@test.local` : params.contactEmail,
      snapshot_phone: '+61400000001',
    },
  });
  return appt.id;
}

interface Wiring {
  bus: DomainEventBus;
  acceptOffer: AcceptOfferUseCase;
}

function wire(prisma: PrismaClient): Wiring {
  const serviceGroupRepo = new PrismaServiceGroupRepository(prisma);
  const inspectorRepo = new PrismaInspectorRepository(prisma);
  const appointmentRepo = new PrismaAppointmentRepository(prisma);
  const propertyRepo = new PrismaPropertyRepository(prisma);
  const tenantRepo = new PrismaTenantRepository(prisma);
  const notificationRepo = new PrismaNotificationRepository(prisma);
  const notificationTemplateRepo = new PrismaNotificationTemplateRepository(prisma);
  const tokenRepo = new PrismaRentalTenantPortalTokenRepository(prisma);

  const auditService = { log: vi.fn() } as unknown as AuditService;
  const store = new Map<string, unknown>();
  const idempotencyService = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, _scope: string, value: unknown) => {
      store.set(key, value);
    }),
  } as unknown as IIdempotencyService;
  const jobQueue = { enqueue: vi.fn().mockResolvedValue(undefined) } as unknown as IJobQueue;

  const createNotification = new CreateNotificationUseCase(
    notificationRepo, notificationTemplateRepo, jobQueue,
  );
  const mintPortalTokenService = new MintPortalTokenService(tokenRepo, new TokenService());
  const notifyHandler = new NotifyOnStatusTransitionHandler(
    appointmentRepo, propertyRepo, tenantRepo, notificationRepo,
    mintPortalTokenService, new BuildNotificationPayloadService(), new AppointmentCodeFormatter(),
    createNotification, 'http://portal.test',
  );

  const bus = new DomainEventBus();
  new NotifyOnGroupAcceptedSubscriber(serviceGroupRepo, notifyHandler).register(bus);

  const acceptOffer = new AcceptOfferUseCase(
    serviceGroupRepo, inspectorRepo, auditService, idempotencyService,
    new AuthorizationService(auditService), bus,
  );

  return { bus, acceptOffer };
}

function inspActor(inspectorId: string): AuthContext {
  return { userId: 'insp-user-1', tenantId: null, role: 'INSP', branchId: null, inspectorId };
}

describe('accept offer → rental tenant notification — real DB', () => {
  it('sends INSPECTION_NOTICE and mints a portal token for every appointment in the accepted group', async () => {
    const { tenantId: tenantA, userId: userA } = await seedTenant(harness.prisma, 'Agency A');
    const { tenantId: tenantB, userId: userB } = await seedTenant(harness.prisma, 'Agency B');
    const branchA = await getBranchId(harness.prisma, tenantA);
    const branchB = await getBranchId(harness.prisma, tenantB);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const inspectorId = await seedInspector(harness.prisma, serviceTypeId);
    const groupId = await seedGroup(harness.prisma, serviceTypeId, userA);

    // Cross-agency group (primaryTenantId = null) — the per-appointment tenantId path.
    const apptA = await seedAppointment(harness.prisma, {
      tenantId: tenantA, branchId: branchA,
      propertyId: await seedProperty(harness.prisma, tenantA, branchA),
      serviceTypeId, createdByUserId: userA, groupId,
    });
    const apptB = await seedAppointment(harness.prisma, {
      tenantId: tenantB, branchId: branchB,
      propertyId: await seedProperty(harness.prisma, tenantB, branchB),
      serviceTypeId, createdByUserId: userB, groupId,
    });

    const { bus, acceptOffer } = wire(harness.prisma);

    const output = await acceptOffer.execute({
      groupId, inspectorId, actor: inspActor(inspectorId),
    });
    expect(output.appointmentsScheduled).toBe(2);

    // The use case fires the event without awaiting subscribers — poll for settlement.
    await vi.waitFor(async () => {
      const notifications = await harness.prisma.notification.findMany({
        where: { template_code: 'INSPECTION_NOTICE' },
      });
      expect(notifications).toHaveLength(2);
    });

    const appointments = await harness.prisma.appointment.findMany({
      where: { service_group_id: groupId },
    });
    expect(appointments.every((a) => a.status === 'SCHEDULED')).toBe(true);
    expect(appointments.every((a) => a.inspector_id === inspectorId)).toBe(true);

    const notifications = await harness.prisma.notification.findMany({
      where: { template_code: 'INSPECTION_NOTICE' },
    });
    const byAppt = new Map(notifications.map((n) => [n.appointment_id, n]));
    expect(new Set(byAppt.keys())).toEqual(new Set([apptA, apptB]));
    // Each notification is scoped to its own appointment's agency.
    expect(byAppt.get(apptA)!.tenant_id).toBe(tenantA);
    expect(byAppt.get(apptB)!.tenant_id).toBe(tenantB);
    expect(byAppt.get(apptA)!.channel).toBe('EMAIL');
    // Payload carries a portal confirmation link built from the minted token.
    const payloadA = byAppt.get(apptA)!.payload_json as Record<string, string>;
    expect(payloadA.confirmationLink ?? '').toContain('http://portal.test');

    const tokens = await harness.prisma.rentalTenantPortalToken.findMany({
      where: { status: 'ACTIVE' },
    });
    expect(new Set(tokens.map((t) => t.appointment_id))).toEqual(new Set([apptA, apptB]));

    // Idempotency: re-emitting the event (retry/duplicate) creates no duplicates.
    await bus.emit({
      type: SERVICE_GROUP_EVENTS.ACCEPTED,
      payload: { groupId, tenantId: null, inspectorId },
      occurredAt: new Date(),
    });
    const after = await harness.prisma.notification.count({
      where: { template_code: 'INSPECTION_NOTICE' },
    });
    expect(after).toBe(2);
  });

  it('falls back to SMS when the appointment contact has no email', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency SMS');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const inspectorId = await seedInspector(harness.prisma, serviceTypeId);
    const groupId = await seedGroup(harness.prisma, serviceTypeId, userId);

    const apptId = await seedAppointment(harness.prisma, {
      tenantId, branchId,
      propertyId: await seedProperty(harness.prisma, tenantId, branchId),
      serviceTypeId, createdByUserId: userId, groupId, contactEmail: null,
    });

    const { acceptOffer } = wire(harness.prisma);
    await acceptOffer.execute({ groupId, inspectorId, actor: inspActor(inspectorId) });

    await vi.waitFor(async () => {
      const sms = await harness.prisma.notification.findMany({
        where: { template_code: 'INSPECTION_NOTICE_SMS' },
      });
      expect(sms).toHaveLength(1);
      expect(sms[0]!.appointment_id).toBe(apptId);
      expect(sms[0]!.channel).toBe('SMS');
    });
  });
});
