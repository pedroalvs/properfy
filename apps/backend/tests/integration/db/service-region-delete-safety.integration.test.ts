/**
 * Real-database delete safety tests for service regions.
 *
 * Covers T184:
 *   - Cannot delete active region (ServiceRegionStillActiveError)
 *   - Cannot delete region with service group FK (SERVICE_REGION_IN_USE / Prisma FK violation)
 *   - Can delete inactive region with no references (cascade removes InspectorRegion rows)
 *
 * Run via: `pnpm --filter backend test:integration:db`
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import {
  seedTenant,
  seedServiceRegion,
  seedInspector,
  resetServiceRegionTables,
  SYDNEY_POLYGON_GEOJSON,
} from '../service-region/helpers/service-region-fixtures';
import { PrismaServiceRegionRepository } from '../../../src/modules/service-region/infrastructure/prisma-service-region.repository';
import { DeleteServiceRegionUseCase } from '../../../src/modules/service-region/application/use-cases/delete-service-region.use-case';
import { DeactivateServiceRegionUseCase } from '../../../src/modules/service-region/application/use-cases/deactivate-service-region.use-case';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { ServiceRegionStillActiveError } from '../../../src/modules/service-region/domain/service-region.errors';
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
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await resetServiceRegionTables(harness.prisma);
});

function makeActor(tenantId: string, userId: string): AuthContext {
  return {
    userId,
    tenantId,
    role: 'AM',
    branchId: null,
    inspectorId: null,
  };
}

describe('T184 — delete safety', () => {
  it('cannot delete an active region (ServiceRegionStillActiveError)', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Delete Safety Tenant A');
    const actor = makeActor(tenantId, userId);

    const { regionId } = await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Active Region',
      geojson: SYDNEY_POLYGON_GEOJSON,
      status: 'ACTIVE',
    });

    const useCase = new DeleteServiceRegionUseCase(repo, silentAuditService(), authorizationService);

    await expect(
      useCase.execute({ regionId, actor }),
    ).rejects.toThrow(ServiceRegionStillActiveError);

    // Region must still exist
    const still = await harness.prisma.serviceRegion.findFirst({ where: { id: regionId } });
    expect(still).not.toBeNull();
  });

  it('can delete an inactive region — cascades InspectorRegion rows', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Delete Safety Tenant B');
    const actor = makeActor(tenantId, userId);

    const { regionId } = await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Inactive Region',
      geojson: SYDNEY_POLYGON_GEOJSON,
      status: 'INACTIVE',
    });

    const { inspectorId } = await seedInspector(harness.prisma, 'Test Inspector');
    await repo.setInspectorRegions(inspectorId, [regionId]);

    // Verify assignment exists before delete
    const beforeDelete = await harness.prisma.inspectorRegion.findMany({
      where: { region_id: regionId },
    });
    expect(beforeDelete).toHaveLength(1);

    const useCase = new DeleteServiceRegionUseCase(repo, silentAuditService(), authorizationService);
    await useCase.execute({ regionId, actor });

    // Region should be gone
    const deleted = await harness.prisma.serviceRegion.findFirst({ where: { id: regionId } });
    expect(deleted).toBeNull();

    // InspectorRegion rows cascaded
    const afterDelete = await harness.prisma.inspectorRegion.findMany({
      where: { region_id: regionId },
    });
    expect(afterDelete).toHaveLength(0);
  });

  it('can delete after deactivation — full deactivate-then-delete flow', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Delete Safety Tenant C');
    const actor = makeActor(tenantId, userId);

    const { regionId } = await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Region For Full Flow',
      geojson: SYDNEY_POLYGON_GEOJSON,
      status: 'ACTIVE',
    });

    const deactivateUseCase = new DeactivateServiceRegionUseCase(repo, silentAuditService(), authorizationService);
    await deactivateUseCase.execute({ regionId, reason: 'Preparing for delete', actor });

    const deleteUseCase = new DeleteServiceRegionUseCase(repo, silentAuditService(), authorizationService);
    await deleteUseCase.execute({ regionId, actor });

    const deleted = await harness.prisma.serviceRegion.findFirst({ where: { id: regionId } });
    expect(deleted).toBeNull();
  });

  it('cannot delete region referenced by service group (FK constraint violation)', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Delete Safety Tenant D');
    const actor = makeActor(tenantId, userId);

    const { regionId } = await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Referenced Region',
      geojson: SYDNEY_POLYGON_GEOJSON,
      status: 'INACTIVE',
    });

    // Create a service type first (required for service group)
    const serviceType = await harness.prisma.serviceType.create({
      data: {
        code: `ST-DEL-${Math.random().toString(36).slice(2, 8)}`,
        name: 'Test Service Type',
        flow_type: 'ROUTINE',
        requires_tenant_confirmation: true,
        status: 'ACTIVE',
      },
    });

    const branch = await harness.prisma.branch.findFirst({ where: { tenant_id: tenantId } });
    if (!branch) throw new Error('Branch not found');

    // Create a service group that references this region
    await harness.prisma.serviceGroup.create({
      data: {
        tenant_id: tenantId,
        service_type_id: serviceType.id,
        service_region_id: regionId,
        status: 'DRAFT',
        group_size: 3,
        scheduled_date: new Date('2026-06-01'),
        time_window: '08:00-12:00',
        priority_mode: 'STANDARD',
        created_by_user_id: userId,
      },
    });

    const useCase = new DeleteServiceRegionUseCase(repo, silentAuditService(), authorizationService);

    // Should fail due to FK constraint (service_groups.service_region_id references this region)
    await expect(
      useCase.execute({ regionId, actor }),
    ).rejects.toThrow(); // FK violation from Prisma/PostgreSQL

    // Region must still exist
    const still = await harness.prisma.serviceRegion.findFirst({ where: { id: regionId } });
    expect(still).not.toBeNull();
  });
});
