/**
 * Real-database tests for PrismaFyRepository — the raw SQL behind the Fy
 * agent's by-contact-phone lookup. Nothing here can be proven with a mocked
 * Prisma client: digits-only matching (`regexp_replace`), the DONE grace
 * window (`make_interval`), DISTINCT-ON dedupe, the soft-deleted-tenant inner
 * join and the jsonb secondary-channel probe all live in the SQL itself.
 *
 * Requires Docker (testcontainers). Run a single file via:
 *   pnpm exec vitest run --config vitest.integration-db.config.ts \
 *     tests/integration/db/fy-repository.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { seedTenant } from '../service-region/helpers/service-region-fixtures';
import { PrismaFyRepository } from '../../../src/modules/fy/infrastructure/prisma-fy.repository';

let harness: DbHarness;
let repo: PrismaFyRepository;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaFyRepository(harness.prisma);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await harness.prisma.$executeRawUnsafe(
    `TRUNCATE TABLE appointment_contacts, contacts, appointments, properties, service_types, users, branches, tenants CASCADE`,
  );
});

const PHONE_VARIANTS = ['61422568109', '0422568109'];
const DEFAULT_PARAMS = {
  phoneDigitVariants: PHONE_VARIANTS,
  statuses: ['AWAITING_INSPECTOR', 'SCHEDULED'],
  doneWithinHours: 48,
};

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

interface SeededBase {
  tenantId: string;
  branchId: string;
  userId: string;
  serviceTypeId: string;
  propertyId: string;
}

async function seedBase(prisma: PrismaClient, name = 'Agency A'): Promise<SeededBase> {
  const { tenantId, userId } = await seedTenant(prisma, `${name} ${rand()}`);
  const branch = await prisma.branch.findFirstOrThrow({ where: { tenant_id: tenantId } });
  const serviceType = await prisma.serviceType.create({
    data: {
      code: `ST-${rand()}`,
      name: `Routine ${rand()}`,
      flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: true,
      status: 'ACTIVE',
    },
  });
  const property = await prisma.property.create({
    data: {
      tenant_id: tenantId,
      branch_id: branch.id,
      property_code: `P-${rand()}`,
      type: 'HOUSE',
      street: '12 George St',
      suburb: 'Sydney',
      postcode: '2000',
      state: 'NSW',
    },
  });
  return { tenantId, branchId: branch.id, userId, serviceTypeId: serviceType.id, propertyId: property.id };
}

async function seedAppointment(
  prisma: PrismaClient,
  base: SeededBase,
  overrides: { status?: string; scheduledDate?: Date; deleted?: boolean; updatedAt?: Date } = {},
): Promise<string> {
  const appt = await prisma.appointment.create({
    data: {
      tenant_id: base.tenantId,
      branch_id: base.branchId,
      property_id: base.propertyId,
      service_type_id: base.serviceTypeId,
      status: (overrides.status ?? 'SCHEDULED') as never,
      scheduled_date: overrides.scheduledDate ?? new Date('2026-09-10T00:00:00Z'),
      time_slot_start: '09:00',
      time_slot_end: '12:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'PENDING',
      created_by_user_id: base.userId,
      ...(overrides.deleted ? { deleted_at: new Date() } : {}),
    },
  });
  if (overrides.updatedAt) {
    // Bypass Prisma's @updatedAt to backdate the DONE grace window.
    await prisma.$executeRaw`UPDATE appointments SET updated_at = ${overrides.updatedAt} WHERE id = ${appt.id}`;
  }
  return appt.id;
}

async function linkContact(
  prisma: PrismaClient,
  appointmentId: string,
  opts: {
    snapshotPhone?: string | null;
    registryPhone?: string | null;
    registryChannels?: Array<{ channel: string; value: string }>;
    isPrimary?: boolean;
    snapshotName?: string;
  } = {},
): Promise<void> {
  let contactId: string | null = null;
  if (opts.registryPhone !== undefined || opts.registryChannels !== undefined) {
    const contact = await prisma.contact.create({
      data: {
        type: 'RENTAL_TENANT',
        display_name: opts.snapshotName ?? 'Alicia Valdivia',
        primary_phone: opts.registryPhone ?? null,
        additional_channels_json: opts.registryChannels ?? [],
      },
    });
    contactId = contact.id;
  }
  await prisma.appointmentContact.create({
    data: {
      appointment_id: appointmentId,
      contact_id: contactId,
      role: 'RENTAL_TENANT',
      is_primary: opts.isPrimary ?? true,
      snapshot_name: opts.snapshotName ?? 'Alicia Valdivia',
      snapshot_phone: opts.snapshotPhone ?? null,
    },
  });
}

describe('PrismaFyRepository.findAppointmentsByContactPhone', () => {
  it('matches E.164-stored and local-stored phones via digits-only comparison', async () => {
    const base = await seedBase(harness.prisma);
    const e164Appt = await seedAppointment(harness.prisma, base);
    await linkContact(harness.prisma, e164Appt, { snapshotPhone: '+61422568109' });
    const localAppt = await seedAppointment(harness.prisma, base, {
      scheduledDate: new Date('2026-09-12T00:00:00Z'),
    });
    await linkContact(harness.prisma, localAppt, { snapshotPhone: '0422 568 109' });

    const match = await repo.findAppointmentsByContactPhone(DEFAULT_PARAMS);
    expect(match).not.toBeNull();
    expect(match!.appointments.map((a) => a.id).sort()).toEqual([e164Appt, localAppt].sort());
  });

  it('matches a phone stored only in the registry additional channels (jsonb)', async () => {
    const base = await seedBase(harness.prisma);
    const appt = await seedAppointment(harness.prisma, base);
    await linkContact(harness.prisma, appt, {
      snapshotPhone: null,
      registryPhone: '+61400000001',
      registryChannels: [{ channel: 'PHONE', value: '+61422568109' }],
    });

    const match = await repo.findAppointmentsByContactPhone(DEFAULT_PARAMS);
    expect(match).not.toBeNull();
    expect(match!.appointments).toHaveLength(1);
    expect(match!.appointments[0]!.id).toBe(appt);
  });

  it('returns each appointment once even when two contact rows match the phone', async () => {
    const base = await seedBase(harness.prisma);
    const appt = await seedAppointment(harness.prisma, base);
    await linkContact(harness.prisma, appt, { snapshotPhone: '+61422568109', isPrimary: true });
    await linkContact(harness.prisma, appt, {
      snapshotPhone: '0422568109',
      isPrimary: false,
      snapshotName: 'Stale Duplicate',
    });

    const match = await repo.findAppointmentsByContactPhone(DEFAULT_PARAMS);
    expect(match).not.toBeNull();
    expect(match!.appointments).toHaveLength(1);
    // The primary contact row wins the contact block, not the duplicate.
    expect(match!.contact.name).toBe('Alicia Valdivia');
  });

  it('orders appointments by scheduled date deterministically', async () => {
    const base = await seedBase(harness.prisma);
    const later = await seedAppointment(harness.prisma, base, {
      scheduledDate: new Date('2026-09-20T00:00:00Z'),
    });
    await linkContact(harness.prisma, later, { snapshotPhone: '0422568109' });
    const earlier = await seedAppointment(harness.prisma, base, {
      scheduledDate: new Date('2026-09-01T00:00:00Z'),
    });
    await linkContact(harness.prisma, earlier, { snapshotPhone: '0422568109' });

    const match = await repo.findAppointmentsByContactPhone(DEFAULT_PARAMS);
    expect(match!.appointments.map((a) => a.id)).toEqual([earlier, later]);
  });

  it('includes DONE within the grace window and excludes DONE beyond it', async () => {
    const base = await seedBase(harness.prisma);
    const recentDone = await seedAppointment(harness.prisma, base, { status: 'DONE' });
    await linkContact(harness.prisma, recentDone, { snapshotPhone: '0422568109' });
    const oldDone = await seedAppointment(harness.prisma, base, {
      status: 'DONE',
      updatedAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
    });
    await linkContact(harness.prisma, oldDone, { snapshotPhone: '0422568109' });

    const match = await repo.findAppointmentsByContactPhone(DEFAULT_PARAMS);
    expect(match!.appointments.map((a) => a.id)).toEqual([recentDone]);
  });

  it('excludes DRAFT under default statuses but returns it under an explicit filter', async () => {
    const base = await seedBase(harness.prisma);
    const draft = await seedAppointment(harness.prisma, base, { status: 'DRAFT' });
    await linkContact(harness.prisma, draft, { snapshotPhone: '0422568109' });

    expect(await repo.findAppointmentsByContactPhone(DEFAULT_PARAMS)).toBeNull();

    const explicit = await repo.findAppointmentsByContactPhone({
      phoneDigitVariants: PHONE_VARIANTS,
      statuses: ['DRAFT'],
      doneWithinHours: 0,
    });
    expect(explicit!.appointments.map((a) => a.id)).toEqual([draft]);
  });

  it('hides appointments of a soft-deleted agency and soft-deleted appointments', async () => {
    const base = await seedBase(harness.prisma);
    const deletedAppt = await seedAppointment(harness.prisma, base, { deleted: true });
    await linkContact(harness.prisma, deletedAppt, { snapshotPhone: '0422568109' });

    const deadAgency = await seedBase(harness.prisma, 'Dead Agency');
    const orphanAppt = await seedAppointment(harness.prisma, deadAgency);
    await linkContact(harness.prisma, orphanAppt, { snapshotPhone: '0422568109' });
    await harness.prisma.tenant.update({
      where: { id: deadAgency.tenantId },
      data: { deleted_at: new Date() },
    });

    expect(await repo.findAppointmentsByContactPhone(DEFAULT_PARAMS)).toBeNull();
  });
});

describe('PrismaFyRepository.findContactPhoneDiagnostics', () => {
  it('reports an unknown phone', async () => {
    const diag = await repo.findContactPhoneDiagnostics(PHONE_VARIANTS);
    expect(diag).toEqual({ phoneKnown: false, otherAppointments: [] });
  });

  it('reports a known contact with no appointments', async () => {
    await harness.prisma.contact.create({
      data: {
        type: 'RENTAL_TENANT',
        display_name: 'Alicia Valdivia',
        primary_phone: '0422568109',
        additional_channels_json: [],
      },
    });
    const diag = await repo.findContactPhoneDiagnostics(PHONE_VARIANTS);
    expect(diag).toEqual({ phoneKnown: true, otherAppointments: [] });
  });

  it('reports per-status counts of appointments hidden from the active view', async () => {
    const base = await seedBase(harness.prisma);
    for (let i = 0; i < 2; i += 1) {
      const draft = await seedAppointment(harness.prisma, base, { status: 'DRAFT' });
      await linkContact(harness.prisma, draft, { snapshotPhone: '0422568109' });
    }
    const cancelled = await seedAppointment(harness.prisma, base, { status: 'CANCELLED' });
    await linkContact(harness.prisma, cancelled, { snapshotPhone: '0422568109' });

    const diag = await repo.findContactPhoneDiagnostics(PHONE_VARIANTS);
    expect(diag.phoneKnown).toBe(true);
    expect(diag.otherAppointments).toEqual([
      { status: 'DRAFT', count: 2 },
      { status: 'CANCELLED', count: 1 },
    ]);
  });
});
