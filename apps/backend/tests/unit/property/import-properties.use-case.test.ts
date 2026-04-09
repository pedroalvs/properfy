import { createHash } from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImportPropertiesUseCase } from '../../../src/modules/property/application/use-cases/import-properties.use-case';
import type { IPropertyImportRepository } from '../../../src/modules/property/domain/property-import.repository';
import type { IReportStorageService } from '../../../src/modules/report/domain/report-storage.service';
import type { IJobQueue } from '../../../src/shared/domain/job-queue';
import type { IIdempotencyService } from '../../../src/shared/domain/idempotency.service';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError, ValidationError } from '../../../src/shared/domain/errors';
import { IdempotencyPayloadMismatchError } from '../../../src/modules/property/domain/property.errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

const baseInput = {
  fileBuffer: Buffer.from('test-content'),
  filename: 'properties.xlsx',
  idempotencyKey: 'idem-key-1',
};

describe('ImportPropertiesUseCase', () => {
  let importRepo: IPropertyImportRepository;
  let storageService: IReportStorageService;
  let jobQueue: IJobQueue;
  let idempotencyService: IIdempotencyService;
  let useCase: ImportPropertiesUseCase;

  beforeEach(() => {
    importRepo = {
      findById: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      update: vi.fn(),
    };
    storageService = {
      upload: vi.fn().mockResolvedValue(undefined),
      getSignedUrl: vi.fn(),
      delete: vi.fn(),
    } as unknown as IReportStorageService;
    jobQueue = {
      enqueue: vi.fn().mockResolvedValue('job-1'),
    } as unknown as IJobQueue;
    idempotencyService = {
      get: vi.fn().mockResolvedValue(null),
      getWithHash: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    } as unknown as IIdempotencyService;

    useCase = new ImportPropertiesUseCase(importRepo, storageService, jobQueue, idempotencyService, new AuthorizationService({ log: vi.fn() } as any));
  });

  it('should create import record and enqueue job on success', async () => {
    const result = await useCase.execute({
      ...baseInput,
      actor: makeActor(),
    });

    expect(result.importId).toBeDefined();
    expect(result.status).toBe('PENDING');
    expect(result.acceptedCount).toBe(0);
    expect(result.errorCount).toBe(0);
    expect(importRepo.save).toHaveBeenCalledOnce();
    expect(jobQueue.enqueue).toHaveBeenCalledWith('property.import', { importId: result.importId });
    expect(storageService.upload).toHaveBeenCalledOnce();
  });

  it('should return cached result on duplicate idempotency key with same payload', async () => {
    const cachedResult = {
      importId: 'cached-import',
      status: 'PENDING',
      acceptedCount: 0,
      warningCount: 0,
      errorCount: 0,
    };
    const fileHash = createHash('sha256').update(baseInput.fileBuffer).digest('hex');
    vi.mocked(idempotencyService.getWithHash).mockResolvedValue({
      response: cachedResult,
      payloadHash: fileHash,
    });

    const result = await useCase.execute({
      ...baseInput,
      actor: makeActor(),
    });

    expect(result).toEqual(cachedResult);
    expect(importRepo.save).not.toHaveBeenCalled();
    expect(jobQueue.enqueue).not.toHaveBeenCalled();
  });

  it('should throw IdempotencyPayloadMismatchError when same key used with different payload', async () => {
    const cachedResult = {
      importId: 'cached-import',
      status: 'PENDING',
      acceptedCount: 0,
      warningCount: 0,
      errorCount: 0,
    };
    vi.mocked(idempotencyService.getWithHash).mockResolvedValue({
      response: cachedResult,
      payloadHash: 'different-hash-from-original-file',
    });

    await expect(
      useCase.execute({
        ...baseInput,
        actor: makeActor(),
      }),
    ).rejects.toThrow(IdempotencyPayloadMismatchError);

    expect(importRepo.save).not.toHaveBeenCalled();
    expect(jobQueue.enqueue).not.toHaveBeenCalled();
  });

  it('should return cached result when stored hash is null (legacy record)', async () => {
    const cachedResult = {
      importId: 'cached-import',
      status: 'PENDING',
      acceptedCount: 0,
      warningCount: 0,
      errorCount: 0,
    };
    vi.mocked(idempotencyService.getWithHash).mockResolvedValue({
      response: cachedResult,
      payloadHash: null,
    });

    const result = await useCase.execute({
      ...baseInput,
      actor: makeActor(),
    });

    expect(result).toEqual(cachedResult);
    expect(importRepo.save).not.toHaveBeenCalled();
  });

  it('should scope import to actor tenant', async () => {
    const result = await useCase.execute({
      ...baseInput,
      actor: makeActor({ tenantId: 'tenant-42' }),
    });

    const savedEntity = vi.mocked(importRepo.save).mock.calls[0]![0]!;
    expect(savedEntity.tenantId).toBe('tenant-42');
    expect(savedEntity.createdByUserId).toBe('user-1');
    expect(result.importId).toBeDefined();
  });

  it('should throw ValidationError for invalid file type', async () => {
    await expect(
      useCase.execute({
        ...baseInput,
        filename: 'properties.json',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('should accept .csv files', async () => {
    const result = await useCase.execute({
      ...baseInput,
      filename: 'properties.csv',
      actor: makeActor(),
    });

    expect(result.status).toBe('PENDING');
    expect(storageService.upload).toHaveBeenCalledWith(
      expect.stringContaining('.csv'),
      expect.any(Buffer),
      'text/csv',
    );
  });

  it('should throw ForbiddenError for INSP role', async () => {
    await expect(
      useCase.execute({
        ...baseInput,
        actor: makeActor({ role: 'INSP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ForbiddenError for CL_USER role', async () => {
    await expect(
      useCase.execute({
        ...baseInput,
        actor: makeActor({ role: 'CL_USER' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ValidationError when actor has no tenantId', async () => {
    await expect(
      useCase.execute({
        ...baseInput,
        actor: makeActor({ tenantId: null }),
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('should cache result with file hash after successful execution', async () => {
    await useCase.execute({
      ...baseInput,
      actor: makeActor(),
    });

    const expectedHash = createHash('sha256').update(baseInput.fileBuffer).digest('hex');
    expect(idempotencyService.set).toHaveBeenCalledWith(
      'idem-key-1',
      'property.import',
      expect.objectContaining({
        importId: expect.any(String),
        status: 'PENDING',
      }),
      24,
      expectedHash,
    );
  });

  it('should start new import when a different idempotency key is used', async () => {
    const result1 = await useCase.execute({
      ...baseInput,
      actor: makeActor(),
    });

    vi.mocked(importRepo.save).mockClear();
    vi.mocked(jobQueue.enqueue).mockClear();
    vi.mocked(idempotencyService.set).mockClear();

    const result2 = await useCase.execute({
      ...baseInput,
      idempotencyKey: 'idem-key-2',
      actor: makeActor(),
    });

    expect(result2.importId).toBeDefined();
    expect(result2.importId).not.toBe(result1.importId);
    expect(importRepo.save).toHaveBeenCalledOnce();
    expect(jobQueue.enqueue).toHaveBeenCalledOnce();
  });

  it('should allow CL_ADMIN role', async () => {
    const result = await useCase.execute({
      ...baseInput,
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.status).toBe('PENDING');
  });
});
