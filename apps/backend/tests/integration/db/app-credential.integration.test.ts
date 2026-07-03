/**
 * Real-Postgres test for the app-credential SQL surface — the parts a mocked
 * repository cannot validate (per `feedback_mock_masks_real_bug`):
 *
 *   1. Password is encrypted at rest (the stored column is NOT the plaintext)
 *      and decrypts back to the original value on read.
 *   2. `findAll` / `search` are tenant-scoped: tenant B never sees tenant A's
 *      credentials.
 *   3. The appointment ↔ credential junction round-trips (live reference):
 *      `replaceAppointmentLinks` + `findByAppointmentId` reflect current values,
 *      and an empty array clears all links.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaAppCredentialRepository } from '../../../src/modules/app-credential/infrastructure/prisma-app-credential.repository';
import { Aes256GcmService } from '../../../src/shared/infrastructure/crypto/aes-256-gcm.service';
import { AppCredentialEntity } from '../../../src/modules/app-credential/domain/app-credential.entity';

const ENC_KEY = '1111111111111111111111111111111111111111111111111111111111111111';

let harness: DbHarness;
let repo: PrismaAppCredentialRepository;

const seed = { tenantA: '', tenantB: '', appointmentA: '', branchA: '' };

function makeCred(id: string, tenantId: string, name: string, username: string, password: string) {
  const now = new Date();
  return new AppCredentialEntity({ id, tenantId, name, username, password, isActive: true, createdAt: now, updatedAt: now });
}

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaAppCredentialRepository(harness.prisma, new Aes256GcmService(ENC_KEY));

  const tenantA = await harness.prisma.tenant.create({ data: { name: 'APPCRED-A', legal_name: 'APPCRED A LLC', status: 'ACTIVE' } });
  const tenantB = await harness.prisma.tenant.create({ data: { name: 'APPCRED-B', legal_name: 'APPCRED B LLC', status: 'ACTIVE' } });
  seed.tenantA = tenantA.id;
  seed.tenantB = tenantB.id;

  const branchA = await harness.prisma.branch.create({ data: { tenant_id: tenantA.id, name: 'A-Branch', status: 'ACTIVE' } });
  seed.branchA = branchA.id;
  const userA = await harness.prisma.user.create({
    data: {
      tenant_id: tenantA.id, branch_id: branchA.id, role: 'CL_ADMIN', name: 'A-User',
      email: `appcred-a-${Math.random().toString(36).slice(2, 8)}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake', status: 'ACTIVE',
    },
  });
  const propertyA = await harness.prisma.property.create({
    data: {
      tenant_id: tenantA.id, branch_id: branchA.id,
      property_code: `APPCRED-A-${Math.random().toString(36).slice(2, 6)}`,
      type: 'RESIDENTIAL', street: '1 A St', suburb: 'A', postcode: '3000', state: 'VIC', country: 'AU',
      geocoding_status: 'SUCCESS',
    },
  });
  const serviceType = await harness.prisma.serviceType.create({
    data: {
      code: `APPCRED-ST-${Math.random().toString(36).slice(2, 6)}`,
      name: 'Test Inspection', flow_type: 'ROUTINE', requires_rental_tenant_confirmation: false, status: 'ACTIVE',
    },
  });
  const appt = await harness.prisma.appointment.create({
    data: {
      tenant_id: tenantA.id, branch_id: branchA.id, property_id: propertyA.id, service_type_id: serviceType.id,
      status: 'SCHEDULED', scheduled_date: new Date('2027-04-15'), time_slot_start: '09:00', time_slot_end: '10:00',
      price_amount: '100.00', payout_amount: '80.00', pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'CONFIRMED', created_by_user_id: userA.id,
    },
  });
  seed.appointmentA = appt.id;
});

afterAll(async () => { await teardownDbHarness(harness); });

describe('PrismaAppCredentialRepository (real DB)', () => {
  it('encrypts the password at rest and decrypts it on read', async () => {
    const cred = makeCred(crypto.randomUUID(), seed.tenantA, 'Airbnb', 'host@a.com', 'plaintext-secret');
    await repo.save(cred);

    const raw = await harness.prisma.appCredential.findUnique({ where: { id: cred.id } });
    expect(raw!.password_encrypted).not.toBe('plaintext-secret');
    expect(raw!.password_encrypted.length).toBeGreaterThan(0);

    const loaded = await repo.findById(cred.id);
    expect(loaded!.password).toBe('plaintext-secret');
  });

  it('re-encrypts on password update', async () => {
    const cred = makeCred(crypto.randomUUID(), seed.tenantA, 'Booking', 'host@b.com', 'old-pass');
    await repo.save(cred);
    await repo.update(cred.id, { password: 'new-pass' });
    const loaded = await repo.findById(cred.id);
    expect(loaded!.password).toBe('new-pass');
  });

  it('scopes findAll and search by tenant', async () => {
    await repo.save(makeCred(crypto.randomUUID(), seed.tenantA, 'Stayz-A', 'a', 'p'));
    await repo.save(makeCred(crypto.randomUUID(), seed.tenantB, 'Stayz-B', 'b', 'p'));

    const aRows = await repo.findAll({ tenantId: seed.tenantA }, { page: 1, pageSize: 50, sortOrder: 'asc' });
    expect(aRows.every((r) => r.credential.tenantId === seed.tenantA)).toBe(true);
    expect(aRows.find((r) => r.credential.name === 'Stayz-B')).toBeUndefined();
    expect(aRows[0]!.tenantName).toBe('APPCRED-A');

    const bSearch = await repo.search(seed.tenantB, 'Stayz');
    expect(bSearch).toHaveLength(1);
    expect(bSearch[0]!.name).toBe('Stayz-B');
  });

  it('round-trips appointment links as a live reference and clears on empty', async () => {
    const c1 = makeCred(crypto.randomUUID(), seed.tenantA, 'Link1', 'l1', 'secret1');
    const c2 = makeCred(crypto.randomUUID(), seed.tenantA, 'Link2', 'l2', 'secret2');
    await repo.save(c1);
    await repo.save(c2);

    await repo.replaceAppointmentLinks(seed.appointmentA, [c1.id, c2.id]);
    let linked = await repo.findByAppointmentId(seed.appointmentA);
    expect(linked.map((c) => c.name).sort()).toEqual(['Link1', 'Link2']);
    expect(linked.find((c) => c.name === 'Link1')!.password).toBe('secret1');

    // Live reference: updating the credential changes what the link surfaces.
    await repo.update(c1.id, { password: 'rotated' });
    linked = await repo.findByAppointmentId(seed.appointmentA);
    expect(linked.find((c) => c.name === 'Link1')!.password).toBe('rotated');

    await repo.replaceAppointmentLinks(seed.appointmentA, []);
    expect(await repo.findByAppointmentId(seed.appointmentA)).toHaveLength(0);
  });

  it('encrypts authCode and instructionsPassword at rest and decrypts on read', async () => {
    const now = new Date();
    const cred = new AppCredentialEntity({
      id: crypto.randomUUID(), tenantId: seed.tenantA, branchId: seed.branchA,
      name: 'Secure', username: 'sec', password: 'pw',
      needsAuthCode: true, authCode: 'auth-code-1234',
      appUrl: 'https://example.com/app', instructionsUrl: 'https://example.com/docs',
      instructionsPassword: 'instr-pass-999',
      isActive: true, createdAt: now, updatedAt: now,
    });
    await repo.save(cred);

    const raw = await harness.prisma.appCredential.findUnique({ where: { id: cred.id } });
    expect(raw!.auth_code_encrypted).not.toBe('auth-code-1234');
    expect(raw!.instructions_password_encrypted).not.toBe('instr-pass-999');
    expect(raw!.app_url).toBe('https://example.com/app');
    expect(raw!.branch_id).toBe(seed.branchA);

    const loaded = await repo.findById(cred.id);
    expect(loaded!.authCode).toBe('auth-code-1234');
    expect(loaded!.instructionsPassword).toBe('instr-pass-999');
    expect(loaded!.needsAuthCode).toBe(true);
    expect(loaded!.instructionsUrl).toBe('https://example.com/docs');

    // Clearing a secret nulls the stored column.
    await repo.update(cred.id, { needsAuthCode: false, authCode: null, instructionsPassword: null });
    const cleared = await repo.findById(cred.id);
    expect(cleared!.authCode).toBeNull();
    expect(cleared!.instructionsPassword).toBeNull();
  });

  it('legacy rows (null new columns) load with safe defaults', async () => {
    const cred = makeCred(crypto.randomUUID(), seed.tenantA, 'Legacy', 'leg', 'p');
    await repo.save(cred);
    const loaded = await repo.findById(cred.id);
    expect(loaded!.branchId).toBeNull();
    expect(loaded!.needsAuthCode).toBe(false);
    expect(loaded!.authCode).toBeNull();
    expect(loaded!.appUrl).toBeNull();
    expect(loaded!.instructionsUrl).toBeNull();
    expect(loaded!.instructionsPassword).toBeNull();
  });

  it('branchId filter returns branch-scoped + agency-wide, composing with search', async () => {
    const otherBranch = await harness.prisma.branch.create({
      data: { tenant_id: seed.tenantA, name: 'A-Branch-2', status: 'ACTIVE' },
    });
    const now = new Date();
    const mk = (name: string, branchId: string | null) =>
      new AppCredentialEntity({
        id: crypto.randomUUID(), tenantId: seed.tenantA, branchId, name, username: 'u', password: 'p',
        isActive: true, createdAt: now, updatedAt: now,
      });
    await repo.save(mk('BFILT-branch', seed.branchA));
    await repo.save(mk('BFILT-agencywide', null));
    await repo.save(mk('BFILT-other', otherBranch.id));

    const rows = await repo.findAll(
      { tenantId: seed.tenantA, branchId: seed.branchA, search: 'BFILT' },
      { page: 1, pageSize: 50, sortOrder: 'asc' },
    );
    const names = rows.map((r) => r.credential.name).sort();
    expect(names).toEqual(['BFILT-agencywide', 'BFILT-branch']);
    expect(rows.find((r) => r.credential.name === 'BFILT-branch')!.branchName).toBe('A-Branch');
    expect(rows.find((r) => r.credential.name === 'BFILT-agencywide')!.branchName).toBeNull();

    expect(await repo.count({ tenantId: seed.tenantA, branchId: seed.branchA, search: 'BFILT' })).toBe(2);
  });

  it('branch filter does not leak another tenant agency-wide rows; ignored without tenantId', async () => {
    const now = new Date();
    const mk = (tenantId: string, name: string) =>
      new AppCredentialEntity({
        id: crypto.randomUUID(), tenantId, branchId: null, name, username: 'u', password: 'p',
        isActive: true, createdAt: now, updatedAt: now,
      });
    await repo.save(mk(seed.tenantA, 'XTEN-a-wide'));
    await repo.save(mk(seed.tenantB, 'XTEN-b-wide'));

    // Tenant-scoped branch filter returns only that tenant's agency-wide row.
    const scoped = await repo.findAll(
      { tenantId: seed.tenantA, branchId: seed.branchA, search: 'XTEN' },
      { page: 1, pageSize: 50, sortOrder: 'asc' },
    );
    expect(scoped.map((r) => r.credential.name)).toEqual(['XTEN-a-wide']);

    // Defense in depth: without tenantId the branch OR-expansion is NOT
    // applied (behaves like no branch filter — the plain AM/OP global list);
    // the route additionally rejects branchId without tenantId with 400.
    const unscoped = await repo.findAll(
      { branchId: seed.branchA, search: 'XTEN' },
      { page: 1, pageSize: 50, sortOrder: 'asc' },
    );
    expect(unscoped.map((r) => r.credential.name).sort()).toEqual(['XTEN-a-wide', 'XTEN-b-wide']);
  });
});
