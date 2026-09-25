/**
 * Real-database RBAC test for cross-tenant OP management of agency users
 * (BUG-6 / CORRECTION-001). The route/integration RBAC suites mock the use
 * cases, so only this proves the *real* use case + Prisma repo let an OP
 * (tenant-less, cross-tenant) update and deactivate an agency user that lives
 * in a tenant the OP does not belong to — while a CL_ADMIN of another tenant
 * is still rejected.
 *
 * Run via: `pnpm --filter backend test:integration:db`
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaUserManagementRepository } from '../../../src/modules/user/infrastructure/prisma-user-management.repository';
import { PrismaTenantRepository } from '../../../src/modules/tenant/infrastructure/prisma-tenant.repository';
import { PrismaBranchRepository } from '../../../src/modules/tenant/infrastructure/prisma-branch.repository';
import { UpdateUserUseCase } from '../../../src/modules/user/application/use-cases/update-user.use-case';
import { DeactivateUserUseCase } from '../../../src/modules/user/application/use-cases/deactivate-user.use-case';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { ForbiddenError } from '../../../src/shared/domain/errors';

let harness: DbHarness;
let updateUser: UpdateUserUseCase;
let deactivateUser: DeactivateUserUseCase;

// Two distinct agencies. The OP belongs to neither (tenant-less).
const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const opActor: AuthContext = {
  userId: 'op-actor-1',
  tenantId: null,
  role: 'OP',
  branchId: null,
  inspectorId: null,
};

const clAdminOfAActor: AuthContext = {
  userId: 'cl-admin-a-1',
  tenantId: TENANT_A,
  role: 'CL_ADMIN',
  branchId: null,
  inspectorId: null,
};

async function seedTenant(id: string, suffix: string): Promise<void> {
  await harness.prisma.tenant.create({
    data: {
      id,
      name: `Agency ${suffix}`,
      legal_name: `Agency ${suffix} Pty Ltd`,
      status: 'ACTIVE',
      settings_json: { allowClientUserManagement: true },
    },
  });
}

async function seedAgencyUser(id: string, tenantId: string, email: string): Promise<void> {
  await harness.prisma.user.create({
    data: {
      id,
      tenant_id: tenantId,
      branch_id: null,
      role: 'CL_USER',
      name: `User ${email}`,
      email,
      phone: null,
      status: 'ACTIVE',
      password_hash: 'not-a-real-hash',
      totp_enabled: false,
      failed_login_count: 0,
    },
  });
}

beforeAll(async () => {
  harness = await setupDbHarness();
  const userRepo = new PrismaUserManagementRepository(harness.prisma);
  const tenantRepo = new PrismaTenantRepository(harness.prisma);
  const branchRepo = new PrismaBranchRepository(harness.prisma);
  // Audit is not the subject here; a no-op sink keeps the wiring real without
  // touching the audit tables.
  const auditService = { log: () => {} } as unknown as AuditService;
  const authorizationService = new AuthorizationService(auditService);

  updateUser = new UpdateUserUseCase(
    userRepo,
    tenantRepo,
    branchRepo,
    auditService,
    authorizationService,
  );
  deactivateUser = new DeactivateUserUseCase(
    userRepo,
    tenantRepo,
    auditService,
    authorizationService,
    harness.prisma,
  );

  await seedTenant(TENANT_A, 'A');
  await seedTenant(TENANT_B, 'B');
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  // Reset user rows between tests; tenants persist for the container lifecycle.
  await harness.prisma.user.deleteMany({});
});

describe('User management RBAC (real DB) — OP cross-tenant over agency users', () => {
  it('lets an OP update an agency user in a tenant it does not belong to', async () => {
    const userId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await seedAgencyUser(userId, TENANT_B, 'target-b@example.com');

    const result = await updateUser.execute({
      tenantId: TENANT_B,
      userId,
      data: { name: 'Renamed By OP' },
      actor: opActor,
    });

    expect(result.name).toBe('Renamed By OP');

    const row = await harness.prisma.user.findUnique({ where: { id: userId } });
    expect(row?.name).toBe('Renamed By OP');
    expect(row?.tenant_id).toBe(TENANT_B);
  });

  it('lets an OP deactivate an agency user in a tenant it does not belong to', async () => {
    const userId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await seedAgencyUser(userId, TENANT_B, 'deactivate-b@example.com');

    await deactivateUser.execute({
      tenantId: TENANT_B,
      userId,
      reason: 'Offboarded by operations',
      actor: opActor,
    });

    const row = await harness.prisma.user.findUnique({ where: { id: userId } });
    expect(row?.status).toBe('INACTIVE');
    // Deactivation must NOT soft-delete — the row stays visible as "Inactive".
    expect(row?.deleted_at).toBeNull();
  });

  it('rejects a CL_ADMIN updating an agency user in another tenant', async () => {
    const userId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    await seedAgencyUser(userId, TENANT_B, 'target-b2@example.com');

    await expect(
      updateUser.execute({
        tenantId: TENANT_B,
        userId,
        data: { name: 'Should Not Persist' },
        actor: clAdminOfAActor,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const row = await harness.prisma.user.findUnique({ where: { id: userId } });
    expect(row?.name).toBe('User target-b2@example.com');
  });

  it('rejects a CL_ADMIN deactivating an agency user in another tenant', async () => {
    const userId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    await seedAgencyUser(userId, TENANT_B, 'deactivate-b2@example.com');

    await expect(
      deactivateUser.execute({
        tenantId: TENANT_B,
        userId,
        reason: 'Not allowed',
        actor: clAdminOfAActor,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const row = await harness.prisma.user.findUnique({ where: { id: userId } });
    expect(row?.status).toBe('ACTIVE');
  });
});
