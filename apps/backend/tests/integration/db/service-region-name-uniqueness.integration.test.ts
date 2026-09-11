/**
 * Real-database case-insensitive name uniqueness for service regions (#614).
 *
 * Proves the functional unique index (tenant_id, lower(name)) exists and that a
 * case-variant collision surfaces as the domain ServiceRegionNameConflictError,
 * not a raw Prisma/Postgres error — for both the update path (use case, whose
 * app-level pre-check was removed) and the raw save() backstop.
 *
 * Run via: `pnpm --filter backend exec vitest run --config vitest.integration-db.config.ts tests/integration/db/service-region-name-uniqueness.integration.test.ts`
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import {
  seedTenant,
  seedServiceRegion,
  resetServiceRegionTables,
  SYDNEY_POLYGON_GEOJSON,
} from '../service-region/helpers/service-region-fixtures';
import { PrismaServiceRegionRepository } from '../../../src/modules/service-region/infrastructure/prisma-service-region.repository';
import { UpdateServiceRegionUseCase } from '../../../src/modules/service-region/application/use-cases/update-service-region.use-case';
import { ServiceRegionEntity } from '../../../src/modules/service-region/domain/service-region.entity';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { ServiceRegionNameConflictError } from '../../../src/modules/service-region/domain/service-region.errors';
import type { AuthContext } from '@properfy/shared';

function silentAuditService() {
  return { log: () => {} } as any;
}

let harness: DbHarness;
let repo: PrismaServiceRegionRepository;
let authorizationService: AuthorizationService;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaServiceRegionRepository(harness.prisma);
  authorizationService = new AuthorizationService(silentAuditService());
  // Container boot + `migrate deploy` can exceed 120s on a loaded machine.
}, 240_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await resetServiceRegionTables(harness.prisma);
});

function makeActor(tenantId: string, userId: string): AuthContext {
  return { userId, tenantId, role: 'AM', branchId: null, inspectorId: null };
}

describe('#614 — case-insensitive service region name uniqueness', () => {
  it('update to a case-variant of an existing name throws ServiceRegionNameConflictError', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'CI Name Tenant A');
    await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'North Shore',
      geojson: SYDNEY_POLYGON_GEOJSON,
      status: 'ACTIVE',
    });
    const { regionId: otherId } = await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Southside',
      geojson: SYDNEY_POLYGON_GEOJSON,
      status: 'ACTIVE',
    });

    const updateUseCase = new UpdateServiceRegionUseCase(repo, silentAuditService(), authorizationService);

    await expect(
      updateUseCase.execute({
        regionId: otherId,
        name: 'north shore',
        actor: makeActor(tenantId, userId),
      }),
    ).rejects.toBeInstanceOf(ServiceRegionNameConflictError);
  });

  it('raw save() of a case-variant duplicate surfaces the domain conflict error (backstop)', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'CI Name Tenant B');
    await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Eastern Suburbs',
      geojson: SYDNEY_POLYGON_GEOJSON,
      status: 'ACTIVE',
    });

    const dup = new ServiceRegionEntity({
      id: randomUUID(),
      tenantId,
      name: 'eastern suburbs',
      geojson: SYDNEY_POLYGON_GEOJSON as Record<string, unknown>,
      color: '#3b82f6',
      status: 'ACTIVE',
      createdByUserId: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(repo.save(dup)).rejects.toBeInstanceOf(ServiceRegionNameConflictError);
  });

  it('allows the same name under a different tenant (index is tenant-scoped)', async () => {
    const { tenantId: tenantA } = await seedTenant(harness.prisma, 'CI Name Tenant C');
    const { tenantId: tenantB, userId: userB } = await seedTenant(harness.prisma, 'CI Name Tenant D');
    await seedServiceRegion(harness.prisma, {
      tenantId: tenantA,
      name: 'Inner West',
      geojson: SYDNEY_POLYGON_GEOJSON,
      status: 'ACTIVE',
    });

    const sameNameOtherTenant = new ServiceRegionEntity({
      id: randomUUID(),
      tenantId: tenantB,
      name: 'inner west',
      geojson: SYDNEY_POLYGON_GEOJSON as Record<string, unknown>,
      color: '#3b82f6',
      status: 'ACTIVE',
      createdByUserId: userB,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(repo.save(sameNameOtherTenant)).resolves.toBeUndefined();
  });
});
