import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommitPropertyImportUseCase } from './commit-property-import.use-case';
import { NotFoundError, ConflictError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';

const IMPORT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const actor = { userId: 'user-1', tenantId: 'tenant-1', role: 'CL_ADMIN' as const, email: 'a@b.c', branchId: null, inspectorId: null };

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: IMPORT_ID,
    tenantId: 'tenant-1',
    status: 'PREVIEW',
    previewJson: { summary: { totalRows: 1, importable: 1, withWarnings: 0, withErrors: 0 }, rows: [] },
    ...overrides,
  };
}

describe('CommitPropertyImportUseCase', () => {
  let importRepo: { findById: ReturnType<typeof vi.fn> };
  let jobQueue: { enqueue: ReturnType<typeof vi.fn> };
  let idempotencyService: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
  let authorizationService: AuthorizationService;

  beforeEach(() => {
    importRepo = { findById: vi.fn().mockResolvedValue(record()) };
    jobQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    idempotencyService = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined) };
    authorizationService = { assertRoles: vi.fn() } as unknown as AuthorizationService;
  });

  function makeUseCase() {
    return new CommitPropertyImportUseCase(
      importRepo as never, jobQueue as never, authorizationService, idempotencyService as never,
    );
  }

  it('enqueues property.import.commit with a singleton key and records idempotency', async () => {
    const result = await makeUseCase().execute({
      importId: IMPORT_ID, skipInvalidRows: false, idempotencyKey: 'idem-1', actor,
    });

    expect(jobQueue.enqueue).toHaveBeenCalledWith(
      'property.import.commit',
      { importId: IMPORT_ID, actor },
      { singletonKey: IMPORT_ID },
    );
    expect(result).toEqual({ importId: IMPORT_ID, status: 'PROCESSING' });
    expect(idempotencyService.set).toHaveBeenCalledWith('idem-1', 'property.import.commit', result, 24);
  });

  it('returns the cached result for a repeated idempotency key without enqueueing', async () => {
    idempotencyService.get.mockResolvedValue({ importId: IMPORT_ID, status: 'PROCESSING' });
    const result = await makeUseCase().execute({
      importId: IMPORT_ID, skipInvalidRows: false, idempotencyKey: 'idem-1', actor,
    });
    expect(result).toEqual({ importId: IMPORT_ID, status: 'PROCESSING' });
    expect(jobQueue.enqueue).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the import does not exist in tenant scope', async () => {
    importRepo.findById.mockResolvedValue(null);
    await expect(
      makeUseCase().execute({ importId: IMPORT_ID, skipInvalidRows: false, actor }),
    ).rejects.toThrow(NotFoundError);
    expect(importRepo.findById).toHaveBeenCalledWith(IMPORT_ID, 'tenant-1');
  });

  it('rejects commits for imports not in PREVIEW status', async () => {
    importRepo.findById.mockResolvedValue(record({ status: 'COMPLETED' }));
    await expect(
      makeUseCase().execute({ importId: IMPORT_ID, skipInvalidRows: false, actor }),
    ).rejects.toThrow(ConflictError);
  });

  it('blocks commit when the preview has error rows and skipInvalidRows is false', async () => {
    importRepo.findById.mockResolvedValue(record({
      previewJson: { summary: { totalRows: 2, importable: 1, withWarnings: 0, withErrors: 1 }, rows: [] },
    }));
    await expect(
      makeUseCase().execute({ importId: IMPORT_ID, skipInvalidRows: false, actor }),
    ).rejects.toThrow(/skipInvalidRows/);
    expect(jobQueue.enqueue).not.toHaveBeenCalled();
  });

  it('allows commit with error rows when skipInvalidRows is true', async () => {
    importRepo.findById.mockResolvedValue(record({
      previewJson: { summary: { totalRows: 2, importable: 1, withWarnings: 0, withErrors: 1 }, rows: [] },
    }));
    const result = await makeUseCase().execute({ importId: IMPORT_ID, skipInvalidRows: true, actor });
    expect(result.status).toBe('PROCESSING');
    expect(jobQueue.enqueue).toHaveBeenCalledTimes(1);
  });
});
