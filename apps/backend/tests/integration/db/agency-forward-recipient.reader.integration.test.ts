/**
 * Real-database test for createAgencyForwardRecipientReader.
 *
 * This reader is the ONLY tenant-scope enforcement on the mirror path: it decides which
 * branch inbox receives a rental-tenant message the agency withheld. A mocked repository
 * cannot catch a missing `tenant_id` or `deleted_at` clause, and getting either wrong
 * would forward one agency's occupant details to another agency's inbox.
 *
 * It also pins the two distinct failure causes, which used to collapse into one
 * misleading log line, and the re-derived address/code that keep an SMS-triggered mirror
 * from rendering a blank subject.
 *
 * Requires Docker (testcontainers). Run via:
 *   pnpm --filter backend test:integration:db
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { seedTenant } from '../service-region/helpers/service-region-fixtures';
import { createAgencyForwardRecipientReader } from '../../../src/modules/notification/infrastructure/prisma-agency-forward-recipient.reader';

let harness: DbHarness;
let read: ReturnType<typeof createAgencyForwardRecipientReader>;

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

beforeAll(async () => {
  harness = await setupDbHarness();
  read = createAgencyForwardRecipientReader(harness.prisma);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await harness.prisma.$executeRawUnsafe(
    `TRUNCATE TABLE appointments, properties, service_types, users, branches, tenants CASCADE`,
  );
});

async function seedAppointment(options: {
  branchContactEmail: string | null;
  appointmentCodePrefix?: string;
  deleted?: boolean;
}): Promise<{ appointmentId: string; tenantId: string }> {
  const seeded = await seedTenant(harness.prisma, `Forward Agency ${rand()}`);
  const tenantId = seeded.tenantId;

  if (options.appointmentCodePrefix) {
    await harness.prisma.tenant.update({
      where: { id: tenantId },
      data: { appointment_code_prefix: options.appointmentCodePrefix },
    });
  }

  const branch = await harness.prisma.branch.findFirstOrThrow({ where: { tenant_id: tenantId } });
  await harness.prisma.branch.update({
    where: { id: branch.id },
    data: { name: 'Sydney CBD', contact_email: options.branchContactEmail },
  });

  const serviceType = await harness.prisma.serviceType.create({
    data: {
      code: `ST-${rand()}`,
      name: `Routine ${rand()}`,
      flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: true,
      status: 'ACTIVE',
    },
  });
  const property = await harness.prisma.property.create({
    data: {
      tenant_id: tenantId,
      branch_id: branch.id,
      property_code: `P-${rand()}`,
      type: 'HOUSE',
      street: '123 Flower St',
      suburb: 'Sydney',
      postcode: '2000',
      state: 'NSW',
    },
  });
  const appointment = await harness.prisma.appointment.create({
    data: {
      tenant_id: tenantId,
      branch_id: branch.id,
      property_id: property.id,
      service_type_id: serviceType.id,
      status: 'AWAITING_INSPECTOR',
      scheduled_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      time_slot_start: '09:00',
      time_slot_end: '12:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'PENDING',
      created_by_user_id: seeded.userId,
      ...(options.deleted ? { deleted_at: new Date() } : {}),
    },
  });

  return { appointmentId: appointment.id, tenantId };
}

describe('createAgencyForwardRecipientReader', () => {
  it('resolves the branch contact, address and formatted code', async () => {
    const { appointmentId, tenantId } = await seedAppointment({
      branchContactEmail: 'branch@agency.example',
      appointmentCodePrefix: 'INS',
    });

    const result = await read(appointmentId, tenantId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recipient.contactEmail).toBe('branch@agency.example');
    expect(result.recipient.branchName).toBe('Sydney CBD');
    // Re-derived because an SMS payload carries neither — without them the mirror's
    // subject renders as "Tenant notice not sent - " with a dangling separator.
    expect(result.recipient.propertyAddress).toBe('123 Flower St, Sydney NSW 2000');
    expect(result.recipient.appointmentCode).toMatch(/^INS-\d{4}$/);
  });

  it('reports NO_BRANCH_EMAIL, the case where nobody at all is told', async () => {
    // `branches.contact_email` is nullable and optional at creation, so this is a
    // steady-state population rather than an edge case.
    const { appointmentId, tenantId } = await seedAppointment({ branchContactEmail: null });

    const result = await read(appointmentId, tenantId);

    expect(result).toEqual({ ok: false, reason: 'NO_BRANCH_EMAIL' });
  });

  it('reports APPOINTMENT_NOT_FOUND separately, since it is a benign race', async () => {
    const { tenantId } = await seedAppointment({ branchContactEmail: 'branch@agency.example' });

    const result = await read('11111111-1111-4111-8111-111111111111', tenantId);

    expect(result).toEqual({ ok: false, reason: 'APPOINTMENT_NOT_FOUND' });
  });

  it('does not resolve a soft-deleted appointment', async () => {
    const { appointmentId, tenantId } = await seedAppointment({
      branchContactEmail: 'branch@agency.example',
      deleted: true,
    });

    const result = await read(appointmentId, tenantId);

    expect(result).toEqual({ ok: false, reason: 'APPOINTMENT_NOT_FOUND' });
  });

  it('refuses to resolve an appointment belonging to another agency', async () => {
    // The tenant-scope guarantee: without it, one agency's occupant details would be
    // forwarded into another agency's inbox.
    const own = await seedAppointment({ branchContactEmail: 'a@agency.example' });
    const other = await seedAppointment({ branchContactEmail: 'b@agency.example' });

    const result = await read(own.appointmentId, other.tenantId);

    expect(result).toEqual({ ok: false, reason: 'APPOINTMENT_NOT_FOUND' });
  });

  it('resolves cross-tenant when no tenant scope is supplied', async () => {
    // Platform-scoped callers pass null; RENTAL_TENANT templates never do, but the
    // reader must not silently return nothing if one ever did.
    const { appointmentId } = await seedAppointment({ branchContactEmail: 'branch@agency.example' });

    const result = await read(appointmentId, null);

    expect(result.ok).toBe(true);
  });
});
