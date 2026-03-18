import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImportAppointmentsUseCase } from '../../../src/modules/appointment/application/use-cases/import-appointments.use-case';
import type { IAppointmentImportRepository } from '../../../src/modules/appointment/domain/appointment-import.repository';
import type { IReportStorageService } from '../../../src/modules/report/domain/report-storage.service';
import type { IJobQueue } from '../../../src/shared/domain/job-queue';
import type { IIdempotencyService } from '../../../src/shared/domain/idempotency.service';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError, ValidationError } from '../../../src/shared/domain/errors';

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
      set: vi.fn().mockResolvedValue(undefined),
    } as unknown as IIdempotencyService;

    useCase = new ImportAppointmentsUseCase(importRepo, storageService, jobQueue, idempotencyService);
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

  it('should return cached result on duplicate idempotency key', async () => {
    const cachedResult = {
      importId: 'cached-import',
      status: 'PENDING',
      acceptedCount: 0,
      warningCount: 0,
      errorCount: 0,
    };
    vi.mocked(idempotencyService.get).mockResolvedValue(cachedResult);

    const result = await useCase.execute({
      ...baseInput,
      actor: makeActor(),
    });

    expect(result).toEqual(cachedResult);
    expect(importRepo.save).not.toHaveBeenCalled();
    expect(jobQueue.enqueue).not.toHaveBeenCalled();
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

  it('should cache result after successful execution', async () => {
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
    );
  });
});
