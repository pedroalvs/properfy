import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportImportErrorsUseCase } from '../../../src/modules/property/application/use-cases/export-import-errors.use-case';
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

function makeImportRecord(
  overrides: Partial<ConstructorParameters<typeof PropertyImportEntity>[0]> = {},
): PropertyImportEntity {
  return new PropertyImportEntity({
    id: 'import-1',
    tenantId: 'tenant-1',
    status: 'COMPLETED',
    fileKey: 'imports/properties/import-1/file.xlsx',
    originalFilename: 'file.xlsx',
    totalRows: 50,
    successCount: 48,
    errorCount: 2,
    errorsJson: [
      { row: 5, field: 'postcode', code: 'INVALID_FORMAT', message: 'Invalid postcode format' },
      { row: 12, field: 'street', code: 'REQUIRED', message: 'Street is required' },
    ],
    createdByUserId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

describe('ExportImportErrorsUseCase', () => {
  let importRepo: IPropertyImportRepository;
  let useCase: ExportImportErrorsUseCase;

  beforeEach(() => {
    importRepo = {
      findById: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    useCase = new ExportImportErrorsUseCase(importRepo);
  });

  it('should return valid CSV for import with errors', async () => {
    vi.mocked(importRepo.findById).mockResolvedValue(makeImportRecord());

    const csv = await useCase.execute({
      importId: 'import-1',
      actor: makeActor(),
    });

    const lines = csv.split('\n');
    expect(lines[0]).toBe('row,field,code,message');
    expect(lines[1]).toBe('5,postcode,INVALID_FORMAT,Invalid postcode format');
    expect(lines[2]).toBe('12,street,REQUIRED,Street is required');
    expect(lines).toHaveLength(3);
  });

  it('should return header-only CSV for import with no errors', async () => {
    vi.mocked(importRepo.findById).mockResolvedValue(
      makeImportRecord({ errorsJson: [], errorCount: 0, successCount: 50 }),
    );

    const csv = await useCase.execute({
      importId: 'import-1',
      actor: makeActor(),
    });

    expect(csv).toBe('row,field,code,message');
  });

  it('should return header-only CSV when errorsJson is null', async () => {
    vi.mocked(importRepo.findById).mockResolvedValue(
      makeImportRecord({ errorsJson: null, errorCount: 0, successCount: 50 }),
    );

    const csv = await useCase.execute({
      importId: 'import-1',
      actor: makeActor(),
    });

    expect(csv).toBe('row,field,code,message');
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

  it('should throw ForbiddenError for CL_USER role', async () => {
    await expect(
      useCase.execute({
        importId: 'import-1',
        actor: makeActor({ role: 'CL_USER' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ForbiddenError for INSP role', async () => {
    await expect(
      useCase.execute({
        importId: 'import-1',
        actor: makeActor({ role: 'INSP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
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

  it('should properly escape commas in error messages', async () => {
    vi.mocked(importRepo.findById).mockResolvedValue(
      makeImportRecord({
        errorsJson: [
          { row: 1, field: 'address', code: 'INVALID', message: 'Missing street, number' },
        ],
      }),
    );

    const csv = await useCase.execute({
      importId: 'import-1',
      actor: makeActor(),
    });

    const lines = csv.split('\n');
    expect(lines[1]).toBe('1,address,INVALID,"Missing street, number"');
  });

  it('should properly escape double quotes in error messages', async () => {
    vi.mocked(importRepo.findById).mockResolvedValue(
      makeImportRecord({
        errorsJson: [
          { row: 3, field: 'name', code: 'INVALID', message: 'Value "abc" is not valid' },
        ],
      }),
    );

    const csv = await useCase.execute({
      importId: 'import-1',
      actor: makeActor(),
    });

    const lines = csv.split('\n');
    expect(lines[1]).toBe('3,name,INVALID,"Value ""abc"" is not valid"');
  });

  it('should properly escape newlines in error messages', async () => {
    vi.mocked(importRepo.findById).mockResolvedValue(
      makeImportRecord({
        errorsJson: [
          { row: 7, field: 'notes', code: 'FORMAT', message: 'Line 1\nLine 2' },
        ],
      }),
    );

    const csv = await useCase.execute({
      importId: 'import-1',
      actor: makeActor(),
    });

    // The newline is inside quotes so it should be wrapped
    expect(csv).toContain('"Line 1\nLine 2"');
  });
});
