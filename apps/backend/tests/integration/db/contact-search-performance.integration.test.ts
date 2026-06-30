/**
 * SC-005 / NFR-001 — Contact search performance test.
 *
 * Seeds 500 contacts in a single tenant and asserts that a trigram search
 * completes within 500 ms wall-clock time (generous CI margin over the
 * production p95 target of 200 ms).
 *
 * Requires Docker (Testcontainers). Run via:
 *   pnpm --filter backend test tests/integration/db/
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness } from './harness';
import type { DbHarness } from './harness';
import { PrismaContactRepository } from '../../../src/modules/contact/infrastructure/prisma-contact.repository';
import { ContactEntity } from '../../../src/modules/contact/domain/contact.entity';

let harness: DbHarness;
let tenantId: string;

beforeAll(async () => {
  harness = await setupDbHarness();

  // Create a tenant for this performance test
  const tenant = await harness.prisma.tenant.create({
    data: {
      name: 'Perf Test Tenant',
      legal_name: `Perf Test Tenant LLC ${Math.random().toString(36).slice(2, 10)}`,
      status: 'ACTIVE',
    },
  });
  tenantId = tenant.id;

  // Seed 500 contacts with varied names, emails and phones for realistic search
  const contacts: ContactEntity[] = [];
  for (let i = 0; i < 500; i++) {
    contacts.push(new ContactEntity({
      id: crypto.randomUUID(),
      tenantId,
      type: i % 5 === 0 ? 'PROPERTY_MANAGER' : i % 3 === 0 ? 'BROKER' : 'RENTAL_TENANT',
      displayName: `${randomFirstName(i)} ${randomLastName(i)}`,
      company: i % 10 === 0 ? `Company ${i}` : null,
      primaryEmail: `contact${i}@perf-tenant-${Math.random().toString(36).slice(2, 6)}.example.com`,
      primaryPhone: i % 4 === 0 ? `+6140${String(i).padStart(7, '0')}` : null,
      additionalChannels: [],
      notes: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  // Batch insert via raw SQL for speed
  for (const c of contacts) {
    await harness.prisma.contact.create({
      data: {
        id: c.id,
        tenant_id: c.tenantId,
        type: c.type as any,
        display_name: c.displayName,
        company: c.company,
        primary_email: c.primaryEmail,
        primary_phone: c.primaryPhone,
        additional_channels_json: [],
        notes: c.notes,
        is_active: c.isActive,
      },
    });
  }
}, 180_000); // allow up to 3 minutes for container boot + 500 inserts

afterAll(async () => {
  await teardownDbHarness(harness);
});

describe('Contact search performance (SC-005 / NFR-001)', () => {
  it('trigram or fallback search over 500 contacts completes within 500 ms', async () => {
    const repo = new PrismaContactRepository(harness.prisma);

    const start = Date.now();
    const results = await repo.search(tenantId, 'smith');
    const elapsed = Date.now() - start;

    // Results are valid (may be 0 if no "smith" in generated names — that's OK,
    // we're testing response time not result correctness here)
    expect(Array.isArray(results)).toBe(true);

    // Wall-clock assertion: must be under 500 ms
    expect(elapsed).toBeLessThan(500);
  }, 10_000);

  it('email-fragment search over 500 contacts completes within 500 ms', async () => {
    const repo = new PrismaContactRepository(harness.prisma);

    const start = Date.now();
    const results = await repo.search(tenantId, 'example.com');
    const elapsed = Date.now() - start;

    expect(Array.isArray(results)).toBe(true);
    expect(elapsed).toBeLessThan(500);
  }, 10_000);

  it('tenant-isolated search does not bleed into other tenants', async () => {
    const repo = new PrismaContactRepository(harness.prisma);

    // Create a second tenant with a single contact
    const tenant2 = await harness.prisma.tenant.create({
      data: {
        name: 'Isolation Tenant 2',
        legal_name: `Isolation Tenant 2 LLC ${Math.random().toString(36).slice(2, 10)}`,
        status: 'ACTIVE',
      },
    });
    await harness.prisma.contact.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenant2.id,
        type: 'RENTAL_TENANT',
        display_name: 'Unique Only In Tenant 2',
        primary_email: 'uniqueonly@tenant2.example.com',
        additional_channels_json: [],
        is_active: true,
      },
    });

    // Searching in tenant1 should NOT return tenant2's contact
    const results = await repo.search(tenantId, 'uniqueonly');
    expect(results.every((r) => r.tenantId === tenantId)).toBe(true);
    expect(results.find((r) => r.tenantId === tenant2.id)).toBeUndefined();
  }, 10_000);
});

// --- helpers ---------------------------------------------------------------

const firstNames = ['James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer',
  'Michael', 'Linda', 'William', 'Barbara', 'Smith', 'Jones', 'Taylor', 'Brown',
  'David', 'Susan', 'Richard', 'Karen', 'Joseph', 'Nancy'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia',
  'Miller', 'Davis', 'Martinez', 'Wilson', 'Anderson', 'Taylor', 'Thomas',
  'Hernandez', 'Moore', 'Martin', 'Jackson', 'Thompson', 'White', 'Lopez'];

function randomFirstName(i: number): string {
  return firstNames[i % firstNames.length]!;
}

function randomLastName(i: number): string {
  return lastNames[Math.floor(i / firstNames.length) % lastNames.length]!;
}
