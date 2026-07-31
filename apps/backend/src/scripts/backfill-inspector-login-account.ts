/**
 * One-off repair for inspectors left without a linked login account.
 *
 * Two causes, both now fixed: the `user_id` column was added nullable with no
 * backfill, and `PrismaInspectorRepository.save()` silently dropped the value it
 * was given (fixed in the same change that adds the operator-set password). Its
 * FK is `ON DELETE SET NULL`, so rows can still fall back to null later.
 *
 * An unlinked inspector authenticates to a JWT carrying `inspectorId: null` —
 * every inspector-scoped route rejects them — and the operator's Reset Password
 * action refuses with INSPECTOR_NO_LOGIN_ACCOUNT, so there is no way to give
 * them working credentials from the product.
 *
 * What it does, per unlinked inspector:
 *   - an INSP user already holds the email, unlinked  -> link it
 *   - no user holds the email                         -> create an INSP user, link it
 *   - anything ambiguous                              -> skip and report
 *
 * A created account gets a discarded random password: unusable by design, and
 * reachable only through the operator Reset Password action or the inspector's
 * own forgot-password. This deliberately does NOT invent a credential.
 *
 * Skips are never guessed at, because each would corrupt login:
 *   - `email_taken_by_non_inspector`: linking is invalid (link-user requires the
 *     INSP role) and creating a second row on that address would leave two users
 *     sharing one login identity, which findByEmail (a findFirst) resolves at
 *     random.
 *   - `email_has_multiple_users`: same collision, already present.
 *   - `inspector_user_already_linked`: the INSP user belongs to another inspector.
 *
 * It also reports — without changing — linked INSP users that are tenant-scoped.
 * Every sync and the reset endpoint scope to `tenant_id IS NULL`, so those rows
 * silently no-op on update and 404 on reset. Repairing them means moving an
 * account between tenants, which is not a decision a sweep should make alone.
 *
 * Dry run by default; `--apply` writes. Safe to re-run.
 *
 * Run:
 *   pnpm --filter backend tsx --env-file .env src/scripts/backfill-inspector-login-account.ts
 *   pnpm --filter backend tsx --env-file .env src/scripts/backfill-inspector-login-account.ts --apply
 */

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

export type BackfillSkipReason =
  | 'email_taken_by_non_inspector'
  | 'email_has_multiple_users'
  | 'inspector_user_already_linked';

export interface InspectorBackfillSkip {
  inspectorId: string;
  email: string;
  reason: BackfillSkipReason;
  detail: string;
}

export interface TenantScopedLink {
  inspectorId: string;
  userId: string;
  tenantId: string;
}

export interface InspectorBackfillSummary {
  scanned: number;
  linkedExisting: number;
  createdAndLinked: number;
  skipped: InspectorBackfillSkip[];
  /** Reported only — linked accounts the sync and reset paths cannot reach. */
  tenantScopedLinks: TenantScopedLink[];
  dryRun: boolean;
}

/**
 * Exported for tests: runs the whole repair against an injected client so every
 * branch is verified on a real database rather than only through the CLI.
 */
export async function backfillInspectorLoginAccount(
  prisma: PrismaClient,
  options: { apply: boolean },
): Promise<InspectorBackfillSummary> {
  const inspectors = await prisma.inspector.findMany({
    where: { user_id: null, deleted_at: null },
    select: { id: true, email: true, name: true, phone: true, status: true },
    orderBy: { created_at: 'asc' },
  });

  const summary: InspectorBackfillSummary = {
    scanned: inspectors.length,
    linkedExisting: 0,
    createdAndLinked: 0,
    skipped: [],
    tenantScopedLinks: [],
    dryRun: !options.apply,
  };

  for (const inspector of inspectors) {
    // Login lowercases what the user types and findByEmail matches exactly, so
    // the lookup has to use the same normalised form the login path will.
    const email = inspector.email.toLowerCase().trim();

    const users = await prisma.user.findMany({
      where: { email, deleted_at: null },
      select: { id: true, role: true, tenant_id: true },
    });

    if (users.length > 1) {
      summary.skipped.push({
        inspectorId: inspector.id,
        email,
        reason: 'email_has_multiple_users',
        detail: `${users.length} accounts already share this address`,
      });
      continue;
    }

    const existing = users[0];

    if (existing && existing.role !== 'INSP') {
      summary.skipped.push({
        inspectorId: inspector.id,
        email,
        reason: 'email_taken_by_non_inspector',
        detail: `held by a ${existing.role} account (${existing.id})`,
      });
      continue;
    }

    if (existing) {
      const claimedBy = await prisma.inspector.findFirst({
        where: { user_id: existing.id },
        select: { id: true },
      });
      if (claimedBy) {
        summary.skipped.push({
          inspectorId: inspector.id,
          email,
          reason: 'inspector_user_already_linked',
          detail: `its INSP account is linked to inspector ${claimedBy.id}`,
        });
        continue;
      }

      if (existing.tenant_id !== null) {
        summary.tenantScopedLinks.push({
          inspectorId: inspector.id,
          userId: existing.id,
          tenantId: existing.tenant_id,
        });
      }

      summary.linkedExisting++;
      if (!options.apply) continue;

      // Conditional on user_id still being null so a link made by someone else
      // between the scan and here is never overwritten.
      await prisma.inspector.updateMany({
        where: { id: inspector.id, user_id: null },
        data: { user_id: existing.id },
      });
      continue;
    }

    summary.createdAndLinked++;
    if (!options.apply) continue;

    const userId = crypto.randomUUID();
    // Never returned, never stored: the account is reachable only through the
    // operator's Reset Password action or the inspector's own forgot-password.
    const unusablePassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(unusablePassword, 12);
    const now = new Date();

    // Transactional so a failure cannot leave the orphan account this repair
    // exists to prevent: an unlinked INSP user is invisible to the users list
    // and would block its own email on the next run.
    await prisma.$transaction([
      prisma.user.create({
        data: {
          id: userId,
          tenant_id: null,
          branch_id: null,
          role: 'INSP',
          name: inspector.name,
          email,
          phone: inspector.phone,
          // Mirrored so a deactivated inspector does not gain a usable account.
          status: inspector.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
          password_hash: passwordHash,
          totp_enabled: false,
          failed_login_count: 0,
          created_at: now,
          updated_at: now,
        },
      }),
      prisma.inspector.updateMany({
        where: { id: inspector.id, user_id: null },
        data: { user_id: userId },
      }),
    ]);
  }

  return summary;
}

/** Linked inspectors whose account the sync and reset paths cannot reach. */
export async function findTenantScopedLinkedAccounts(
  prisma: PrismaClient,
): Promise<TenantScopedLink[]> {
  const rows = await prisma.inspector.findMany({
    where: { user_id: { not: null }, deleted_at: null },
    select: { id: true, user_id: true },
  });

  const found: TenantScopedLink[] = [];
  for (const row of rows) {
    const user = await prisma.user.findFirst({
      where: { id: row.user_id!, deleted_at: null },
      select: { id: true, tenant_id: true },
    });
    if (user?.tenant_id) {
      found.push({ inspectorId: row.id, userId: user.id, tenantId: user.tenant_id });
    }
  }
  return found;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient({ log: [] });

  console.log(`\n=== backfill-inspector-login-account (${apply ? 'APPLY' : 'DRY RUN'}) ===\n`);

  try {
    const summary = await backfillInspectorLoginAccount(prisma, { apply });
    const alreadyLinkedTenantScoped = await findTenantScopedLinkedAccounts(prisma);

    console.log(`  inspectors without a login account : ${summary.scanned}`);
    console.log(`  linked to an existing INSP account : ${summary.linkedExisting}`);
    console.log(`  account created and linked         : ${summary.createdAndLinked}`);
    console.log(`  skipped                            : ${summary.skipped.length}`);

    if (summary.skipped.length > 0) {
      console.log('\n  Skipped — each would corrupt login if guessed at:');
      for (const skip of summary.skipped) {
        console.log(`    ${skip.email} (inspector ${skip.inspectorId})`);
        console.log(`      ${skip.reason}: ${skip.detail}`);
      }
    }

    if (alreadyLinkedTenantScoped.length > 0) {
      console.log(
        `\n  Reported only — ${alreadyLinkedTenantScoped.length} linked account(s) are tenant-scoped.`,
      );
      console.log('  Every sync and the reset endpoint scope to tenant_id IS NULL, so these');
      console.log('  silently no-op on update and 404 on reset. Moving an account between');
      console.log('  tenants is not a decision this sweep makes.');
      for (const row of alreadyLinkedTenantScoped) {
        console.log(`    inspector ${row.inspectorId} -> user ${row.userId} (tenant ${row.tenantId})`);
      }
    }

    if (!apply) {
      console.log('\n  DRY RUN — nothing was written. Re-run with --apply to persist.\n');
    } else {
      console.log('\n  Done. Created accounts have no usable password by design —');
      console.log('  set one per inspector with the Reset Password action.\n');
    }
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * True when this module is the process entrypoint rather than an import.
 *
 * Must match the bundled `.js` as well as the `.ts` source: production runs the
 * compiled file, so a `.ts`-only check would leave the script a silent no-op
 * exactly where the repair is needed. Importing the module (tests) must never
 * open a connection or touch the database.
 */
export function isDirectInvocation(entrypoint: string | undefined): boolean {
  return /[/\\]backfill-inspector-login-account\.(ts|js)$/.test(entrypoint ?? '');
}

if (isDirectInvocation(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
