import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { PreviewDataSubjectErasureUseCase } from '../../../src/modules/audit/application/use-cases/preview-data-subject-erasure.use-case';
import { ErasureForbiddenError } from '../../../src/modules/audit/domain/audit.errors';
import type { IDataSubjectErasureRequestRepository } from '../../../src/modules/audit/domain/data-subject-erasure-request.repository';
import type { IAuditLogRepository, PiiSearchMatch } from '../../../src/modules/audit/domain/audit-log.repository';
import type { IPiiFieldMappingRepository } from '../../../src/modules/audit/domain/pii-field-mapping.repository';
import type { IErasurePiiResolver } from '../../../src/modules/audit/domain/erasure-pii-resolver';
import { PiiFieldMappingEntity } from '../../../src/modules/audit/domain/pii-field-mapping.entity';

function amActor(): AuthContext {
  return {
    userId: 'am-1',
    tenantId: null,
    role: 'AM',
    email: 'am@example.com',
  } as unknown as AuthContext;
}

function opActor(): AuthContext {
  return {
    userId: 'op-1',
    tenantId: 't1',
    role: 'OP',
    email: 'op@example.com',
  } as unknown as AuthContext;
}

function makePiiMapping(action: string, path: string): PiiFieldMappingEntity {
  return new PiiFieldMappingEntity({
    id: `pii-${action}-${path}`,
    actionPattern: action,
    jsonFieldPath: path,
    classification: 'direct',
    requiresManualReview: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('PreviewDataSubjectErasureUseCase', () => {
  let erasureRequestRepo: IDataSubjectErasureRequestRepository;
  let auditLogRepo: IAuditLogRepository;
  let piiFieldMappingRepo: IPiiFieldMappingRepository;
  let erasurePiiResolver: IErasurePiiResolver;
  let prisma: any;
  let useCase: PreviewDataSubjectErasureUseCase;

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
      findByIds: vi.fn(),
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
    erasurePiiResolver = {
      resolve: vi.fn().mockResolvedValue({ canonicalUserId: null, piiValues: [] }),
    };
    prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    };
    useCase = new PreviewDataSubjectErasureUseCase(
      erasureRequestRepo,
      auditLogRepo,
      piiFieldMappingRepo,
      erasurePiiResolver,
      prisma,
    );
  });

  it('rejects non-AM actors with ErasureForbiddenError', async () => {
    await expect(
      useCase.execute({
        subjectIdentifierType: 'email',
        subjectIdentifierValue: 'foo@bar.com',
        actor: opActor(),
      }),
    ).rejects.toBeInstanceOf(ErasureForbiddenError);
  });

  it('saves a new erasure request and transitions to PREVIEW', async () => {
    (erasurePiiResolver.resolve as any).mockResolvedValueOnce({
      canonicalUserId: 'u1',
      piiValues: ['foo@bar.com'],
    });
    (piiFieldMappingRepo.findAll as any).mockResolvedValueOnce([
      makePiiMapping('user.', 'email'),
    ]);
    (auditLogRepo.searchPiiByValues as any).mockResolvedValueOnce([
      {
        id: 'e1',
        entityType: 'User',
        entityId: 'u1',
        action: 'user.updated',
        tenantId: null,
        retentionCategory: 'OPERATIONAL_CRITICAL',
        redactionStatus: 'NONE',
        isArchived: false,
      },
    ] satisfies PiiSearchMatch[]);

    const result = await useCase.execute({
      subjectIdentifierType: 'email',
      subjectIdentifierValue: 'foo@bar.com',
      actor: amActor(),
    });

    expect(erasureRequestRepo.save).toHaveBeenCalledTimes(1);
    // Save initial PENDING + update SCANNING + update PREVIEW = at least 2 updates
    expect(erasureRequestRepo.update).toHaveBeenCalled();
    expect(result.status).toBe('PREVIEW');
    expect(result.canonicalUserId).toBe('u1');
    expect(result.resolvedPiiValues).toContain('foo@bar.com');
    expect(result.totalFound).toBe(1);
    expect(result.byCategory.OPERATIONAL_CRITICAL).toBe(1);
    expect(result.byTier.hot).toBe(1);
  });

  it('classifies matches per tier (hot / cold)', async () => {
    (erasurePiiResolver.resolve as any).mockResolvedValueOnce({
      canonicalUserId: 'u1',
      piiValues: ['foo@bar.com'],
    });
    (piiFieldMappingRepo.findAll as any).mockResolvedValueOnce([
      makePiiMapping('user.', 'email'),
    ]);
    (auditLogRepo.searchPiiByValues as any).mockResolvedValueOnce([
      {
        id: 'h1',
        entityType: 'User',
        entityId: 'u1',
        action: 'user.updated',
        tenantId: null,
        retentionCategory: 'OPERATIONAL_CRITICAL',
        redactionStatus: 'NONE',
        isArchived: false,
      },
      {
        id: 'c1',
        entityType: 'User',
        entityId: 'u1',
        action: 'user.updated',
        tenantId: null,
        retentionCategory: 'OPERATIONAL_CRITICAL',
        redactionStatus: 'NONE',
        isArchived: true,
      },
    ] satisfies PiiSearchMatch[]);

    const result = await useCase.execute({
      subjectIdentifierType: 'email',
      subjectIdentifierValue: 'foo@bar.com',
      actor: amActor(),
    });

    expect(result.byTier.hot).toBe(1);
    expect(result.byTier.cold).toBe(1);
  });

  it('flags matches whose action has no PII mapping for manual review', async () => {
    (erasurePiiResolver.resolve as any).mockResolvedValueOnce({
      canonicalUserId: 'u1',
      piiValues: ['foo@bar.com'],
    });
    // No mappings at all — the user.updated match has no applicable mapping
    (piiFieldMappingRepo.findAll as any).mockResolvedValueOnce([
      makePiiMapping('some.other.', 'field'),
    ]);
    (auditLogRepo.searchPiiByValues as any).mockResolvedValueOnce([
      {
        id: 'e1',
        entityType: 'User',
        entityId: 'u1',
        action: 'user.updated',
        tenantId: null,
        retentionCategory: 'OPERATIONAL_CRITICAL',
        redactionStatus: 'NONE',
        isArchived: false,
      },
    ] satisfies PiiSearchMatch[]);

    const result = await useCase.execute({
      subjectIdentifierType: 'email',
      subjectIdentifierValue: 'foo@bar.com',
      actor: amActor(),
    });

    expect(result.entriesFlaggedForReview).toBe(1);
  });

  it('scans rental_tenant_portal_activities in both tiers', async () => {
    (erasurePiiResolver.resolve as any).mockResolvedValueOnce({
      canonicalUserId: 'u1',
      piiValues: ['foo@bar.com'],
    });
    (piiFieldMappingRepo.findAll as any).mockResolvedValueOnce([
      makePiiMapping('portal.', 'primaryEmail'),
    ]);
    (auditLogRepo.searchPiiByValues as any).mockResolvedValueOnce([]);
    // 2 hot + 1 cold portal rows
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'tp1' }, { id: 'tp2' }])
      .mockResolvedValueOnce([{ id: 'tp3' }]);

    const result = await useCase.execute({
      subjectIdentifierType: 'email',
      subjectIdentifierValue: 'foo@bar.com',
      actor: amActor(),
    });

    expect(result.byTier.rentalTenantPortalHot).toBe(2);
    expect(result.byTier.rentalTenantPortalCold).toBe(1);
    expect(result.totalFound).toBe(3);
  });
});
