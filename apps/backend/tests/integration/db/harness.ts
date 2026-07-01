/**
 * Real-database integration-test harness.
 *
 * Spins up an ephemeral PostgreSQL container via testcontainers, applies
 * all Prisma migrations, and returns a fresh `PrismaClient` wired to the
 * container. Tests that import this harness run against a real database —
 * no mocking of Prisma, no mocking of the container.
 *
 * This is the base infrastructure for Sprint 1 W-1 / W-2 / W-3 of the
 * audit-ready backlog. The harness is deliberately minimal: one container,
 * one client, one set of migrations. Individual tests seed and tear down
 * their own rows inside a shared container lifecycle to keep total runtime
 * bounded.
 *
 * Usage:
 *
 *   import { setupDbHarness, teardownDbHarness } from './harness';
 *
 *   let harness: DbHarness;
 *   beforeAll(async () => { harness = await setupDbHarness(); }, 120_000);
 *   afterAll(async () => { await teardownDbHarness(harness); });
 *
 *   it('does something', async () => {
 *     await harness.prisma.auditLog.create({ ... });
 *   });
 *
 * Prerequisites:
 *   - Docker daemon running (testcontainers uses Docker to spin up Postgres)
 *   - `pnpm prisma generate` has been run at least once so the client exists
 */

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

export interface DbHarness {
  container: StartedPostgreSqlContainer;
  prisma: PrismaClient;
  connectionString: string;
}

/**
 * Starts a PostgreSQL 16 container, runs `prisma migrate deploy` against it,
 * and returns a ready-to-use harness.
 *
 * The first run downloads the Postgres image (~150 MB); subsequent runs
 * reuse the cached image and take ~5–10 seconds for container boot + migrations.
 */
export async function setupDbHarness(): Promise<DbHarness> {
  // Postgres 16 with PostGIS preinstalled. Feature 004 + 013 migrations run
  // `CREATE EXTENSION postgis` so a plain `postgres:16-alpine` image fails on
  // migration `20260329200000_postgis_polygon_regions`. The `postgis/postgis`
  // image is a drop-in replacement that bundles the extension.
  const container = await new PostgreSqlContainer('postgis/postgis:16-3.4-alpine')
    .withDatabase('properfy_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const connectionString = container.getConnectionUri();

  // Sync the schema via `prisma migrate deploy` against the fresh container.
  //
  // Design note:
  //   The W-1 harness exists to enable real-DB tests (W-2 T061, W-3 T111).
  //   Originally it used `prisma db push` (not `migrate deploy`) because
  //   the migration chain contained three broken migrations discovered in
  //   Sprint 1. After the CORRECTION-007 reconciliation sprint
  //   (2026-04-13), the chain is clean end-to-end — every migration applies
  //   cleanly to a fresh database and the second run is a no-op (idempotent).
  //   Using `migrate deploy` here is now preferable because it validates
  //   the migration chain on every real-DB test run, catching any future
  //   regression at the earliest possible gate.
  //
  // Important env handling: we run from a neutral cwd (`os.tmpdir()`) and
  // pass an explicit `--schema` path. Prisma auto-loads `.env` from the
  // schema directory and from the cwd, so cwd'ing into `apps/backend` would
  // pick up the production `DATABASE_URL` from `apps/backend/.env` and
  // override our testcontainer URL. The schema file itself is still read
  // from its canonical location via `--schema`. We also stub `DIRECT_URL`
  // because the schema requires it.
  const backendRoot = resolve(__dirname, '../../..');
  const schemaPath = resolve(backendRoot, 'prisma/schema.prisma');
  // Invoke Prisma's JS entrypoint directly. The `.bin/prisma` wrapper is a
  // shell script that `node` cannot execute, so we call the CJS entry under
  // `node_modules/prisma/build/index.js` instead. The entry is stable across
  // Prisma 5.x (it is the `bin` target in `node_modules/prisma/package.json`).
  const prismaBin = resolve(backendRoot, 'node_modules/prisma/build/index.js');
  execFileSync(
    'node',
    [prismaBin, 'migrate', 'deploy', '--schema', schemaPath],
    {
      cwd: tmpdir(), // neutral cwd so Prisma does not load apps/backend/.env
      env: {
        ...process.env,
        DATABASE_URL: connectionString,
        DIRECT_URL: connectionString, // testcontainer has no separate direct URL
      },
      stdio: 'pipe', // swallow stdout; tests surface errors via assertion failures
    },
  );

  // Instantiate a Prisma client pointed at the container.
  // `migrate deploy` above already seeded the retention category config
  // and PII field mappings via the 020 migration's INSERT block — no
  // additional seed is needed here.
  const prisma = new PrismaClient({
    datasources: { db: { url: connectionString } },
  });
  await prisma.$connect();

  return { container, prisma, connectionString };
}

/**
 * Disconnects the Prisma client and stops the container.
 * Idempotent — safe to call even if `setupDbHarness` failed partway through.
 */
export async function teardownDbHarness(harness: DbHarness | undefined): Promise<void> {
  if (!harness) return;
  try {
    await harness.prisma.$disconnect();
  } catch {
    // ignore — already disconnected
  }
  try {
    await harness.container.stop();
  } catch {
    // ignore — already stopped
  }
}

/**
 * Removes all rows from a fixed set of tables between tests inside the same
 * harness lifecycle. Use this in `beforeEach` when sharing a container across
 * multiple test cases.
 *
 * The order matters: tables with FKs must be cleared before their parents.
 * Only the tables actually touched by Sprint 1 tests are listed — extend as
 * the suite grows.
 */
export async function resetAuditTestTables(prisma: PrismaClient): Promise<void> {
  // Ordered so that children come before parents to respect FK constraints.
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "audit_logs" CASCADE`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "audit_logs_archive" CASCADE`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "data_subject_erasure_requests" CASCADE`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "audit_legal_holds" CASCADE`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "audit_preservation_rules" CASCADE`);
}

export interface SeededAppointmentFixture {
  tenantId: string;
  branchId: string;
  userId: string;
  propertyId: string;
  serviceTypeId: string;
  appointmentId: string;
}

/**
 * Seeds the minimum Tenant → Branch → User → Property → ServiceType → Appointment
 * chain needed by the Sprint 1 retention worker tests. All the required FKs
 * are satisfied; optional fields get sensible defaults.
 *
 * The appointment is created in `DONE` status with `done_checked_at = NULL`
 * and `done_marked_by_user_id = NULL` — i.e., a legacy row that the 006
 * cross-check invariant must protect under retention.
 */
export async function seedLegacyDoneAppointment(
  prisma: PrismaClient,
  overrides: { tenantName?: string } = {},
): Promise<SeededAppointmentFixture> {
  const tenant = await prisma.tenant.create({
    data: {
      name: overrides.tenantName ?? 'T061 Test Tenant',
      legal_name: `T061 Test Tenant LLC ${Math.random().toString(36).slice(2, 10)}`,
      status: 'ACTIVE',
    },
  });
  const branch = await prisma.branch.create({
    data: {
      tenant_id: tenant.id,
      name: 'T061 Branch',
      status: 'ACTIVE',
    },
  });
  const user = await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      role: 'OP',
      name: 'T061 Actor',
      email: `t061-${Math.random().toString(36).slice(2, 10)}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
      status: 'ACTIVE',
    },
  });
  const property = await prisma.property.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      property_code: `T061-${Math.random().toString(36).slice(2, 10)}`,
      type: 'RESIDENTIAL',
      street: '1 Test St',
      suburb: 'Test',
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
      geocoding_status: 'SUCCESS',
    },
  });
  const stSuffix = Math.random().toString(36).slice(2, 10);
  const serviceType = await prisma.serviceType.create({
    data: {
      code: `T061-ST-${stSuffix}`,
      name: `T061 Routine Inspection ${stSuffix}`,
      flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: true,
      status: 'ACTIVE',
    },
  });
  const appointment = await prisma.appointment.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      property_id: property.id,
      service_type_id: serviceType.id,
      status: 'DONE',
      scheduled_date: new Date('2020-01-15'),
      time_slot_start: '09:00',
      time_slot_end: '12:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'CONFIRMED',
      created_by_user_id: user.id,
      // Legacy state: DONE but cross-check never performed
      done_marked_by_user_id: null,
      done_checked_by_user_id: null,
      done_checked_at: null,
    },
  });

  return {
    tenantId: tenant.id,
    branchId: branch.id,
    userId: user.id,
    propertyId: property.id,
    serviceTypeId: serviceType.id,
    appointmentId: appointment.id,
  };
}
