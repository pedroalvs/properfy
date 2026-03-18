import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetPropertyImportStatusUseCase } from '../../../src/modules/property/application/use-cases/get-property-import-status.use-case';
import type { IPropertyImportRepository } from '../../../src/modules/property/domain/property-import.repository';
import { PropertyImportEntity } from '../../../src/modules/property/domain/property-import.entity';
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

function makeImportRecord(overrides: Partial<ConstructorParameters<typeof PropertyImportEntity>[0]> = {}): PropertyImportEntity {
  return new PropertyImportEntity({
    id: 'import-1',
    tenantId: 'tenant-1',
    status: 'COMPLETED',
    fileKey: 'imports/properties/import-1/file.xlsx',
    originalFilename: 'file.xlsx',
    totalRows: 50,
    successCount: 48,
    errorCount: 2,
    errorsJson: [{ row: 5, message: 'Invalid postcode' }],
    createdByUserId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

describe('GetPropertyImportStatusUseCase', () => {
  let importRepo: IPropertyImportRepository;
  let useCase: GetPropertyImportStatusUseCase;

  beforeEach(() => {
    importRepo = {
      findById: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    useCase = new GetPropertyImportStatusUseCase(importRepo);
  });

  it('should return import status by ID', async () => {
    vi.mocked(importRepo.findById).mockResolvedValue(makeImportRecord());

    const result = await useCase.execute({
      importId: 'import-1',
      actor: makeActor(),
    });

    expect(result.id).toBe('import-1');
    expect(result.status).toBe('COMPLETED');
    expect(result.totalRows).toBe(50);
    expect(result.successCount).toBe(48);
    expect(result.errorCount).toBe(2);
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
