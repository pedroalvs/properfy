/**
 * 024 §FR-303 — repository visibility predicate end-to-end.
 *
 * Verifies that `PrismaContactRepository.findAll/count` with the new
 * `ContactScope` parameter produces the correct cardinality for each
 * actor type against a real seeded multi-tenant database. Also pins the
 * aggregation-scoping behaviour (`countDistinctPropertiesByContactIds`)
 * for CL roles versus AM/OP global.
 *
 * Seed shape (built once per `beforeAll`):
 *   - Tenant Y with 1 appointment linking Contact-Y (registry tenant_id=Y).
 *   - Tenant Z with 1 appointment linking Contact-Z (registry tenant_id=Z).
 *   - Contact-Standalone with `tenant_id = NULL` and no junction rows.
 *   - Contact-Cross with `tenant_id = NULL` linked via junctions to BOTH
 *     Y and Z appointments — proves the EXISTS predicate works through
 *     the operational path even when the registry row has no tenant.
 *
 * Requires Docker (Testcontainers). Run via:
 *   pnpm --filter backend test:integration:db
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaContactRepository } from '../../../src/modules/contact/infrastructure/prisma-contact.repository';
import type { ContactScope } from '../../../src/modules/contact/domain/contact.scope';

let harness: DbHarness;
let repo: PrismaContactRepository;

const seed = {
  tenantY: '',
  tenantZ: '',
  contactY: '',
  contactZ: '',
  contactStandalone: '',
  contactCross: '',
};

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaContactRepository(harness.prisma);

  // --- Tenant Y chain ---
  const tenantY = await harness.prisma.tenant.create({
    data: { name: '024-Y', legal_name: '024-Y LLC', status: 'ACTIVE' },
  });
  const branchY = await harness.prisma.branch.create({
    data: { tenant_id: tenantY.id, name: 'Y-Branch', status: 'ACTIVE' },
  });
  const userY = await harness.prisma.user.create({
    data: {
      tenant_id: tenantY.id,
      branch_id: branchY.id,
      role: 'CL_ADMIN',
      name: 'Y-User',
      email: `024-y-${Math.random().toString(36).slice(2, 8)}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
      status: 'ACTIVE',
    },
  });
  const propertyY = await harness.prisma.property.create({
    data: {
      tenant_id: tenantY.id,
      branch_id: branchY.id,
      property_code: `Y-${Math.random().toString(36).slice(2, 6)}`,
      type: 'HOUSE',
      street: '1 Y St', suburb: 'Y', postcode: '2000', state: 'NSW', country: 'AU',
      geocoding_status: 'SUCCESS',
    },
  });
  const serviceTypeY = await harness.prisma.serviceType.create({
    data: {
      code: `Y-ST-${Math.random().toString(36).slice(2, 6)}`,
      name: 'Y Inspection', flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: false, status: 'ACTIVE',
    },
  });
  const apptY = await harness.prisma.appointment.create({
    data: {
      tenant_id: tenantY.id, branch_id: branchY.id,
      property_id: propertyY.id, service_type_id: serviceTypeY.id,
      status: 'SCHEDULED', scheduled_date: new Date('2026-04-15'),
      time_slot_start: '09:00', time_slot_end: '12:00',
      price_amount: '100.00', payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'CONFIRMED',
      created_by_user_id: userY.id,
    },
  });

  // --- Tenant Z chain ---
  const tenantZ = await harness.prisma.tenant.create({
    data: { name: '024-Z', legal_name: '024-Z LLC', status: 'ACTIVE' },
  });
  const branchZ = await harness.prisma.branch.create({
    data: { tenant_id: tenantZ.id, name: 'Z-Branch', status: 'ACTIVE' },
  });
  const userZ = await harness.prisma.user.create({
    data: {
      tenant_id: tenantZ.id, branch_id: branchZ.id, role: 'CL_ADMIN',
      name: 'Z-User',
      email: `024-z-${Math.random().toString(36).slice(2, 8)}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
      status: 'ACTIVE',
    },
  });
  const propertyZ = await harness.prisma.property.create({
    data: {
      tenant_id: tenantZ.id, branch_id: branchZ.id,
      property_code: `Z-${Math.random().toString(36).slice(2, 6)}`,
      type: 'HOUSE',
      street: '1 Z St', suburb: 'Z', postcode: '3000', state: 'VIC', country: 'AU',
      geocoding_status: 'SUCCESS',
    },
  });
  const apptZ = await harness.prisma.appointment.create({
    data: {
      tenant_id: tenantZ.id, branch_id: branchZ.id,
      property_id: propertyZ.id, service_type_id: serviceTypeY.id,
      status: 'SCHEDULED', scheduled_date: new Date('2026-04-20'),
      time_slot_start: '09:00', time_slot_end: '12:00',
      price_amount: '100.00', payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'CONFIRMED',
      created_by_user_id: userZ.id,
    },
  });

  // --- Contacts ---
  // Prisma exposes `tenant_id` only via the `tenant` relation in create input.
  // Standalone rows omit the relation entirely so the FK stays NULL.
  const cY = await harness.prisma.contact.create({
    data: {
      tenant: { connect: { id: tenantY.id } },
      type: 'PROPERTY_MANAGER',
      display_name: 'Y-Contact', primary_email: '024-y-contact@test.local',
      additional_channels_json: [], is_active: true,
    },
  });
  const cZ = await harness.prisma.contact.create({
    data: {
      tenant: { connect: { id: tenantZ.id } },
      type: 'PROPERTY_MANAGER',
      display_name: 'Z-Contact', primary_email: '024-z-contact@test.local',
      additional_channels_json: [], is_active: true,
    },
  });
  const cStandalone = await harness.prisma.contact.create({
    data: {
      type: 'PROPERTY_MANAGER',
      display_name: 'Standalone-Contact',
      primary_email: '024-standalone@test.local',
      additional_channels_json: [], is_active: true,
    },
  });
  const cCross = await harness.prisma.contact.create({
    data: {
      type: 'RENTAL_TENANT',
      display_name: 'Cross-Tenant-Contact',
      primary_email: '024-cross@test.local',
      additional_channels_json: [], is_active: true,
    },
  });

  // --- appointment_contacts junction rows ---
  // The snapshot fields are the authoritative contact data on the junction.
  await harness.prisma.appointmentContact.create({
    data: {
      appointment: { connect: { id: apptY.id } },
      contact: { connect: { id: cY.id } },
      role: 'RENTAL_TENANT', is_primary: true,
      snapshot_name: 'Y-Contact',
      snapshot_email: '024-y-contact@test.local',
    },
  });
  await harness.prisma.appointmentContact.create({
    data: {
      appointment: { connect: { id: apptZ.id } },
      contact: { connect: { id: cZ.id } },
      role: 'RENTAL_TENANT', is_primary: true,
      snapshot_name: 'Z-Contact',
      snapshot_email: '024-z-contact@test.local',
    },
  });
  // Cross-tenant contact is reachable from BOTH tenants' operational paths.
  await harness.prisma.appointmentContact.create({
    data: {
      appointment: { connect: { id: apptY.id } },
      contact: { connect: { id: cCross.id } },
      role: 'PROPERTY_MANAGER', is_primary: false,
      snapshot_name: 'Cross-Tenant-Contact',
      snapshot_email: '024-cross@test.local',
    },
  });
  await harness.prisma.appointmentContact.create({
    data: {
      appointment: { connect: { id: apptZ.id } },
      contact: { connect: { id: cCross.id } },
      role: 'PROPERTY_MANAGER', is_primary: false,
      snapshot_name: 'Cross-Tenant-Contact',
      snapshot_email: '024-cross@test.local',
    },
  });

  seed.tenantY = tenantY.id;
  seed.tenantZ = tenantZ.id;
  seed.contactY = cY.id;
  seed.contactZ = cZ.id;
  seed.contactStandalone = cStandalone.id;
  seed.contactCross = cCross.id;
}, 180_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

const pagination = { page: 1, pageSize: 50, sortBy: 'displayName', sortOrder: 'asc' as const };
const filters = { isActive: true };

describe('024 §FR-303 visibility — CL_ADMIN tenant-pinned scope', () => {
  it('CL_ADMIN(Y) sees the legacy Y registry row + the cross-tenant contact, but not Z or Standalone', async () => {
    const scope: ContactScope = { kind: 'tenant_pinned', tenantId: seed.tenantY };
    const rows = await repo.findAll(filters, pagination, scope);
    const ids = rows.map((c) => c.id).sort();
    expect(ids).toEqual([seed.contactY, seed.contactCross].sort());

    const total = await repo.count(filters, scope);
    expect(total).toBe(2);
  });

  it('CL_ADMIN(Z) sees the legacy Z registry row + the cross-tenant contact, but not Y or Standalone', async () => {
    const scope: ContactScope = { kind: 'tenant_pinned', tenantId: seed.tenantZ };
    const rows = await repo.findAll(filters, pagination, scope);
    const ids = rows.map((c) => c.id).sort();
    expect(ids).toEqual([seed.contactZ, seed.contactCross].sort());
  });
});

describe('024 §FR-303 visibility — AM/OP global scope', () => {
  it('AM (global, no Agency pin) sees all 4 contacts including the standalone one', async () => {
    const scope: ContactScope = { kind: 'global', explicitTenantId: null };
    const rows = await repo.findAll(filters, pagination, scope);
    const ids = rows.map((c) => c.id).sort();
    expect(ids).toEqual(
      [seed.contactY, seed.contactZ, seed.contactStandalone, seed.contactCross].sort(),
    );

    const total = await repo.count(filters, scope);
    expect(total).toBe(4);
  });

  it('AM with Agency pin to Y sees only Y-visible contacts (registry Y + cross-tenant)', async () => {
    const scope: ContactScope = { kind: 'global', explicitTenantId: seed.tenantY };
    const rows = await repo.findAll(filters, pagination, scope);
    const ids = rows.map((c) => c.id).sort();
    expect(ids).toEqual([seed.contactY, seed.contactCross].sort());
  });
});

describe('024 §FR-303 — aggregation scoping for CL roles', () => {
  it('countDistinctPropertiesByContactIds with scopeTenantId=Y returns only Y properties for the cross-tenant contact', async () => {
    const counts = await repo.countDistinctPropertiesByContactIds(
      [seed.contactCross],
      seed.tenantY,
    );
    // Cross-tenant contact has appointments in Y (1 property) + Z (1 property);
    // scoped to Y, the count must be 1.
    expect(counts.get(seed.contactCross)).toBe(1);
  });

  it('countDistinctPropertiesByContactIds without scopeTenantId returns the full cross-tenant count', async () => {
    const counts = await repo.countDistinctPropertiesByContactIds(
      [seed.contactCross],
      undefined,
    );
    expect(counts.get(seed.contactCross)).toBe(2);
  });
});

describe('024 §FR-310 — global email/phone uniqueness', () => {
  it('existsByEmail ignores tenant — finds the Y-Contact email regardless of the passed-in tenantId', async () => {
    expect(await repo.existsByEmail(seed.tenantZ, '024-y-contact@test.local')).toBe(true);
    expect(await repo.existsByEmail(null, '024-y-contact@test.local')).toBe(true);
  });

  it('existsByEmail returns false for an unknown email', async () => {
    expect(await repo.existsByEmail(null, 'never-used@test.local')).toBe(false);
  });

  it('existsByEmail honours excludeContactId so an in-place update of the same row passes', async () => {
    expect(
      await repo.existsByEmail(null, '024-y-contact@test.local', seed.contactY),
    ).toBe(false);
  });
});

describe('024 §FR-301/305 + T-2-407 cross-tenant snapshot regression', () => {
  it('updating the cross-tenant contact registry does not mutate the existing per-appointment snapshots in either tenant', async () => {
    // Sanity: read both junction snapshots BEFORE the registry update.
    const beforeY = await harness.prisma.appointmentContact.findFirst({
      where: { contact_id: seed.contactCross, appointment: { tenant_id: seed.tenantY } },
    });
    const beforeZ = await harness.prisma.appointmentContact.findFirst({
      where: { contact_id: seed.contactCross, appointment: { tenant_id: seed.tenantZ } },
    });
    expect(beforeY?.snapshot_email).toBe('024-cross@test.local');
    expect(beforeZ?.snapshot_email).toBe('024-cross@test.local');

    // Registry update — cross-tenant (because the registry row is standalone,
    // tenant_id = NULL) — bumps email and display_name. Snapshots must stay frozen.
    await harness.prisma.contact.update({
      where: { id: seed.contactCross },
      data: {
        primary_email: '024-cross-updated@test.local',
        display_name: 'Cross-Tenant-Contact (renamed)',
      },
    });

    const afterY = await harness.prisma.appointmentContact.findFirst({
      where: { contact_id: seed.contactCross, appointment: { tenant_id: seed.tenantY } },
    });
    const afterZ = await harness.prisma.appointmentContact.findFirst({
      where: { contact_id: seed.contactCross, appointment: { tenant_id: seed.tenantZ } },
    });

    // Both snapshots remain frozen — the registry update did not propagate
    // (FR-034 from 023; reaffirmed by 024 §FR-305 cross-tenant).
    expect(afterY?.snapshot_email).toBe('024-cross@test.local');
    expect(afterY?.snapshot_name).toBe('Cross-Tenant-Contact');
    expect(afterZ?.snapshot_email).toBe('024-cross@test.local');
    expect(afterZ?.snapshot_name).toBe('Cross-Tenant-Contact');

    // The registry row itself reflects the new values.
    const registry = await harness.prisma.contact.findUnique({ where: { id: seed.contactCross } });
    expect(registry?.primary_email).toBe('024-cross-updated@test.local');
    expect(registry?.display_name).toBe('Cross-Tenant-Contact (renamed)');
  });
});

describe('024 §FR-303 — existsLinkedToTenant', () => {
  it('returns true when the contact is linked to an appointment in the queried tenant', async () => {
    expect(await repo.existsLinkedToTenant(seed.contactY, seed.tenantY)).toBe(true);
    expect(await repo.existsLinkedToTenant(seed.contactCross, seed.tenantZ)).toBe(true);
  });

  it('returns false when the contact has no operational link to the queried tenant', async () => {
    expect(await repo.existsLinkedToTenant(seed.contactY, seed.tenantZ)).toBe(false);
    expect(await repo.existsLinkedToTenant(seed.contactStandalone, seed.tenantY)).toBe(false);
  });
});
