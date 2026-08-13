/**
 * Real-database test for PrismaUserManagementRepository.findActiveByRoles —
 * the fan-out source for platform alerts (stuck-inspection emails to OP/AM).
 * The worker unit tests mock the repository, so only this proves the Prisma
 * filter actually excludes inactive, deleted and other-role users.
 *
 * Run via: `pnpm --filter backend test:integration:db`
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaUserManagementRepository } from '../../../src/modules/user/infrastructure/prisma-user-management.repository';

let harness: DbHarness;
let repo: PrismaUserManagementRepository;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaUserManagementRepository(harness.prisma);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

async function seedUser(input: {
  role: 'AM' | 'OP' | 'INSP';
  email: string;
  status?: 'ACTIVE' | 'INACTIVE';
  deletedAt?: Date | null;
}): Promise<void> {
  await harness.prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      tenant_id: null,
      branch_id: null,
      role: input.role,
      name: `User ${input.email}`,
      email: input.email,
      phone: null,
      status: input.status ?? 'ACTIVE',
      password_hash: 'not-a-real-hash',
      totp_enabled: false,
      failed_login_count: 0,
      deleted_at: input.deletedAt ?? null,
    },
  });
}

describe('PrismaUserManagementRepository.findActiveByRoles', () => {
  it('returns only active, non-deleted users of the requested roles', async () => {
    await seedUser({ role: 'AM', email: 'far-am@x.com' });
    await seedUser({ role: 'OP', email: 'far-op@x.com' });
    await seedUser({ role: 'OP', email: 'far-op-inactive@x.com', status: 'INACTIVE' });
    await seedUser({ role: 'AM', email: 'far-am-deleted@x.com', deletedAt: new Date() });
    await seedUser({ role: 'INSP', email: 'far-insp@x.com' });

    const users = await repo.findActiveByRoles(['OP', 'AM']);
    const emails = users.map((u) => u.email).filter((e) => e.startsWith('far-'));

    expect(emails.sort()).toEqual(['far-am@x.com', 'far-op@x.com']);
  });
});
