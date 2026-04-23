/**
 * Real-database audit verification tests for service-region write paths.
 *
 * Covers T191: every region write operation produces exactly one audit record.
 *
 * These tests use the use cases directly (not HTTP) against a real DB.
 * Because `PersistentAuditService.log()` is fire-and-forget (the DB write
 * is scheduled as a background promise), we poll for the log record rather
 * than relying on microtask-flush tricks.
 *
 * Run via: `pnpm --filter backend test:integration:db`
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import {
  seedTenant,
  seedServiceRegion,
  resetServiceRegionTables,
  SYDNEY_POLYGON_GEOJSON,
} from '../service-region/helpers/service-region-fixtures';
import { PrismaServiceRegionRepository } from '../../../src/modules/service-region/infrastructure/prisma-service-region.repository';
import { PrismaAuditLogRepository } from '../../../src/modules/audit/infrastructure/prisma-audit-log.repository';
import { PersistentAuditService } from '../../../src/modules/audit/application/services/persistent-audit.service';
import { CreateServiceRegionUseCase } from '../../../src/modules/service-region/application/use-cases/create-service-region.use-case';
import { UpdateServiceRegionUseCase } from '../../../src/modules/service-region/application/use-cases/update-service-region.use-case';
import { DeactivateServiceRegionUseCase } from '../../../src/modules/service-region/application/use-cases/deactivate-service-region.use-case';
import { DeleteServiceRegionUseCase } from '../../../src/modules/service-region/application/use-cases/delete-service-region.use-case';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuthContext } from '@properfy/shared';
import type { PrismaClient } from '@prisma/client';

function silentLogger() {
  return {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
    fatal: () => {},
    trace: () => {},
    child: () => silentLogger(),
    silent: () => {},
    level: 'silent',
  } as any;
}

/**
 * Polls for an audit log matching `where` until it appears or `maxWaitMs`
 * elapses.  `PersistentAuditService.log()` is fire-and-forget so the DB write
 * may not be visible immediately after the use case returns.
 */
async function waitForAuditLog(
  prisma: PrismaClient,
  where: Parameters<PrismaClient['auditLog']['findMany']>[0]['where'],
  maxWaitMs = 5000,
) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const logs = await prisma.auditLog.findMany({ where });
    if (logs.length > 0) return logs;
    await new Promise((r) => setTimeout(r, 50));
  }
  return prisma.auditLog.findMany({ where });
}

let harness: DbHarness;
let repo: PrismaServiceRegionRepository;
let auditService: PersistentAuditService;
let authorizationService: AuthorizationService;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaServiceRegionRepository(harness.prisma);
  const auditLogRepo = new PrismaAuditLogRepository(harness.prisma);
  auditService = new PersistentAuditService(auditLogRepo, silentLogger());
  authorizationService = new AuthorizationService(auditService);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await resetServiceRegionTables(harness.prisma);
  await harness.prisma.$executeRawUnsafe(`TRUNCATE TABLE "audit_logs" CASCADE`);
  await harness.prisma.$executeRawUnsafe(`TRUNCATE TABLE "audit_logs_archive" CASCADE`);
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

describe('T191 — every write path produces exactly one audit record', () => {
  it('create region → one audit record (service_region.created)', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Audit Create Tenant');
    const actor = makeActor(tenantId, userId);

    const useCase = new CreateServiceRegionUseCase(repo, auditService, authorizationService);
    const result = await useCase.execute({
      name: 'Audit Test Region',
      geojson: SYDNEY_POLYGON_GEOJSON,
      actor,
    });

    const logs = await waitForAuditLog(harness.prisma, { entity_id: result.id });

    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('service_region.created');
    expect(logs[0].actor_id).toBe(userId);
    expect(logs[0].entity_type).toBe('ServiceRegion');
    expect(logs[0].before_json).toBeNull();
    expect(logs[0].after_json).not.toBeNull();
  });

  it('update region → one audit record (service_region.updated)', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Audit Update Tenant');
    const actor = makeActor(tenantId, userId);

    const { regionId } = await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Original Name',
      geojson: SYDNEY_POLYGON_GEOJSON,
    });

    const useCase = new UpdateServiceRegionUseCase(repo, auditService, authorizationService);
    await useCase.execute({
      regionId,
      name: 'Updated Name',
      actor,
    });

    const logs = await waitForAuditLog(harness.prisma, { entity_id: regionId, action: 'service_region.updated' });

    expect(logs).toHaveLength(1);
    expect(logs[0].actor_id).toBe(userId);
    expect(logs[0].before_json).not.toBeNull();
    expect(logs[0].after_json).not.toBeNull();
  });

  it('deactivate region → one audit record with reason (service_region.deactivated)', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Audit Deactivate Tenant');
    const actor = makeActor(tenantId, userId);

    const { regionId } = await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Region To Deactivate',
      geojson: SYDNEY_POLYGON_GEOJSON,
    });

    const useCase = new DeactivateServiceRegionUseCase(repo, auditService, authorizationService);
    await useCase.execute({
      regionId,
      reason: 'No longer needed',
      actor,
    });

    const logs = await waitForAuditLog(harness.prisma, { entity_id: regionId, action: 'service_region.deactivated' });

    expect(logs).toHaveLength(1);
    expect(logs[0].actor_id).toBe(userId);
    expect(logs[0].reason).toBe('No longer needed');
    expect(logs[0].before_json).not.toBeNull();
    expect(logs[0].after_json).not.toBeNull();
  });

  it('delete region → one audit record (service_region.deleted)', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Audit Delete Tenant');
    const actor = makeActor(tenantId, userId);

    const { regionId } = await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Region To Delete',
      geojson: SYDNEY_POLYGON_GEOJSON,
      status: 'INACTIVE',
    });

    const useCase = new DeleteServiceRegionUseCase(repo, auditService, authorizationService);
    await useCase.execute({
      regionId,
      actor,
    });

    const logs = await waitForAuditLog(harness.prisma, { entity_id: regionId, action: 'service_region.deleted' });

    expect(logs).toHaveLength(1);
    expect(logs[0].actor_id).toBe(userId);
    expect(logs[0].before_json).not.toBeNull();
    expect(logs[0].after_json).toBeNull();
  });

  it('exactly ONE audit record per write — not zero, not two', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Audit Exactly One Tenant');
    const actor = makeActor(tenantId, userId);

    const useCase = new CreateServiceRegionUseCase(repo, auditService, authorizationService);
    const result = await useCase.execute({
      name: 'Single Audit Region',
      geojson: SYDNEY_POLYGON_GEOJSON,
      actor,
    });

    const allLogs = await waitForAuditLog(harness.prisma, { entity_id: result.id });

    expect(allLogs).toHaveLength(1);
    expect(allLogs[0].entity_id).toBe(result.id);
  });
});
