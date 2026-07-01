/**
 * Code-review Issue 1 — End-to-end Postgres test for the cross-tenant
 * lookup path in `GetContactUseCase` and `UpdateContactUseCase`.
 *
 * Why this exists separately from any unit guard:
 * the same trap that produced BUG-024-002 (fixed for the appointment
 * use cases) was still present here. Earlier mocks of
 * `IContactRepository.findById` returned the configured value
 * regardless of the `tenantId` arg, so the bug was invisible until a
 * code reviewer traced the production SQL — exactly the "mocks-mask-
 * the-WHERE-tenant_id" pattern captured in
 * `feedback_mock_masks_real_bug.md`.
 *
 * What's tested here, against real Postgres via Testcontainers:
 *   1. CL_ADMIN(B) GETs a contact whose registry row lives in TenantA
 *      but is operationally visible to B via `appointment_contacts` →
 *      returns the contact (was 404 pre-fix because
 *      `WHERE id = $1 AND tenant_id = B` filtered the row out).
 *   2. CL_ADMIN(B) GETs a contact unreachable from B (no junction in
 *      B) → throws ContactNotFoundError (FR-022 collapse).
 *   3. CL_ADMIN(B) GETs the OWN-tenant fast path: a contact already
 *      pinned to TenantB via `tenant_id`. The `ownsContact` shortcut
 *      avoids the junction lookup; the result still resolves.
 *   4. AM GETs a TenantA-pinned contact → returns it (no visibility
 *      gate for AM/OP global scope).
 *   5. CL_ADMIN(B) UPDATEs a TenantA-registered contact reachable in B
 *      via junction → row is actually mutated in DB. Pre-fix this was
 *      a silent no-op because the `repo.update` SQL also carried
 *      `WHERE tenant_id = B`.
 *   6. CL_ADMIN(B) UPDATE rejected for unreachable contact → throws
 *      ContactNotFoundError; row is NOT mutated.
 *   7. AM UPDATEs a standalone contact (`tenant_id = null`) → row is
 *      actually mutated.
 *
 * Repository is the REAL `PrismaContactRepository`. Other collaborators
 * (audit) are mocked because the SQL contract is the surface under test.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaContactRepository } from '../../../src/modules/contact/infrastructure/prisma-contact.repository';
import { GetContactUseCase } from '../../../src/modules/contact/application/use-cases/get-contact.use-case';
import { UpdateContactUseCase } from '../../../src/modules/contact/application/use-cases/update-contact.use-case';
import { ContactNotFoundError } from '../../../src/modules/contact/domain/contact.errors';
import type { AuditService } from '../../../src/shared/infrastructure/audit';

let harness: DbHarness;
let repo: PrismaContactRepository;
let getUseCase: GetContactUseCase;
let updateUseCase: UpdateContactUseCase;
let auditService: AuditService;

const seed = {
  tenantA: '',
  tenantB: '',
  appointmentInB: '',
  contactInA: '',          // registry tenant_id = A; junction in B → visible to CL(B)
  contactInB: '',          // registry tenant_id = B; ownsContact fast path
  contactStandalone: '',   // registry tenant_id = null; no junction → unreachable in B
  contactStandaloneInB: '', // registry tenant_id = null; junction in B → reachable
};

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaContactRepository(harness.prisma);
  auditService = { log: vi.fn() } as unknown as AuditService;
  getUseCase = new GetContactUseCase(repo);
  updateUseCase = new UpdateContactUseCase(repo, auditService);

  // --- Tenants ---
  const tenantA = await harness.prisma.tenant.create({
    data: { name: 'REVIEW-ISSUE-1-A', legal_name: 'A LLC', status: 'ACTIVE' },
  });
  const tenantB = await harness.prisma.tenant.create({
    data: { name: 'REVIEW-ISSUE-1-B', legal_name: 'B LLC', status: 'ACTIVE' },
  });

  // --- TenantB chain (where the junction lives) ---
  const branchB = await harness.prisma.branch.create({
    data: { tenant_id: tenantB.id, name: 'B-Branch', status: 'ACTIVE' },
  });
  const userB = await harness.prisma.user.create({
    data: {
      tenant_id: tenantB.id, branch_id: branchB.id, role: 'CL_ADMIN',
      name: 'B-User',
      email: `review-issue-1-b-${Math.random().toString(36).slice(2, 8)}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
      status: 'ACTIVE',
    },
  });
  const propertyB = await harness.prisma.property.create({
    data: {
      tenant_id: tenantB.id, branch_id: branchB.id,
      property_code: `REVIEW-1-B-${Math.random().toString(36).slice(2, 6)}`,
      type: 'RESIDENTIAL',
      street: '1 B St', suburb: 'B', postcode: '3000', state: 'VIC', country: 'AU',
      geocoding_status: 'SUCCESS',
    },
  });
  const serviceType = await harness.prisma.serviceType.create({
    data: {
      code: `REVIEW-1-ST-${Math.random().toString(36).slice(2, 6)}`,
      name: 'Test Inspection', flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: false, status: 'ACTIVE',
    },
  });
  const apptInB = await harness.prisma.appointment.create({
    data: {
      tenant_id: tenantB.id, branch_id: branchB.id,
      property_id: propertyB.id, service_type_id: serviceType.id,
      status: 'SCHEDULED', scheduled_date: new Date('2027-04-15'),
      time_slot_start: '09:00', time_slot_end: '10:00',
      price_amount: '100.00', payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'CONFIRMED',
      created_by_user_id: userB.id,
    },
  });

  // --- Contacts ---
  const cInA = await harness.prisma.contact.create({
    data: {
      tenant: { connect: { id: tenantA.id } },
      type: 'PROPERTY_MANAGER',
      display_name: 'A-Owned Contact',
      primary_email: `review-1-a-${Math.random().toString(36).slice(2, 6)}@test.local`,
      additional_channels_json: [], is_active: true,
    },
  });
  const cInB = await harness.prisma.contact.create({
    data: {
      tenant: { connect: { id: tenantB.id } },
      type: 'PROPERTY_MANAGER',
      display_name: 'B-Owned Contact',
      primary_email: `review-1-b-${Math.random().toString(36).slice(2, 6)}@test.local`,
      additional_channels_json: [], is_active: true,
    },
  });
  const cStandalone = await harness.prisma.contact.create({
    data: {
      type: 'RENTAL_TENANT',
      display_name: 'Standalone Contact (no junction)',
      primary_email: `review-1-stand-${Math.random().toString(36).slice(2, 6)}@test.local`,
      additional_channels_json: [], is_active: true,
    },
  });
  const cStandaloneInB = await harness.prisma.contact.create({
    data: {
      type: 'RENTAL_TENANT',
      display_name: 'Standalone Contact (junction in B)',
      primary_email: `review-1-stand-b-${Math.random().toString(36).slice(2, 6)}@test.local`,
      additional_channels_json: [], is_active: true,
    },
  });

  // --- Junction: link the A-owned and the standalone-in-B contacts to
  //     the TenantB appointment so they are operationally visible to B.
  await harness.prisma.appointmentContact.create({
    data: {
      appointment: { connect: { id: apptInB.id } },
      contact: { connect: { id: cInA.id } },
      role: 'PROPERTY_MANAGER', is_primary: false,
      rental_tenant_name: 'A-Owned Contact',
      snapshot_name: 'A-Owned Contact',
      snapshot_email: cInA.primary_email,
    },
  });
  await harness.prisma.appointmentContact.create({
    data: {
      appointment: { connect: { id: apptInB.id } },
      contact: { connect: { id: cStandaloneInB.id } },
      role: 'RENTAL_TENANT', is_primary: true,
      rental_tenant_name: 'Standalone Contact (junction in B)',
      snapshot_name: 'Standalone Contact (junction in B)',
      snapshot_email: cStandaloneInB.primary_email,
    },
  });

  Object.assign(seed, {
    tenantA: tenantA.id,
    tenantB: tenantB.id,
    appointmentInB: apptInB.id,
    contactInA: cInA.id,
    contactInB: cInB.id,
    contactStandalone: cStandalone.id,
    contactStandaloneInB: cStandaloneInB.id,
  });
}, 180_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

const actor = (role: 'AM' | 'OP' | 'CL_ADMIN' | 'CL_USER', tenantId: string | null) =>
  ({ role, tenantId });

describe('Code-review Issue 1 — GetContactUseCase against real Postgres', () => {
  it('CL_ADMIN(B) GETs a TenantA-registered contact reachable via junction in B', async () => {
    const result = await getUseCase.execute(seed.contactInA, seed.tenantB, {
      actor: actor('CL_ADMIN', seed.tenantB),
    });
    expect(result.contact.id).toBe(seed.contactInA);
    expect(result.contact.tenantId).toBe(seed.tenantA);
  });

  it('CL_ADMIN(B) GETs a contact unreachable from B → ContactNotFoundError (404 collapse)', async () => {
    await expect(
      getUseCase.execute(seed.contactStandalone, seed.tenantB, {
        actor: actor('CL_ADMIN', seed.tenantB),
      }),
    ).rejects.toBeInstanceOf(ContactNotFoundError);
  });

  it('CL_ADMIN(B) GETs an OWN-tenant contact via the ownsContact fast path', async () => {
    const result = await getUseCase.execute(seed.contactInB, seed.tenantB, {
      actor: actor('CL_ADMIN', seed.tenantB),
    });
    expect(result.contact.id).toBe(seed.contactInB);
    expect(result.contact.tenantId).toBe(seed.tenantB);
  });

  it('AM GETs a TenantA-registered contact (no visibility gate for global scope)', async () => {
    const result = await getUseCase.execute(seed.contactInA, null, {
      actor: actor('AM', null),
    });
    expect(result.contact.id).toBe(seed.contactInA);
  });

  it('AM GETs a standalone contact (tenant_id = null) directly', async () => {
    const result = await getUseCase.execute(seed.contactStandalone, null, {
      actor: actor('AM', null),
    });
    expect(result.contact.id).toBe(seed.contactStandalone);
    expect(result.contact.tenantId).toBeNull();
  });
});

describe('Code-review Issue 1 — UpdateContactUseCase against real Postgres', () => {
  it('CL_ADMIN(B) UPDATEs a TenantA-registered contact reachable via junction — DB row actually mutates', async () => {
    const newName = `Renamed by CL_ADMIN(B) ${Math.random().toString(36).slice(2, 6)}`;
    const result = await updateUseCase.execute({
      contactId: seed.contactInA,
      tenantId: seed.tenantB,        // route passes JWT tenant for CL roles
      visibilityTenantId: seed.tenantB,
      actorId: '00000000-0000-4000-8000-000000000001',
      actorTenantId: seed.tenantB,
      data: { displayName: newName },
    });

    expect(result?.displayName).toBe(newName);
    // Verify the DB row directly — pre-fix, repo.update silently no-op'd.
    const row = await harness.prisma.contact.findUnique({ where: { id: seed.contactInA } });
    expect(row?.display_name).toBe(newName);
  });

  it('CL_ADMIN(B) UPDATE rejected for unreachable contact → ContactNotFoundError; DB row unchanged', async () => {
    const before = await harness.prisma.contact.findUnique({ where: { id: seed.contactStandalone } });
    expect(before).toBeTruthy();

    await expect(
      updateUseCase.execute({
        contactId: seed.contactStandalone,
        tenantId: seed.tenantB,
        visibilityTenantId: seed.tenantB,
        actorId: '00000000-0000-4000-8000-000000000001',
        actorTenantId: seed.tenantB,
        data: { displayName: 'should not happen' },
      }),
    ).rejects.toBeInstanceOf(ContactNotFoundError);

    const after = await harness.prisma.contact.findUnique({ where: { id: seed.contactStandalone } });
    expect(after?.display_name).toBe(before?.display_name);
  });

  it('AM UPDATEs a standalone contact (tenant_id = null) — DB row actually mutates', async () => {
    const newName = `Renamed by AM ${Math.random().toString(36).slice(2, 6)}`;
    await updateUseCase.execute({
      contactId: seed.contactStandalone,
      tenantId: null,                 // route passes null for AM/OP cross-tenant
      // visibilityTenantId omitted for AM/OP — global scope
      actorId: '00000000-0000-4000-8000-000000000001',
      actorTenantId: null,
      data: { displayName: newName },
    });

    const row = await harness.prisma.contact.findUnique({ where: { id: seed.contactStandalone } });
    expect(row?.display_name).toBe(newName);
    expect(row?.tenant_id).toBeNull();
  });
});
