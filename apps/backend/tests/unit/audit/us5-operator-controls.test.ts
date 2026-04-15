import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { UpsertRetentionCategoryUseCase } from '../../../src/modules/audit/application/use-cases/upsert-retention-category.use-case';
import { UpsertPreservationRuleUseCase } from '../../../src/modules/audit/application/use-cases/upsert-preservation-rule.use-case';
import { PlaceLegalHoldUseCase } from '../../../src/modules/audit/application/use-cases/place-legal-hold.use-case';
import { ReleaseLegalHoldUseCase } from '../../../src/modules/audit/application/use-cases/release-legal-hold.use-case';
import { UpsertPiiFieldMappingUseCase } from '../../../src/modules/audit/application/use-cases/upsert-pii-field-mapping.use-case';
import { TriggerRetentionRunUseCase } from '../../../src/modules/audit/application/use-cases/trigger-retention-run.use-case';
import { ListRetentionRunsUseCase } from '../../../src/modules/audit/application/use-cases/list-retention-runs.use-case';
import {
  RetentionPolicyForbiddenError,
  RetentionPeriodTooShortError,
  LegalHoldAlreadyReleasedError,
  RetentionCategoryNotFoundError,
} from '../../../src/modules/audit/domain/audit.errors';
import { AuditRetentionCategoryConfigEntity } from '../../../src/modules/audit/domain/audit-retention-category.entity';
import { AuditLegalHoldEntity } from '../../../src/modules/audit/domain/audit-legal-hold.entity';
import { AuditLogEntity } from '../../../src/modules/audit/domain/audit-log.entity';

function amActor(): AuthContext {
  return { userId: 'am-1', tenantId: null, role: 'AM', email: 'am@example.com' } as unknown as AuthContext;
}
function opActor(): AuthContext {
  return { userId: 'op-1', tenantId: 't1', role: 'OP', email: 'op@example.com' } as unknown as AuthContext;
}

describe('UpsertRetentionCategoryUseCase (FR-007)', () => {
  it('rejects non-AM with RetentionPolicyForbiddenError', async () => {
    const repo = { findAll: vi.fn(), findByName: vi.fn(), save: vi.fn(), update: vi.fn() };
    const auditService = { log: vi.fn() } as any;
    const useCase = new UpsertRetentionCategoryUseCase(repo, auditService);

    await expect(
      useCase.execute({
        name: 'FINANCIAL',
        retentionYears: 7,
        hardDeleteEnabled: false,
        actor: opActor(),
      }),
    ).rejects.toBeInstanceOf(RetentionPolicyForbiddenError);
  });

  it('rejects FINANCIAL below 7 years with RetentionPeriodTooShortError', async () => {
    const existing = new AuditRetentionCategoryConfigEntity({
      id: 'c1',
      name: 'FINANCIAL',
      retentionYears: 7,
      hardDeleteEnabled: false,
      description: null,
      actionPatterns: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const repo = {
      findAll: vi.fn(),
      findByName: vi.fn().mockResolvedValue(existing),
      save: vi.fn(),
      update: vi.fn(),
    };
    const auditService = { log: vi.fn() } as any;
    const useCase = new UpsertRetentionCategoryUseCase(repo, auditService);

    await expect(
      useCase.execute({
        name: 'FINANCIAL',
        retentionYears: 5,
        hardDeleteEnabled: false,
        actor: amActor(),
      }),
    ).rejects.toBeInstanceOf(RetentionPeriodTooShortError);
  });

  it('rejects unknown category with RetentionCategoryNotFoundError', async () => {
    const repo = { findAll: vi.fn(), findByName: vi.fn().mockResolvedValue(null), save: vi.fn(), update: vi.fn() };
    const auditService = { log: vi.fn() } as any;
    const useCase = new UpsertRetentionCategoryUseCase(repo, auditService);

    await expect(
      useCase.execute({
        name: 'FINANCIAL',
        retentionYears: 10,
        hardDeleteEnabled: false,
        actor: amActor(),
      }),
    ).rejects.toBeInstanceOf(RetentionCategoryNotFoundError);
  });

  it('valid upsert updates category and emits before/after audit entry', async () => {
    const existing = new AuditRetentionCategoryConfigEntity({
      id: 'c1',
      name: 'FINANCIAL',
      retentionYears: 7,
      hardDeleteEnabled: false,
      description: 'seed',
      actionPatterns: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const repo = {
      findAll: vi.fn(),
      findByName: vi.fn().mockResolvedValue(existing),
      save: vi.fn(),
      update: vi.fn(),
    };
    const auditService = { log: vi.fn() } as any;
    const useCase = new UpsertRetentionCategoryUseCase(repo, auditService);

    await useCase.execute({
      name: 'FINANCIAL',
      retentionYears: 10,
      hardDeleteEnabled: false,
      actor: amActor(),
    });

    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'audit.retention_policy_updated',
        before: expect.objectContaining({ retentionYears: 7 }),
        after: expect.objectContaining({ retentionYears: 10 }),
      }),
    );
  });
});

describe('PlaceLegalHoldUseCase', () => {
  it('rejects non-AM with RetentionPolicyForbiddenError', async () => {
    const repo = { findAllActive: vi.fn(), findById: vi.fn(), findByEntity: vi.fn(), save: vi.fn(), update: vi.fn() };
    const auditService = { log: vi.fn() } as any;
    const useCase = new PlaceLegalHoldUseCase(repo, auditService);
    await expect(
      useCase.execute({
        entityType: 'Appointment',
        entityId: 'a1',
        tenantId: null,
        reason: 'dispute',
        actor: opActor(),
      }),
    ).rejects.toBeInstanceOf(RetentionPolicyForbiddenError);
  });

  it('creates a legal hold and emits audit entry', async () => {
    const repo = { findAllActive: vi.fn(), findById: vi.fn(), findByEntity: vi.fn(), save: vi.fn(), update: vi.fn() };
    const auditService = { log: vi.fn() } as any;
    const useCase = new PlaceLegalHoldUseCase(repo, auditService);

    const id = await useCase.execute({
      entityType: 'Appointment',
      entityId: 'a1',
      tenantId: null,
      reason: 'litigation',
      actor: amActor(),
    });

    expect(id).toBeTruthy();
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'audit.legal_hold_placed' }),
    );
  });
});

describe('ReleaseLegalHoldUseCase', () => {
  it('rejects releasing an already-released hold', async () => {
    const inactive = new AuditLegalHoldEntity({
      id: 'h1',
      entityType: 'Appointment',
      entityId: 'a1',
      tenantId: null,
      reason: 'x',
      placedByUserId: 'u1',
      placedAt: new Date(),
      releasedByUserId: 'u1',
      releasedAt: new Date(),
      isActive: false,
    });
    const repo = {
      findAllActive: vi.fn(),
      findById: vi.fn().mockResolvedValue(inactive),
      findByEntity: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    const auditService = { log: vi.fn() } as any;
    const useCase = new ReleaseLegalHoldUseCase(repo, auditService);

    await expect(
      useCase.execute({ holdId: 'h1', actor: amActor() }),
    ).rejects.toBeInstanceOf(LegalHoldAlreadyReleasedError);
  });

  it('releases an active hold and emits audit entry', async () => {
    const active = new AuditLegalHoldEntity({
      id: 'h1',
      entityType: 'Appointment',
      entityId: 'a1',
      tenantId: null,
      reason: 'x',
      placedByUserId: 'u1',
      placedAt: new Date(),
      releasedByUserId: null,
      releasedAt: null,
      isActive: true,
    });
    const repo = {
      findAllActive: vi.fn(),
      findById: vi.fn().mockResolvedValue(active),
      findByEntity: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    const auditService = { log: vi.fn() } as any;
    const useCase = new ReleaseLegalHoldUseCase(repo, auditService);

    await useCase.execute({ holdId: 'h1', actor: amActor() });

    expect(active.isActive).toBe(false);
    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'audit.legal_hold_released' }),
    );
  });
});

describe('UpsertPreservationRuleUseCase', () => {
  it('rejects non-AM', async () => {
    const repo = {
      findAllActive: vi.fn(),
      findById: vi.fn(),
      findByType: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    };
    const auditService = { log: vi.fn() } as any;
    const useCase = new UpsertPreservationRuleUseCase(repo, auditService);
    await expect(
      useCase.execute({
        name: 'r1',
        ruleType: 'LEGAL_HOLD',
        entityType: 'Appointment',
        entityId: 'a1',
        tenantId: null,
        isActive: true,
        actor: opActor(),
      }),
    ).rejects.toBeInstanceOf(RetentionPolicyForbiddenError);
  });

  it('creates a new rule when id is not provided', async () => {
    const repo = {
      findAllActive: vi.fn(),
      findById: vi.fn(),
      findByType: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    };
    const auditService = { log: vi.fn() } as any;
    const useCase = new UpsertPreservationRuleUseCase(repo, auditService);

    const id = await useCase.execute({
      name: 'r1',
      ruleType: 'LEGAL_HOLD',
      entityType: 'Appointment',
      entityId: 'a1',
      tenantId: null,
      isActive: true,
      actor: amActor(),
    });

    expect(id).toBeTruthy();
    expect(repo.save).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'audit.preservation_rule_upserted' }),
    );
  });
});

describe('UpsertPiiFieldMappingUseCase', () => {
  it('rejects non-AM', async () => {
    const repo = {
      findAll: vi.fn(),
      findByAction: vi.fn(),
      findById: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const auditService = { log: vi.fn() } as any;
    const useCase = new UpsertPiiFieldMappingUseCase(repo, auditService);
    await expect(
      useCase.execute({
        actionPattern: 'user.',
        jsonFieldPath: 'email',
        classification: 'direct',
        requiresManualReview: false,
        actor: opActor(),
      }),
    ).rejects.toBeInstanceOf(RetentionPolicyForbiddenError);
  });

  it('creates a new mapping and audits', async () => {
    const repo = {
      findAll: vi.fn(),
      findByAction: vi.fn(),
      findById: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const auditService = { log: vi.fn() } as any;
    const useCase = new UpsertPiiFieldMappingUseCase(repo, auditService);

    const id = await useCase.execute({
      actionPattern: 'user.',
      jsonFieldPath: 'email',
      classification: 'direct',
      requiresManualReview: false,
      actor: amActor(),
    });

    expect(id).toBeTruthy();
    expect(repo.save).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'audit.pii_field_mapping_upserted' }),
    );
  });
});

describe('TriggerRetentionRunUseCase', () => {
  it('rejects non-AM', async () => {
    const worker = { execute: vi.fn() } as any;
    const auditService = { log: vi.fn() } as any;
    const useCase = new TriggerRetentionRunUseCase(worker, auditService);
    await expect(useCase.execute({ actor: opActor() })).rejects.toBeInstanceOf(
      RetentionPolicyForbiddenError,
    );
  });

  it('triggers the worker and emits trigger audit entry', async () => {
    const worker = {
      execute: vi.fn().mockResolvedValue({
        movedCount: 0,
        preservedCount: 0,
        preservedByRule: { crossCheck: 0, legalHold: 0 },
        hardDeletedCount: 0,
        skippedInProgressCount: 0,
        erroredCount: 0,
        tenantPortalMovedCount: 0,
      }),
    } as any;
    const auditService = { log: vi.fn() } as any;
    const useCase = new TriggerRetentionRunUseCase(worker, auditService);

    await useCase.execute({ actor: amActor() });

    expect(worker.execute).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'audit.retention_run_triggered_manually' }),
    );
  });
});

describe('ListRetentionRunsUseCase', () => {
  it('allows AM and OP', async () => {
    const runEntry = new AuditLogEntity({
      id: 'run-1',
      tenantId: null,
      actorType: 'SYSTEM',
      actorId: null,
      entityType: 'AuditRetention',
      entityId: null,
      action: 'audit.retention_run_completed',
      reason: null,
      beforeJson: null,
      afterJson: null,
      requestId: null,
      ipAddress: null,
      metadataJson: { movedCount: 10, preservedCount: 5 },
      createdAt: new Date(),
      retentionCategory: 'OPERATIONAL_GENERAL',
      redactionStatus: 'NONE',
      coldStorage: false,
      preservationRuleId: null,
    });
    const repo = {
      save: vi.fn(),
      saveMany: vi.fn(),
      findAll: vi.fn().mockResolvedValue([runEntry]),
      count: vi.fn().mockResolvedValue(1),
      findById: vi.fn(),
      findByIds: vi.fn(),
      updateRedactionStatus: vi.fn(),
      updateRedactedSnapshots: vi.fn(),
      moveToCold: vi.fn(),
      hardDeleteFromArchive: vi.fn(),
      findEligibleForRetention: vi.fn(),
      searchPiiByValues: vi.fn(),
    };
    const useCase = new ListRetentionRunsUseCase(repo as any);

    const result = await useCase.execute({ page: 1, pageSize: 10, actor: amActor() });
    expect(result.total).toBe(1);
    expect(result.data[0]!.summary).toEqual({ movedCount: 10, preservedCount: 5 });

    // OP also allowed
    const result2 = await useCase.execute({ page: 1, pageSize: 10, actor: opActor() });
    expect(result2.total).toBe(1);
  });

  it('rejects CL_ADMIN', async () => {
    const repo = {
      save: vi.fn(),
      saveMany: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      findById: vi.fn(),
      findByIds: vi.fn(),
      updateRedactionStatus: vi.fn(),
      updateRedactedSnapshots: vi.fn(),
      moveToCold: vi.fn(),
      hardDeleteFromArchive: vi.fn(),
      findEligibleForRetention: vi.fn(),
      searchPiiByValues: vi.fn(),
    };
    const useCase = new ListRetentionRunsUseCase(repo as any);
    const clAdmin: AuthContext = {
      userId: 'cl-1',
      tenantId: 't1',
      role: 'CL_ADMIN',
      email: 'cl@example.com',
    } as unknown as AuthContext;
    await expect(useCase.execute({ page: 1, pageSize: 10, actor: clAdmin })).rejects.toThrow();
  });
});
