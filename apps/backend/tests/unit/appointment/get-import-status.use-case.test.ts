import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetImportStatusUseCase } from '../../../src/modules/appointment/application/use-cases/get-import-status.use-case';
import type { IAppointmentImportRepository } from '../../../src/modules/appointment/domain/appointment-import.repository';
import { AppointmentImportEntity } from '../../../src/modules/appointment/domain/appointment-import.entity';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError, NotFoundError } from '../../../src/shared/domain/errors';

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

function makeImportRecord(overrides: Partial<ConstructorParameters<typeof AppointmentImportEntity>[0]> = {}): AppointmentImportEntity {
  return new AppointmentImportEntity({
    id: 'import-1',
    tenantId: 'tenant-1',
    status: 'COMPLETED',
    fileKey: 'imports/appointments/import-1/file.xlsx',
    originalFilename: 'file.xlsx',
    totalRows: 100,
    successCount: 95,
    errorCount: 5,
    errorsJson: [{ row: 3, message: 'Invalid date' }],
    createdByUserId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

describe('GetImportStatusUseCase', () => {
  let importRepo: IAppointmentImportRepository;
  let useCase: GetImportStatusUseCase;

  beforeEach(() => {
    importRepo = {
      findById: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    useCase = new GetImportStatusUseCase(importRepo);
  });

  it('should return import status by ID', async () => {
    vi.mocked(importRepo.findById).mockResolvedValue(makeImportRecord());

    const result = await useCase.execute({
      importId: 'import-1',
      actor: makeActor(),
    });

    expect(result.id).toBe('import-1');
    expect(result.status).toBe('COMPLETED');
    expect(result.totalRows).toBe(100);
    expect(result.successCount).toBe(95);
    expect(result.errorCount).toBe(5);
    expect(result.errorsJson).toHaveLength(1);
  });

  it('should throw NotFoundError when import not found', async () => {
    vi.mocked(importRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        importId: 'nonexistent',
        actor: makeActor(),
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('should scope by tenant for CL_ADMIN', async () => {
    vi.mocked(importRepo.findById).mockResolvedValue(makeImportRecord());

    await useCase.execute({
      importId: 'import-1',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(importRepo.findById).toHaveBeenCalledWith('import-1', 'tenant-1');
  });

  it('should pass null tenant scope for AM', async () => {
    vi.mocked(importRepo.findById).mockResolvedValue(makeImportRecord());

    await useCase.execute({
      importId: 'import-1',
      actor: makeActor({ role: 'AM', tenantId: null }),
    });

    expect(importRepo.findById).toHaveBeenCalledWith('import-1', null);
  });

  it('should pass null tenant scope for OP', async () => {
    vi.mocked(importRepo.findById).mockResolvedValue(makeImportRecord());

    await useCase.execute({
      importId: 'import-1',
      actor: makeActor({ role: 'OP', tenantId: null }),
    });

    expect(importRepo.findById).toHaveBeenCalledWith('import-1', null);
  });

  it('should throw ForbiddenError for INSP role', async () => {
    await expect(
      useCase.execute({
        importId: 'import-1',
        actor: makeActor({ role: 'INSP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ForbiddenError for CL_USER role', async () => {
    await expect(
      useCase.execute({
        importId: 'import-1',
        actor: makeActor({ role: 'CL_USER' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
