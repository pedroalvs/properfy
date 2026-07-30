/**
 * Real-database test for the inspector -> login account link.
 *
 * The unit tests for CreateInspectorUseCase mock IInspectorRepository, so they
 * cannot see whether `user_id` actually reaches the row. It did not:
 * PrismaInspectorRepository.save() built its `data` field by field and omitted
 * `user_id` entirely. That was invisible while inspectors had an unusable
 * random password — nobody could log in, so nobody noticed the link was
 * missing. With an operator-set password it breaks two things:
 *   - login succeeds but the JWT carries inspectorId: null, so every
 *     inspector-scoped PWA route 403s;
 *   - ResetInspectorPasswordUseCase throws INSPECTOR_NO_LOGIN_ACCOUNT for
 *     every freshly created inspector.
 *
 * Run via: `pnpm --filter backend test:integration:db`
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaInspectorRepository } from '../../../src/modules/inspector/infrastructure/prisma-inspector.repository';
import { PrismaUserManagementRepository } from '../../../src/modules/user/infrastructure/prisma-user-management.repository';
import { CreateInspectorUseCase } from '../../../src/modules/inspector/application/use-cases/create-inspector.use-case';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';

let harness: DbHarness;
let repo: PrismaInspectorRepository;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaInspectorRepository(harness.prisma);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

async function seedInspUser(email: string): Promise<string> {
  const userId = crypto.randomUUID();
  await harness.prisma.user.create({
    data: {
      id: userId,
      tenant_id: null,
      branch_id: null,
      role: 'INSP',
      name: 'Linked Inspector',
      email,
      phone: null,
      status: 'ACTIVE',
      password_hash: await bcrypt.hash('Insp@2026x', 4),
      totp_enabled: false,
      failed_login_count: 0,
    },
  });
  return userId;
}

function makeInspector(userId: string | null, email: string): InspectorEntity {
  const now = new Date();
  return new InspectorEntity({
    id: crypto.randomUUID(),
    userId,
    name: 'Linked Inspector',
    email,
    phone: null,
    status: 'ACTIVE',
    paymentSettingsJson: {},
    serviceTypesJson: [],
    blockedClientsJson: [],
    fullName: null,
    address: null,
    abn: null,
    dateOfBirth: null,
    insuranceFileKey: null,
    insuranceExpiresAt: null,
    policeCheckFileKey: null,
    policeCheckExpiresAt: null,
    insuranceMetaJson: null,
    policeCheckMetaJson: null,
    photoStorageKey: null,
    availabilityTemplateJson: {},
    billingCycle: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
}

describe('CreateInspectorUseCase against real Postgres', () => {
  it('produces a login account whose stored hash verifies against the operator password', async () => {
    // The whole PR exists because nobody could log in and nobody noticed. The
    // unit tests mock both the repository and bcrypt, and the cases above seed
    // the user row by hand — so this is the only place that exercises create end
    // to end and proves the credential actually works.
    const email = `e2e-${crypto.randomUUID()}@inspect.com`;
    const password = 'Insp@2026x';
    const auditService = { log: () => undefined } as unknown as AuditService;
    const userRepo = new PrismaUserManagementRepository(harness.prisma);

    const useCase = new CreateInspectorUseCase(
      repo,
      userRepo,
      auditService,
      undefined,
      new AuthorizationService(auditService),
    );

    const created = await useCase.execute({
      name: 'E2E Inspector',
      email,
      password,
      actor: {
        userId: crypto.randomUUID(),
        tenantId: null,
        role: 'AM',
        branchId: null,
        inspectorId: null,
      },
    });

    const userRow = await harness.prisma.user.findFirst({
      where: { email },
      select: { id: true, role: true, tenant_id: true, status: true, password_hash: true },
    });

    expect(userRow?.role).toBe('INSP');
    expect(userRow?.tenant_id).toBeNull();
    expect(userRow?.status).toBe('ACTIVE');
    expect(userRow?.password_hash).not.toBe(password);
    await expect(bcrypt.compare(password, userRow!.password_hash)).resolves.toBe(true);

    // And the link login depends on resolves back to the created inspector.
    const linked = await repo.findByUserId(userRow!.id);
    expect(linked?.id).toBe(created.id);
  }, 60_000);

  it('lowercases the stored email so the login identity matches', async () => {
    const local = `case-${crypto.randomUUID()}`;
    const auditService = { log: () => undefined } as unknown as AuditService;
    const useCase = new CreateInspectorUseCase(
      repo,
      new PrismaUserManagementRepository(harness.prisma),
      auditService,
      undefined,
      new AuthorizationService(auditService),
    );

    await useCase.execute({
      name: 'Case Inspector',
      email: `${local}@Inspect.COM`.toLowerCase(),
      password: 'Insp@2026x',
      actor: {
        userId: crypto.randomUUID(),
        tenantId: null,
        role: 'AM',
        branchId: null,
        inspectorId: null,
      },
    });

    const userRow = await harness.prisma.user.findFirst({
      where: { email: `${local}@inspect.com` },
      select: { email: true },
    });
    expect(userRow?.email).toBe(`${local}@inspect.com`);
  }, 60_000);
});

describe('PrismaInspectorRepository.save — login account link', () => {
  it('persists user_id so the inspector resolves from their login account', async () => {
    const email = `link-${crypto.randomUUID()}@inspect.com`;
    const userId = await seedInspUser(email);

    await repo.save(makeInspector(userId, email));

    const row = await harness.prisma.inspector.findFirst({
      where: { email },
      select: { id: true, user_id: true },
    });
    expect(row?.user_id).toBe(userId);
  });

  it('findByUserId resolves the saved inspector — the lookup login depends on', async () => {
    const email = `lookup-${crypto.randomUUID()}@inspect.com`;
    const userId = await seedInspUser(email);
    const inspector = makeInspector(userId, email);

    await repo.save(inspector);

    const found = await repo.findByUserId(userId);
    expect(found?.id).toBe(inspector.id);
    expect(found?.userId).toBe(userId);
  });

  it('still saves an inspector with no login account', async () => {
    const email = `nolink-${crypto.randomUUID()}@inspect.com`;
    const inspector = makeInspector(null, email);

    await repo.save(inspector);

    const row = await harness.prisma.inspector.findFirst({
      where: { email },
      select: { user_id: true },
    });
    expect(row?.user_id).toBeNull();
  });
});
