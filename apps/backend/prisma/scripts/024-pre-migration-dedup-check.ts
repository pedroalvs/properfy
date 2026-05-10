/**
 * 024 — Pre-migration dedup check.
 *
 * Run this BEFORE applying the `contacts_cross_tenant` migration on any
 * environment. The migration itself contains a `DO $$ ... RAISE EXCEPTION
 * END $$` guard that aborts deployment if email/phone collisions exist
 * across the (now-global) uniqueness scope, so a deploy will fail loudly
 * rather than silently merge two tenants' rows. This script exists so
 * operators can SEE the collisions before triggering the migration and
 * resolve them manually (deactivate one of each pair, re-link any open
 * appointments via SQL).
 *
 * Run:
 *   pnpm --filter backend exec tsx prisma/scripts/024-pre-migration-dedup-check.ts
 *
 * Exit codes:
 *   0 — CLEAN (no collisions; safe to migrate)
 *   1 — COLLISIONS (manual resolution required)
 *   2 — UNEXPECTED ERROR
 */

import { PrismaClient } from '@prisma/client';

interface CollisionRow<K extends string> {
  value: string;
  count: number;
  contactIds: string[];
}

async function main() {
  const prisma = new PrismaClient();

  try {
    const emailDups = await prisma.$queryRaw<Array<{
      primary_email: string;
      count: bigint;
      contact_ids: string[];
    }>>`
      SELECT
        primary_email,
        count(*)::bigint AS count,
        array_agg(id ORDER BY created_at) AS contact_ids
      FROM contacts
      WHERE is_active = true AND primary_email IS NOT NULL
      GROUP BY primary_email
      HAVING count(*) > 1
      ORDER BY count(*) DESC
    `;

    const phoneDups = await prisma.$queryRaw<Array<{
      primary_phone: string;
      count: bigint;
      contact_ids: string[];
    }>>`
      SELECT
        primary_phone,
        count(*)::bigint AS count,
        array_agg(id ORDER BY created_at) AS contact_ids
      FROM contacts
      WHERE is_active = true AND primary_phone IS NOT NULL
      GROUP BY primary_phone
      HAVING count(*) > 1
      ORDER BY count(*) DESC
    `;

    const report = {
      emailCollisions: emailDups.map<CollisionRow<'email'>>((r) => ({
        value: r.primary_email,
        count: Number(r.count),
        contactIds: r.contact_ids,
      })),
      phoneCollisions: phoneDups.map<CollisionRow<'phone'>>((r) => ({
        value: r.primary_phone,
        count: Number(r.count),
        contactIds: r.contact_ids,
      })),
    };

    if (report.emailCollisions.length === 0 && report.phoneCollisions.length === 0) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ status: 'CLEAN', report }, null, 2));
      process.exit(0);
    }

    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ status: 'COLLISIONS', report }, null, 2));
    // eslint-disable-next-line no-console
    console.error(
      '\nResolve by deactivating one row of each colliding pair (UPDATE contacts SET is_active = false WHERE id = $1) and re-link any open appointments via SQL. Re-run this script until status=CLEAN, then apply the migration.',
    );
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(2);
});
