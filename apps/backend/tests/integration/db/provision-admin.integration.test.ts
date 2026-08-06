/**
 * Real-database test for the production first-admin one-shot.
 *
 * provision-admin is the ONLY user-creating artifact allowed in production
 * (deploy-restructure-plan.md §7.3), so its guarantees are load-bearing:
 *  - it must refuse to run when an Admin Master already exists (idempotent by
 *    refusal, never by overwrite — a rerun must not rotate the real admin's
 *    credentials);
 *  - the reset link it prints must actually be consumable: the token row must
 *    carry the sha256 of the raw token embedded in the link;
 *  - a soft-deleted AM must NOT block provisioning — if the only AM was
 *    deleted, rerunning this script is the platform's only recovery path.
 *
 * Requires Docker (testcontainers). Run via:
 *   pnpm --filter backend exec vitest run --config vitest.integration-db.config.ts tests/integration/db/provision-admin.integration.test.ts
 */

import { createHash } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { provisionAdmin } from '../../../src/scripts/provision-admin';

let harness: DbHarness;

const BASE_URL = 'https://app.properfy.me';

beforeAll(async () => {
  harness = await setupDbHarness();
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await harness.prisma.$executeRawUnsafe(
    `TRUNCATE TABLE password_reset_tokens, audit_logs, users CASCADE`,
  );
});

describe('provisionAdmin', () => {
  it('creates the first AM with a consumable reset link', async () => {
    const result = await provisionAdmin(harness.prisma, {
      email: 'Owner@Client.com',
      baseUrl: BASE_URL,
    });

    expect(result.created).toBe(true);

    const user = await harness.prisma.user.findFirstOrThrow({
      where: { role: 'AM' },
    });
    // Cross-tenant role: belongs to no agency; email stored normalized.
    expect(user.tenant_id).toBeNull();
    expect(user.email).toBe('owner@client.com');
    expect(user.status).toBe('ACTIVE');

    // The throwaway password must be a real bcrypt hash, and unknowable —
    // nothing plaintext-ish should round-trip.
    expect(user.password_hash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare('Admin@1234', user.password_hash)).toBe(false);

    // Link embeds the raw token whose sha256 is what the DB stores — the
    // exact contract consume-password-reset validates.
    const token = new URL(result.resetLink!).searchParams.get('token')!;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const row = await harness.prisma.passwordResetToken.findFirstOrThrow({
      where: { user_id: user.id },
    });
    expect(row.token_hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(row.expires_at.getTime()).toBeGreaterThan(Date.now());

    const audit = await harness.prisma.auditLog.findFirstOrThrow({
      where: { entity_type: 'user', entity_id: user.id },
    });
    expect(audit.actor_type).toBe('SYSTEM');
  });

  it('refuses when an AM already exists, without touching it', async () => {
    const first = await provisionAdmin(harness.prisma, {
      email: 'owner@client.com',
      baseUrl: BASE_URL,
    });
    expect(first.created).toBe(true);
    const before = await harness.prisma.user.findFirstOrThrow({ where: { role: 'AM' } });

    const second = await provisionAdmin(harness.prisma, {
      email: 'intruder@example.com',
      baseUrl: BASE_URL,
    });

    expect(second.created).toBe(false);
    expect(second.reason).toBe('AM_EXISTS');
    expect(await harness.prisma.user.count({ where: { role: 'AM' } })).toBe(1);
    const after = await harness.prisma.user.findFirstOrThrow({ where: { role: 'AM' } });
    expect(after.password_hash).toBe(before.password_hash);
  });

  it('allows provisioning again when the only AM is soft-deleted', async () => {
    const first = await provisionAdmin(harness.prisma, {
      email: 'owner@client.com',
      baseUrl: BASE_URL,
    });
    expect(first.created).toBe(true);
    await harness.prisma.user.updateMany({
      where: { role: 'AM' },
      data: { deleted_at: new Date() },
    });

    const again = await provisionAdmin(harness.prisma, {
      email: 'owner2@client.com',
      baseUrl: BASE_URL,
    });

    expect(again.created).toBe(true);
    expect(
      await harness.prisma.user.count({ where: { role: 'AM', deleted_at: null } }),
    ).toBe(1);
  });

  it('rejects an invalid email without writing anything', async () => {
    const result = await provisionAdmin(harness.prisma, {
      email: 'not-an-email',
      baseUrl: BASE_URL,
    });

    expect(result.created).toBe(false);
    expect(result.reason).toBe('INVALID_EMAIL');
    expect(await harness.prisma.user.count()).toBe(0);
  });
});
