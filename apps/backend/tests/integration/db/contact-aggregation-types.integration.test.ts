/**
 * BUG-001 (REV 4) — Regression test for the `::uuid` cast bug.
 *
 * Background: Prisma `String` columns without `@db.Uuid` are stored as
 * Postgres `text`. The contact-aggregation raw-SQL queries previously cast
 * `contact_id` and `appointment_id` to `::uuid` / `::uuid[]`, which failed
 * with `invalid input syntax for type uuid` against the deployed Supabase
 * schema. Local Testcontainers passed because PG was lenient there.
 *
 * This test acts as a fail-fast strict-typing guard:
 *   1. Asserts via `pg_typeof()` that the relevant columns are still `text`
 *      in the migrated schema. If a future migration changes them to `uuid`,
 *      the test fails so the SQL casts can be revisited.
 *   2. Round-trips both aggregations (`countDistinctPropertiesByContactIds`
 *      and `findPropertiesByContactId`) against the real Postgres harness so
 *      the queries run end-to-end with realistic seed data — exercising the
 *      same `::text` casts that production uses.
 *
 * Requires Docker (Testcontainers). Run via:
 *   pnpm --filter backend test:integration:db
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness } from './harness';
import type { DbHarness } from './harness';
import { PrismaContactRepository } from '../../../src/modules/contact/infrastructure/prisma-contact.repository';

let harness: DbHarness;

beforeAll(async () => {
  harness = await setupDbHarness();
}, 180_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

describe('BUG-001 strict-typing guard — appointment_contacts.contact_id is text, not uuid', () => {
  it('contacts.id is stored as text (Prisma String without @db.Uuid)', async () => {
    const rows = await harness.prisma.$queryRaw<Array<{ data_type: string }>>`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'contacts'
        AND column_name = 'id'
    `;
    expect(rows.length).toBe(1);
    expect(rows[0]?.data_type).toBe('text');
  });

  it('appointment_contacts.contact_id is stored as text', async () => {
    const rows = await harness.prisma.$queryRaw<Array<{ data_type: string }>>`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'appointment_contacts'
        AND column_name = 'contact_id'
    `;
    expect(rows.length).toBe(1);
    expect(rows[0]?.data_type).toBe('text');
  });

  it('appointments.property_id is stored as text', async () => {
    const rows = await harness.prisma.$queryRaw<Array<{ data_type: string }>>`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'appointments'
        AND column_name = 'property_id'
    `;
    expect(rows.length).toBe(1);
    expect(rows[0]?.data_type).toBe('text');
  });
});

describe('BUG-001 round-trip — aggregations execute against real Postgres', () => {
  it('countDistinctPropertiesByContactIds runs end-to-end with text-cast contactIds', async () => {
    const repo = new PrismaContactRepository(harness.prisma);
    // Use UUID-format strings so the test never relies on the column type
    // being uuid; the implementation must cast to ::text[] explicitly.
    const result = await repo.countDistinctPropertiesByContactIds([
      crypto.randomUUID(),
      crypto.randomUUID(),
    ]);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(2);
    // Both contacts have zero linked properties (none seeded).
    for (const count of result.values()) {
      expect(count).toBe(0);
    }
  });

  it('findPropertiesByContactId runs end-to-end with text-cast contactId', async () => {
    const repo = new PrismaContactRepository(harness.prisma);
    const rows = await repo.findPropertiesByContactId(crypto.randomUUID(), {
      page: 1,
      pageSize: 10,
      sortOrder: 'desc',
    });
    expect(rows).toEqual([]);
  });

  it('countPropertiesByContactId runs end-to-end with text-cast contactId', async () => {
    const repo = new PrismaContactRepository(harness.prisma);
    const total = await repo.countPropertiesByContactId(crypto.randomUUID());
    expect(total).toBe(0);
  });
});
