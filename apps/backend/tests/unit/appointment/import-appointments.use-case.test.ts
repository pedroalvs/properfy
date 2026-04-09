import { createHash } from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImportAppointmentsUseCase } from '../../../src/modules/appointment/application/use-cases/import-appointments.use-case';
import type { IAppointmentImportRepository } from '../../../src/modules/appointment/domain/appointment-import.repository';
import type { IReportStorageService } from '../../../src/modules/report/domain/report-storage.service';
import type { IJobQueue } from '../../../src/shared/domain/job-queue';
import type { IIdempotencyService } from '../../../src/shared/domain/idempotency.service';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError, ValidationError } from '../../../src/shared/domain/errors';
import { AppointmentImportIdempotencyPayloadMismatchError } from '../../../src/modules/appointment/domain/appointment.errors';

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
  filename: 'appointments.xlsx',
  idempotencyKey: 'idem-key-1',
};

describe('ImportAppointmentsUseCase', () => {
  let importRepo: IAppointmentImportRepository;
  let storageService: IReportStorageService;
  let jobQueue: IJobQueue;
  let idempotencyService: IIdempotencyService;
  let useCase: ImportAppointmentsUseCase;

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

    const authorizationService = new AuthorizationService({ log: vi.fn() } as any);
    useCase = new ImportAppointmentsUseCase(importRepo, storageService, jobQueue, idempotencyService, authorizationService);
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
    expect(jobQueue.enqueue).toHaveBeenCalledWith('appointment.import', { importId: result.importId });
    expect(storageService.upload).toHaveBeenCalledOnce();
  });

  it('should return cached result on duplicate idempotency key with same file', async () => {
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

  it('should throw 409 when idempotency key is reused with a different file', async () => {
    const cachedResult = {
      importId: 'cached-import',
      status: 'PENDING',
      acceptedCount: 0,
      warningCount: 0,
      errorCount: 0,
    };
    const originalHash = createHash('sha256').update(Buffer.from('original-content')).digest('hex');
    vi.mocked(idempotencyService.getWithHash).mockResolvedValue({
      response: cachedResult,
      payloadHash: originalHash,
    });

    await expect(
      useCase.execute({
        ...baseInput,
        actor: makeActor(),
      }),
    ).rejects.toThrow(AppointmentImportIdempotencyPayloadMismatchError);

    expect(importRepo.save).not.toHaveBeenCalled();
    expect(jobQueue.enqueue).not.toHaveBeenCalled();
  });

  it('should process normally when a different idempotency key is used', async () => {
    vi.mocked(idempotencyService.getWithHash).mockResolvedValue(null);

    const result1 = await useCase.execute({
      ...baseInput,
      idempotencyKey: 'key-1',
      actor: makeActor(),
    });

    expect(result1.status).toBe('PENDING');
    expect(importRepo.save).toHaveBeenCalledOnce();
    expect(jobQueue.enqueue).toHaveBeenCalledOnce();

    vi.mocked(importRepo.save).mockClear();
    vi.mocked(jobQueue.enqueue).mockClear();

    const result2 = await useCase.execute({
      ...baseInput,
      idempotencyKey: 'key-2',
      actor: makeActor(),
    });

    expect(result2.status).toBe('PENDING');
    expect(result2.importId).not.toBe(result1.importId);
    expect(importRepo.save).toHaveBeenCalledOnce();
    expect(jobQueue.enqueue).toHaveBeenCalledOnce();
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
        filename: 'appointments.pdf',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('should accept .csv files', async () => {
    const result = await useCase.execute({
      ...baseInput,
      filename: 'appointments.csv',
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
    const fileHash = createHash('sha256').update(baseInput.fileBuffer).digest('hex');

    await useCase.execute({
      ...baseInput,
      actor: makeActor(),
    });

    expect(idempotencyService.set).toHaveBeenCalledWith(
      'idem-key-1',
      'appointment.import',
      expect.objectContaining({
        importId: expect.any(String),
        status: 'PENDING',
      }),
      24,
      fileHash,
    );
  });
});
