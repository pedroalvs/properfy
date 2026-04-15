import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditRetentionWorker } from '../../../src/modules/audit/infrastructure/workers/audit-retention.worker';
import { AuditLogEntity } from '../../../src/modules/audit/domain/audit-log.entity';
import { AuditRetentionCategoryConfigEntity } from '../../../src/modules/audit/domain/audit-retention-category.entity';
import { AuditLegalHoldEntity } from '../../../src/modules/audit/domain/audit-legal-hold.entity';
import type { IAuditLogRepository } from '../../../src/modules/audit/domain/audit-log.repository';
import type { IAuditRetentionCategoryRepository } from '../../../src/modules/audit/domain/audit-retention-category.repository';
import type { IAuditLegalHoldRepository } from '../../../src/modules/audit/domain/audit-legal-hold.repository';
import type { IAuditPreservationRuleRepository } from '../../../src/modules/audit/domain/audit-preservation-rule.repository';
import type { PersistentAuditService } from '../../../src/modules/audit/application/services/persistent-audit.service';
import type { Logger } from '../../../src/shared/infrastructure/logger';

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    silent: vi.fn(),
    level: 'info',
  } as unknown as Logger;
}

function makePrisma(appointmentStub: { done_checked_at: Date | null } | null = null) {
  return {
    appointment: {
      findUnique: vi.fn().mockResolvedValue(appointmentStub),
    },
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        $queryRawUnsafe: vi.fn().mockResolvedValue([]),
        $executeRawUnsafe: vi.fn().mockResolvedValue(0),
      });
    }),
  };
}

function makeAuditLogRepo(): IAuditLogRepository {
  return {
    save: vi.fn(),
    saveMany: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    findById: vi.fn(),
    findByIds: vi.fn(),
    updateRedactionStatus: vi.fn(),
    updateRedactedSnapshots: vi.fn(),
    moveToCold: vi.fn().mockResolvedValue(0),
    hardDeleteFromArchive: vi.fn().mockResolvedValue(0),
    findEligibleForRetention: vi.fn().mockResolvedValue([]),
    searchPiiByValues: vi.fn(),
  };
}

function makeCategoryRepo(categories: AuditRetentionCategoryConfigEntity[]): IAuditRetentionCategoryRepository {
  return {
    findAll: vi.fn().mockResolvedValue(categories),
    findByName: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  };
}

function makeLegalHoldRepo(holds: AuditLegalHoldEntity[] = []): IAuditLegalHoldRepository {
  return {
    findAllActive: vi.fn().mockResolvedValue(holds),
    findById: vi.fn(),
    findByEntity: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  };
}

function makePreservationRuleRepo(): IAuditPreservationRuleRepository {
  return {
    findAllActive: vi.fn().mockResolvedValue([]),
    findById: vi.fn(),
    findByType: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  };
}

function makeAuditService(): PersistentAuditService {
  return {
    log: vi.fn(),
  } as unknown as PersistentAuditService;
}

function makeCategory(
  name: 'FINANCIAL' | 'OPERATIONAL_CRITICAL' | 'OPERATIONAL_GENERAL',
  retentionYears: number,
  hardDeleteEnabled = false,
): AuditRetentionCategoryConfigEntity {
  return new AuditRetentionCategoryConfigEntity({
    id: `cat-${name}`,
    name,
    retentionYears,
    hardDeleteEnabled,
    description: null,
    actionPatterns: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeEntry(overrides: Partial<{
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  retentionCategory: 'FINANCIAL' | 'OPERATIONAL_CRITICAL' | 'OPERATIONAL_GENERAL' | null;
  redactionStatus: 'NONE' | 'IN_PROGRESS' | 'PARTIAL' | 'FULL';
}> = {}): AuditLogEntity {
  return new AuditLogEntity({
    id: overrides.id ?? `entry-${Math.random()}`,
    tenantId: null,
    actorType: 'SYSTEM',
    actorId: null,
    entityType: overrides.entityType ?? 'Generic',
    entityId: overrides.entityId ?? null,
    action: overrides.action ?? 'generic.action',
    reason: null,
    beforeJson: null,
    afterJson: null,
    requestId: null,
    ipAddress: null,
    metadataJson: null,
    createdAt: new Date('2020-01-01T00:00:00Z'),
    retentionCategory: overrides.retentionCategory ?? 'OPERATIONAL_GENERAL',
    redactionStatus: overrides.redactionStatus ?? 'NONE',
    coldStorage: false,
    preservationRuleId: null,
  });
}

describe('AuditRetentionWorker (Feature 020 reshape)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let auditLogRepo: IAuditLogRepository;
  let categoryRepo: IAuditRetentionCategoryRepository;
  let legalHoldRepo: IAuditLegalHoldRepository;
  let preservationRuleRepo: IAuditPreservationRuleRepository;
  let auditService: PersistentAuditService;
  let logger: Logger;
  let worker: AuditRetentionWorker;

  function build({ categories }: { categories: AuditRetentionCategoryConfigEntity[] }) {
    prisma = makePrisma();
    auditLogRepo = makeAuditLogRepo();
    categoryRepo = makeCategoryRepo(categories);
    legalHoldRepo = makeLegalHoldRepo();
    preservationRuleRepo = makePreservationRuleRepo();
    auditService = makeAuditService();
    logger = makeLogger();
    worker = new AuditRetentionWorker(
      prisma as any,
      auditLogRepo,
      categoryRepo,
      legalHoldRepo,
      preservationRuleRepo,
      auditService,
      logger,
      1000,
    );
  }

  beforeEach(() => {
    build({ categories: [] });
  });

  it('returns zero counts when no category config exists', async () => {
    build({ categories: [] });
    const result = await worker.execute();
    expect(result.movedCount).toBe(0);
    expect(result.preservedCount).toBe(0);
    expect(result.hardDeletedCount).toBe(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('moves eligible entries hot → cold when past retention cutoff', async () => {
    const category = makeCategory('OPERATIONAL_GENERAL', 2);
    build({ categories: [category] });

    const batch = [
      makeEntry({ id: 'e1', retentionCategory: 'OPERATIONAL_GENERAL' }),
      makeEntry({ id: 'e2', retentionCategory: 'OPERATIONAL_GENERAL' }),
    ];
    (auditLogRepo.findEligibleForRetention as any)
      .mockResolvedValueOnce(batch)
      .mockResolvedValueOnce([]);
    (auditLogRepo.moveToCold as any).mockResolvedValueOnce(2);

    const result = await worker.execute();

    expect(result.movedCount).toBe(2);
    expect(result.preservedCount).toBe(0);
    expect(auditLogRepo.moveToCold).toHaveBeenCalledWith(['e1', 'e2']);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'audit.retention_run_completed' }),
    );
  });

  it('preserves cross-check-protected appointment.statusTransition entries (FR-008)', async () => {
    const category = makeCategory('OPERATIONAL_CRITICAL', 5);
    build({ categories: [category] });

    // One protected (done_checked_at NULL) + one unprotected (done_checked_at set)
    prisma.appointment.findUnique
      .mockResolvedValueOnce({ done_checked_at: null }) // protected
      .mockResolvedValueOnce({ done_checked_at: new Date() }); // not protected

    const batch = [
      makeEntry({
        id: 'prot',
        action: 'appointment.statusTransition',
        entityType: 'Appointment',
        entityId: 'appt-1',
        retentionCategory: 'OPERATIONAL_CRITICAL',
      }),
      makeEntry({
        id: 'ok',
        action: 'appointment.statusTransition',
        entityType: 'Appointment',
        entityId: 'appt-2',
        retentionCategory: 'OPERATIONAL_CRITICAL',
      }),
    ];
    (auditLogRepo.findEligibleForRetention as any)
      .mockResolvedValueOnce(batch)
      .mockResolvedValueOnce([]);
    (auditLogRepo.moveToCold as any).mockResolvedValueOnce(1);

    const result = await worker.execute();

    expect(result.preservedCount).toBe(1);
    expect(result.preservedByRule.crossCheck).toBe(1);
    expect(result.movedCount).toBe(1);
    expect(auditLogRepo.moveToCold).toHaveBeenCalledWith(['ok']);
  });

  it('preserves entries covered by an active legal hold', async () => {
    const category = makeCategory('OPERATIONAL_GENERAL', 2);
    const hold = new AuditLegalHoldEntity({
      id: 'h1',
      entityType: 'Property',
      entityId: 'prop-1',
      tenantId: null,
      reason: 'dispute',
      placedByUserId: 'u1',
      placedAt: new Date(),
      releasedByUserId: null,
      releasedAt: null,
      isActive: true,
    });
    prisma = makePrisma();
    auditLogRepo = makeAuditLogRepo();
    categoryRepo = makeCategoryRepo([category]);
    legalHoldRepo = makeLegalHoldRepo([hold]);
    preservationRuleRepo = makePreservationRuleRepo();
    auditService = makeAuditService();
    logger = makeLogger();
    worker = new AuditRetentionWorker(
      prisma as any,
      auditLogRepo,
      categoryRepo,
      legalHoldRepo,
      preservationRuleRepo,
      auditService,
      logger,
      1000,
    );

    const batch = [
      makeEntry({
        id: 'held',
        entityType: 'Property',
        entityId: 'prop-1',
        retentionCategory: 'OPERATIONAL_GENERAL',
      }),
      makeEntry({
        id: 'free',
        entityType: 'Property',
        entityId: 'prop-2',
        retentionCategory: 'OPERATIONAL_GENERAL',
      }),
    ];
    (auditLogRepo.findEligibleForRetention as any)
      .mockResolvedValueOnce(batch)
      .mockResolvedValueOnce([]);
    (auditLogRepo.moveToCold as any).mockResolvedValueOnce(1);

    const result = await worker.execute();

    expect(result.preservedCount).toBe(1);
    expect(result.preservedByRule.legalHold).toBe(1);
    expect(result.movedCount).toBe(1);
    expect(auditLogRepo.moveToCold).toHaveBeenCalledWith(['free']);
  });

  it('skips rows flagged IN_PROGRESS (redaction concurrency guard)', async () => {
    const category = makeCategory('OPERATIONAL_GENERAL', 2);
    build({ categories: [category] });

    const batch = [
      makeEntry({ id: 'busy', redactionStatus: 'IN_PROGRESS' }),
      makeEntry({ id: 'ready', redactionStatus: 'NONE' }),
    ];
    (auditLogRepo.findEligibleForRetention as any)
      .mockResolvedValueOnce(batch)
      .mockResolvedValueOnce([]);
    (auditLogRepo.moveToCold as any).mockResolvedValueOnce(1);

    const result = await worker.execute();

    expect(result.skippedInProgressCount).toBe(1);
    expect(result.movedCount).toBe(1);
    expect(auditLogRepo.moveToCold).toHaveBeenCalledWith(['ready']);
  });

  it('uses 7-year retention for FINANCIAL category (FR-033)', async () => {
    const category = makeCategory('FINANCIAL', 7);
    build({ categories: [category] });

    (auditLogRepo.findEligibleForRetention as any).mockResolvedValueOnce([]);
    const now = new Date('2030-01-01T00:00:00Z');

    await worker.execute(now);

    const callArgs = (auditLogRepo.findEligibleForRetention as any).mock.calls[0];
    const cutoffDate = callArgs[1] as Date;
    // 7 years ago from 2030-01-01 → approximately 2023-01-01
    expect(cutoffDate.getFullYear()).toBe(2023);
  });

  it('does not run hard-delete when category has hardDeleteEnabled = false (FR-034)', async () => {
    const category = makeCategory('OPERATIONAL_GENERAL', 2, false);
    build({ categories: [category] });

    (auditLogRepo.findEligibleForRetention as any).mockResolvedValueOnce([]);

    const result = await worker.execute();

    expect(result.hardDeletedCount).toBe(0);
    expect(auditLogRepo.hardDeleteFromArchive).not.toHaveBeenCalled();
  });

  it('emits a self-audit entry with run summary (FR-028)', async () => {
    const category = makeCategory('OPERATIONAL_GENERAL', 2);
    build({ categories: [category] });

    (auditLogRepo.findEligibleForRetention as any).mockResolvedValueOnce([]);

    await worker.execute();

    expect(auditService.log).toHaveBeenCalledTimes(1);
    const call = (auditService.log as any).mock.calls[0][0];
    expect(call.action).toBe('audit.retention_run_completed');
    expect(call.entityType).toBe('AuditRetention');
    expect(call.metadata).toHaveProperty('movedCount');
    expect(call.metadata).toHaveProperty('preservedCount');
    expect(call.metadata).toHaveProperty('hardDeletedCount');
    expect(call.metadata).toHaveProperty('startedAtIso');
    expect(call.metadata).toHaveProperty('finishedAtIso');
  });
});
