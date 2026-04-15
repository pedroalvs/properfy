import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { ExecuteDataSubjectErasureUseCase } from '../../../src/modules/audit/application/use-cases/execute-data-subject-erasure.use-case';
import { ErasureForbiddenError } from '../../../src/modules/audit/domain/audit.errors';
import type { IDataSubjectErasureRequestRepository } from '../../../src/modules/audit/domain/data-subject-erasure-request.repository';
import type { IAuditLogRepository } from '../../../src/modules/audit/domain/audit-log.repository';
import type { IPiiFieldMappingRepository } from '../../../src/modules/audit/domain/pii-field-mapping.repository';
import type { IErasurePiiResolver } from '../../../src/modules/audit/domain/erasure-pii-resolver';
import type { PersistentAuditService } from '../../../src/modules/audit/application/services/persistent-audit.service';
import type { Logger } from '../../../src/shared/infrastructure/logger';
import { DataSubjectErasureRequestEntity } from '../../../src/modules/audit/domain/data-subject-erasure-request.entity';
import { PiiFieldMappingEntity } from '../../../src/modules/audit/domain/pii-field-mapping.entity';
import { AuditLogEntity } from '../../../src/modules/audit/domain/audit-log.entity';

function amActor(): AuthContext {
  return { userId: 'am-1', tenantId: null, role: 'AM', email: 'am@example.com' } as unknown as AuthContext;
}

function clAdminActor(): AuthContext {
  return { userId: 'cl-1', tenantId: 't1', role: 'CL_ADMIN', email: 'cl@example.com' } as unknown as AuthContext;
}

function makeRequest(status: any, resolvedPii: string[] = []): DataSubjectErasureRequestEntity {
  return new DataSubjectErasureRequestEntity({
    id: 'req-1',
    subjectIdentifierType: 'email',
    subjectIdentifierValue: 'foo@bar.com',
    resolvedPiiValuesJson: resolvedPii,
    status,
    entriesFoundCount: null,
    entriesRedactedCount: null,
    entriesFlaggedForReviewCount: null,
    completionReportJson: null,
    initiatedByUserId: 'am-1',
    initiatedAt: new Date(),
    completedAt: null,
  });
}

function makePiiMapping(action: string, path: string, classification: 'direct' | 'sensitive_financial' | 'unstructured' = 'direct'): PiiFieldMappingEntity {
  return new PiiFieldMappingEntity({
    id: `pii-${action}-${path}`,
    actionPattern: action,
    jsonFieldPath: path,
    classification,
    requiresManualReview: classification === 'unstructured',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeEntry(overrides: Partial<{ id: string; action: string; before: unknown; after: unknown; status: 'NONE' | 'FULL' }> = {}): AuditLogEntity {
  return new AuditLogEntity({
    id: overrides.id ?? 'e1',
    tenantId: null,
    actorType: 'USER',
    actorId: 'actor',
    entityType: 'User',
    entityId: 'u1',
    action: overrides.action ?? 'user.updated',
    reason: null,
    beforeJson: overrides.before ?? null,
    afterJson: overrides.after ?? null,
    requestId: null,
    ipAddress: null,
    metadataJson: null,
    createdAt: new Date(),
    retentionCategory: 'OPERATIONAL_CRITICAL',
    redactionStatus: overrides.status ?? 'NONE',
    coldStorage: false,
    preservationRuleId: null,
  });
}

describe('ExecuteDataSubjectErasureUseCase', () => {
  let erasureRequestRepo: IDataSubjectErasureRequestRepository;
  let auditLogRepo: IAuditLogRepository;
  let piiFieldMappingRepo: IPiiFieldMappingRepository;
  let erasurePiiResolver: IErasurePiiResolver;
  let auditService: PersistentAuditService;
  let logger: Logger;
  let useCase: ExecuteDataSubjectErasureUseCase;

  beforeEach(() => {
    erasureRequestRepo = {
      findById: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    auditLogRepo = {
      save: vi.fn(),
      saveMany: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      findById: vi.fn(),
      findByIds: vi.fn().mockResolvedValue([]),
      updateRedactionStatus: vi.fn(),
      updateRedactedSnapshots: vi.fn(),
      moveToCold: vi.fn(),
      hardDeleteFromArchive: vi.fn(),
      findEligibleForRetention: vi.fn(),
      searchPiiByValues: vi.fn().mockResolvedValue([]),
    };
    piiFieldMappingRepo = {
      findAll: vi.fn().mockResolvedValue([]),
      findByAction: vi.fn(),
      findById: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    erasurePiiResolver = { resolve: vi.fn() };
    auditService = { log: vi.fn() } as unknown as PersistentAuditService;
    logger = {
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

    useCase = new ExecuteDataSubjectErasureUseCase(
      erasureRequestRepo,
      auditLogRepo,
      piiFieldMappingRepo,
      erasurePiiResolver,
      auditService,
      {} as any,
      logger,
    );
  });

  it('rejects non-AM actors', async () => {
    await expect(
      useCase.execute({ requestId: 'req-1', actor: clAdminActor() }),
    ).rejects.toBeInstanceOf(ErasureForbiddenError);
  });

  it('marks target ids IN_PROGRESS before iterating (concurrency guard)', async () => {
    (erasureRequestRepo.findById as any).mockResolvedValueOnce(
      makeRequest('PREVIEW', ['foo@bar.com']),
    );
    (auditLogRepo.searchPiiByValues as any).mockResolvedValueOnce([
      { id: 'e1', entityType: 'User', entityId: 'u1', action: 'user.updated', tenantId: null, retentionCategory: 'OPERATIONAL_CRITICAL', redactionStatus: 'NONE', isArchived: false },
      { id: 'e2', entityType: 'User', entityId: 'u1', action: 'user.updated', tenantId: null, retentionCategory: 'OPERATIONAL_CRITICAL', redactionStatus: 'NONE', isArchived: false },
    ]);
    (piiFieldMappingRepo.findAll as any).mockResolvedValueOnce([makePiiMapping('user.', 'email')]);
    (auditLogRepo.findByIds as any).mockResolvedValueOnce([
      makeEntry({ id: 'e1', before: { email: 'foo@bar.com' }, after: null }),
      makeEntry({ id: 'e2', before: null, after: { email: 'foo@bar.com' } }),
    ]);

    await useCase.execute({ requestId: 'req-1', actor: amActor() });

    expect(auditLogRepo.updateRedactionStatus).toHaveBeenCalledWith(['e1', 'e2'], 'IN_PROGRESS');
  });

  it('redacts PII fields via redactByFieldPath and updates snapshots', async () => {
    (erasureRequestRepo.findById as any).mockResolvedValueOnce(
      makeRequest('PREVIEW', ['foo@bar.com']),
    );
    (auditLogRepo.searchPiiByValues as any).mockResolvedValueOnce([
      { id: 'e1', entityType: 'User', entityId: 'u1', action: 'user.updated', tenantId: null, retentionCategory: 'OPERATIONAL_CRITICAL', redactionStatus: 'NONE', isArchived: false },
    ]);
    (piiFieldMappingRepo.findAll as any).mockResolvedValueOnce([
      makePiiMapping('user.', 'email'),
    ]);
    (auditLogRepo.findByIds as any).mockResolvedValueOnce([
      makeEntry({ id: 'e1', before: { email: 'foo@bar.com', other: 'keep' }, after: { email: 'foo@bar.com' } }),
    ]);

    const result = await useCase.execute({ requestId: 'req-1', actor: amActor() });

    expect(auditLogRepo.updateRedactedSnapshots).toHaveBeenCalledTimes(1);
    const call = (auditLogRepo.updateRedactedSnapshots as any).mock.calls[0];
    expect(call[0]).toBe('e1');
    expect((call[1] as any).email).toBe('[REDACTED]');
    expect((call[1] as any).other).toBe('keep');
    expect(call[4]).toBe('FULL');
    expect(result.entriesRedacted).toBe(1);
  });

  it('skips entries already FULL (idempotent re-runs)', async () => {
    (erasureRequestRepo.findById as any).mockResolvedValueOnce(
      makeRequest('PREVIEW', ['foo@bar.com']),
    );
    (auditLogRepo.searchPiiByValues as any).mockResolvedValueOnce([
      { id: 'e1', entityType: 'User', entityId: 'u1', action: 'user.updated', tenantId: null, retentionCategory: 'OPERATIONAL_CRITICAL', redactionStatus: 'FULL', isArchived: false },
    ]);
    (piiFieldMappingRepo.findAll as any).mockResolvedValueOnce([makePiiMapping('user.', 'email')]);
    (auditLogRepo.findByIds as any).mockResolvedValueOnce([
      makeEntry({ id: 'e1', before: { email: '[REDACTED]' }, status: 'FULL' }),
    ]);

    const result = await useCase.execute({ requestId: 'req-1', actor: amActor() });

    expect(result.entriesSkipped).toBe(1);
    expect(result.entriesRedacted).toBe(0);
    expect(auditLogRepo.updateRedactedSnapshots).not.toHaveBeenCalled();
  });

  it('flags entries whose action has no registered mapping', async () => {
    (erasureRequestRepo.findById as any).mockResolvedValueOnce(
      makeRequest('PREVIEW', ['foo@bar.com']),
    );
    (auditLogRepo.searchPiiByValues as any).mockResolvedValueOnce([
      { id: 'e1', entityType: 'Unknown', entityId: 'u1', action: 'unknown.action', tenantId: null, retentionCategory: 'OPERATIONAL_CRITICAL', redactionStatus: 'NONE', isArchived: false },
    ]);
    (piiFieldMappingRepo.findAll as any).mockResolvedValueOnce([makePiiMapping('user.', 'email')]);
    (auditLogRepo.findByIds as any).mockResolvedValueOnce([
      makeEntry({ id: 'e1', action: 'unknown.action', before: { email: 'foo@bar.com' } }),
    ]);

    const result = await useCase.execute({ requestId: 'req-1', actor: amActor() });

    expect(result.entriesFlaggedForReview).toBe(1);
    expect(result.entriesRedacted).toBe(0);
  });

  it('emits meta-audit entry without subject PII', async () => {
    (erasureRequestRepo.findById as any).mockResolvedValueOnce(
      makeRequest('PREVIEW', ['foo@bar.com', 'John Doe']),
    );
    (auditLogRepo.searchPiiByValues as any).mockResolvedValueOnce([
      { id: 'e1', entityType: 'User', entityId: 'u1', action: 'user.updated', tenantId: null, retentionCategory: 'OPERATIONAL_CRITICAL', redactionStatus: 'NONE', isArchived: false },
    ]);
    (piiFieldMappingRepo.findAll as any).mockResolvedValueOnce([makePiiMapping('user.', 'email')]);
    (auditLogRepo.findByIds as any).mockResolvedValueOnce([
      makeEntry({ id: 'e1', before: { email: 'foo@bar.com' } }),
    ]);

    await useCase.execute({ requestId: 'req-1', actor: amActor() });

    expect(auditService.log).toHaveBeenCalledTimes(1);
    const metaEntry = (auditService.log as any).mock.calls[0][0];
    expect(metaEntry.action).toBe('audit.data_subject_erasure_executed');
    // Must not contain subject PII
    const serialized = JSON.stringify(metaEntry);
    expect(serialized).not.toContain('foo@bar.com');
    expect(serialized).not.toContain('John Doe');
    expect(metaEntry.metadata.entriesFound).toBe(1);
    expect(metaEntry.metadata.entriesRedacted).toBe(1);
  });

  it('transitions request through EXECUTING → COMPLETED', async () => {
    (erasureRequestRepo.findById as any).mockResolvedValueOnce(
      makeRequest('PREVIEW', ['foo@bar.com']),
    );
    (auditLogRepo.searchPiiByValues as any).mockResolvedValueOnce([]);

    const result = await useCase.execute({ requestId: 'req-1', actor: amActor() });

    expect(result.status).toBe('COMPLETED');
  });

  it('rejects invalid state (already COMPLETED)', async () => {
    (erasureRequestRepo.findById as any).mockResolvedValueOnce(makeRequest('COMPLETED', []));

    await expect(
      useCase.execute({ requestId: 'req-1', actor: amActor() }),
    ).rejects.toThrow(/invalid state|COMPLETED/i);
  });
});
