/**
 * Real-database test for migration 20260731000000_agency_rental_tenant_notifications_switch.
 *
 * The migration.sql is read from disk and executed verbatim, so the SQL and the
 * semantics asserted here cannot drift apart. A mock could not catch a wrong jsonb
 * expression, and the `-` / `||` / `?` operators are exactly where this can go wrong.
 *
 * Requires Docker (testcontainers). Run via:
 *   pnpm --filter backend test:integration:db
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';

let harness: DbHarness;

const migrationSql = readFileSync(
  join(
    __dirname,
    '../../../prisma/migrations/20260731000000_agency_rental_tenant_notifications_switch/migration.sql',
  ),
  'utf8',
);

/**
 * `$executeRawUnsafe` sends one prepared statement, so a multi-statement migration
 * has to be split (Postgres: "cannot insert multiple commands into a prepared
 * statement"). Comment lines are stripped first so a `;` inside prose cannot create
 * a phantom statement.
 *
 * This relies on no `;` appearing inside a string literal in the migration. The
 * statement-count assertion below is what catches it if that ever stops being true.
 */
function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Applies the migration the way `prisma migrate deploy` does: in order, atomically. */
async function applyMigration(): Promise<void> {
  const statements = splitStatements(migrationSql);
  await harness.prisma.$transaction(
    statements.map((s) => harness.prisma.$executeRawUnsafe(s)),
  );
}

beforeAll(async () => {
  harness = await setupDbHarness();
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await harness.prisma.$executeRawUnsafe(
    `TRUNCATE TABLE notification_templates, tenants CASCADE`,
  );
});

async function seedTenant(settings: Record<string, unknown>): Promise<string> {
  const row = await harness.prisma.tenant.create({
    data: {
      name: 'Switch Tenant',
      legal_name: `Switch LLC ${Math.random().toString(36).slice(2, 10)}`,
      status: 'ACTIVE',
      settings_json: settings,
    },
  });
  return row.id;
}

async function readSettings(id: string): Promise<Record<string, unknown>> {
  const row = await harness.prisma.tenant.findUniqueOrThrow({
    where: { id },
    select: { settings_json: true },
  });
  return row.settings_json as Record<string, unknown>;
}

describe('agency rental-tenant notification switch migration', () => {
  it('splits into exactly the three statements the migration declares', () => {
    // Pins the splitter's assumption. If a future edit puts a `;` inside a string
    // literal this count changes and the failure names the cause, instead of the
    // migration half-applying with a confusing Postgres syntax error.
    const statements = splitStatements(migrationSql);
    expect(statements).toHaveLength(3);
    expect(statements[0]).toMatch(/^INSERT INTO notification_templates/);
    expect(statements[1]).toMatch(/^UPDATE tenants/);
    expect(statements[2]).toMatch(/^UPDATE tenants/);
  });

  it('carries a disabled agency over to the new flag and drops the old key', async () => {
    const id = await seedTenant({ emailSendingEnabled: false, billingPeriod: 'MONTHLY' });

    await applyMigration();

    expect(await readSettings(id)).toEqual({
      rentalTenantNotificationsEnabled: false,
      billingPeriod: 'MONTHLY',
    });
  });

  it('drops the old key without adding the new one when it was enabled', async () => {
    // true was the old default and is also the new default, so restating it would
    // just be noise in the blob.
    const id = await seedTenant({ emailSendingEnabled: true, billingPeriod: 'WEEKLY' });

    await applyMigration();

    expect(await readSettings(id)).toEqual({ billingPeriod: 'WEEKLY' });
  });

  it('leaves a settings blob that never carried the old key untouched', async () => {
    const id = await seedTenant({ billingPeriod: 'BIWEEKLY', notificationDailyCapSms: 50 });

    await applyMigration();

    expect(await readSettings(id)).toEqual({
      billingPeriod: 'BIWEEKLY',
      notificationDailyCapSms: 50,
    });
  });

  it('preserves every other setting on a migrated agency', async () => {
    // The `-` then `||` composition is easy to write as a whole-blob replacement by
    // mistake, which would silently wipe billing and notification configuration.
    const id = await seedTenant({
      emailSendingEnabled: false,
      billingPeriod: 'WEEKLY',
      billingDayOfWeek: 3,
      notificationDailyCapEmail: 250,
      clUserPermissions: ['create_appointments'],
      customFields: { anything: 'kept' },
    });

    await applyMigration();

    expect(await readSettings(id)).toEqual({
      rentalTenantNotificationsEnabled: false,
      billingPeriod: 'WEEKLY',
      billingDayOfWeek: 3,
      notificationDailyCapEmail: 250,
      clUserPermissions: ['create_appointments'],
      customFields: { anything: 'kept' },
    });
  });

  it('does not overwrite a new flag that is already set', async () => {
    const id = await seedTenant({ rentalTenantNotificationsEnabled: false });

    await applyMigration();

    expect(await readSettings(id)).toEqual({ rentalTenantNotificationsEnabled: false });
  });

  it('is idempotent — a second run changes nothing', async () => {
    const id = await seedTenant({ emailSendingEnabled: false, billingPeriod: 'MONTHLY' });

    await applyMigration();
    const afterFirst = await readSettings(id);
    await applyMigration();

    expect(await readSettings(id)).toEqual(afterFirst);
  });

  it('seeds the agency forward template as TRANSACTIONAL exactly once', async () => {
    await applyMigration();
    await applyMigration();

    const rows = await harness.prisma.notificationTemplate.findMany({
      where: { tenant_id: null, template_code: 'TENANT_NOTICE_FORWARDED_AGENCY' },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].channel).toBe('EMAIL');
    // OPERATIONAL would let a branch contact's opt-out suppress the mirror, leaving
    // neither the occupant nor the agency informed.
    expect(rows[0].notification_class).toBe('TRANSACTIONAL');
    expect(rows[0].is_active).toBe(true);
    expect(rows[0].body_text).toBeTruthy();
  });
});
