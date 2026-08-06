/**
 * Production first-admin one-shot — the ONLY user-creating artifact allowed in
 * production (deploy-restructure-plan.md §7.3).
 *
 * Creates the first Admin Master with an unknowable throwaway password and
 * prints a password-reset link (same token contract the normal
 * consume-password-reset flow validates). No email dependency: the link goes
 * to stdout so go-live does not hinge on Resend being live yet — hand it to
 * the admin over a secure channel. 2FA (mandatory for AM) enrolls on first
 * login through the normal UI flow.
 *
 * Idempotent by refusal: exits non-zero if a non-deleted AM already exists —
 * a rerun must never rotate the real admin's credentials. A soft-deleted AM
 * does not block: rerunning this script is the recovery path when the only
 * admin account was deleted.
 *
 * Run (production):
 *   fly ssh console -a properfy-api -C "cd /app && node apps/backend/dist/provision-admin.js --email admin@client.com"
 * Run (local):
 *   pnpm --filter backend tsx --env-file .env src/scripts/provision-admin.ts --email admin@client.com
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

// Onboarding link: 24h instead of the forgot-password flow's 1h — the client
// admin may not open it immediately after go-live. Expired? The normal
// forgot-password flow reissues (1h) once notification email works.
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export interface ProvisionAdminOptions {
  email: string;
  name?: string;
  baseUrl: string;
}

export interface ProvisionAdminResult {
  created: boolean;
  reason?: 'AM_EXISTS' | 'INVALID_EMAIL';
  userId?: string;
  resetLink?: string;
}

export async function provisionAdmin(
  prisma: PrismaClient,
  options: ProvisionAdminOptions,
): Promise<ProvisionAdminResult> {
  const parsed = z.string().email().safeParse(options.email.trim().toLowerCase());
  if (!parsed.success) {
    return { created: false, reason: 'INVALID_EMAIL' };
  }
  const email = parsed.data;

  // Fail before any write if the base URL cannot form a link — otherwise the
  // AM would exist with an unprintable reset link.
  const resetLink = new URL('/reset-password', options.baseUrl);

  const throwawayPassword = randomBytes(32).toString('hex');
  const passwordHash = await bcrypt.hash(throwawayPassword, 12);

  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const now = new Date();

  const user = await prisma.$transaction(async (tx) => {
    // Advisory xact-lock serializes concurrent runs so the existence check
    // and the insert are atomic — two racing invocations cannot both pass
    // the check and create two AMs. ::bigint key = arbitrary constant.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(72019842)`;

    const existingAdmin = await tx.user.findFirst({
      where: { role: 'AM', deleted_at: null },
      select: { id: true },
    });
    if (existingAdmin) {
      return null;
    }

    const created = await tx.user.create({
      data: {
        id: randomUUID(),
        tenant_id: null,
        role: 'AM',
        name: options.name?.trim() || 'Administrator',
        email,
        status: 'ACTIVE',
        password_hash: passwordHash,
      },
    });

    await tx.passwordResetToken.create({
      data: {
        id: randomUUID(),
        user_id: created.id,
        token_hash: tokenHash,
        expires_at: new Date(now.getTime() + TOKEN_TTL_MS),
      },
    });

    await tx.auditLog.create({
      data: {
        id: randomUUID(),
        tenant_id: null,
        actor_type: 'SYSTEM',
        entity_type: 'user',
        entity_id: created.id,
        action: 'admin.provisioned',
        metadata_json: { source: 'provision-admin', email },
      },
    });

    return created;
  });

  if (!user) {
    return { created: false, reason: 'AM_EXISTS' };
  }

  resetLink.searchParams.set('token', rawToken);

  return { created: true, userId: user.id, resetLink: resetLink.toString() };
}

function parseArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  const email = parseArg('--email');
  if (!email) {
    console.error('Usage: provision-admin --email <admin-email> [--name <display-name>]');
    process.exit(1);
  }

  const baseUrl = process.env.WEB_APP_BASE_URL;
  if (!baseUrl) {
    console.error('WEB_APP_BASE_URL must be set (reset links are built from it).');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const result = await provisionAdmin(prisma, {
      email,
      name: parseArg('--name'),
      baseUrl,
    });

    if (!result.created) {
      if (result.reason === 'AM_EXISTS') {
        console.error('Refusing to run: an Admin Master already exists.');
      } else {
        console.error(`Invalid email: ${email}`);
      }
      process.exit(1);
    }

    console.log(`Admin Master created (${result.userId}).`);
    console.log('Send this password-reset link to the admin over a secure channel');
    console.log('(valid for 24h; the forgot-password flow can reissue after that):');
    console.log(result.resetLink);
  } finally {
    await prisma.$disconnect();
  }
}

export function isDirectInvocation(entrypoint: string | undefined): boolean {
  return /[/\\]provision-admin\.(ts|js)$/.test(entrypoint ?? '');
}

if (isDirectInvocation(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
