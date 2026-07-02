import { describe, it, expect, vi } from 'vitest';
import { CommitAppointmentImportUseCase } from './commit-appointment-import.use-case';
import { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { AppointmentImportEntity } from '../../domain/appointment-import.entity';
import { NotFoundError, ConflictError } from '../../../../shared/domain/errors';
import type { AuthContext } from '@properfy/shared';

function buildRecord(overrides: Partial<ConstructorParameters<typeof AppointmentImportEntity>[0]> = {}) {
  const now = new Date();
  return new AppointmentImportEntity({
    id: 'import-1', tenantId: 'tenant-1', branchId: 'branch-1', status: 'PREVIEW',
    fileKey: 'imports/appointments/import-1/f.csv', originalFilename: 'f.csv',
    totalRows: 2, successCount: 0, errorCount: 0, errorsJson: null,
    previewJson: { summary: { totalRows: 2, importable: 2, withWarnings: 0, withErrors: 0 } },
    resultsJson: null, createdByUserId: 'user-1', createdAt: now, updatedAt: now,
    ...overrides,
  });
}

const AM: AuthContext = { userId: 'am-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const CL_USER: AuthContext = { userId: 'clu-1', tenantId: 'tenant-1', role: 'CL_USER', branchId: null, inspectorId: null };

function buildDeps() {
  const auditService = { log: vi.fn() };
  return {
    importRepo: { findById: vi.fn(), save: vi.fn(), update: vi.fn() },
    jobQueue: { enqueue: vi.fn() },
    authorizationService: new AuthorizationService(auditService as any),
    idempotencyService: { get: vi.fn().mockResolvedValue(null), set: vi.fn(), getWithHash: vi.fn() },
  };
}

function buildUseCase(deps: ReturnType<typeof buildDeps>) {
  return new CommitAppointmentImportUseCase(
    deps.importRepo as any, deps.jobQueue as any, deps.authorizationService, deps.idempotencyService as any,
  );
}

describe('CommitAppointmentImportUseCase', () => {
  it('rejects a role not permitted to import', async () => {
    const deps = buildDeps();
    const uc = buildUseCase(deps);
    await expect(uc.execute({ importId: 'import-1', skipInvalidRows: false, actor: CL_USER }))
      .rejects.toThrow();
  });

  it('throws 404 when the import does not exist (or was swept)', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(null);
    const uc = buildUseCase(deps);
    await expect(uc.execute({ importId: 'missing', skipInvalidRows: false, actor: AM }))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws 409 when the import is not in PREVIEW status', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(buildRecord({ status: 'COMPLETED' }));
    const uc = buildUseCase(deps);
    await expect(uc.execute({ importId: 'import-1', skipInvalidRows: false, actor: AM }))
      .rejects.toBeInstanceOf(ConflictError);
  });

  it('throws 409 when skipInvalidRows is false and the cached preview has errors', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(buildRecord({
      previewJson: { summary: { totalRows: 2, importable: 1, withWarnings: 0, withErrors: 1 } },
    }));
    const uc = buildUseCase(deps);
    await expect(uc.execute({ importId: 'import-1', skipInvalidRows: false, actor: AM }))
      .rejects.toBeInstanceOf(ConflictError);
    expect(deps.jobQueue.enqueue).not.toHaveBeenCalled();
  });

  it('proceeds when skipInvalidRows is true even if the preview has errors', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(buildRecord({
      previewJson: { summary: { totalRows: 2, importable: 1, withWarnings: 0, withErrors: 1 } },
    }));
    const uc = buildUseCase(deps);
    const result = await uc.execute({ importId: 'import-1', skipInvalidRows: true, actor: AM });
    expect(result).toEqual({ importId: 'import-1', status: 'PROCESSING' });
    expect(deps.jobQueue.enqueue).toHaveBeenCalledWith(
      'appointment.import.commit', expect.objectContaining({ importId: 'import-1', actor: AM }), expect.anything(),
    );
  });

  it('enqueues the commit job and returns PROCESSING when there are no errors', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(buildRecord());
    const uc = buildUseCase(deps);
    const result = await uc.execute({ importId: 'import-1', skipInvalidRows: false, actorTimezone: 'Australia/Sydney', actor: AM });
    expect(result).toEqual({ importId: 'import-1', status: 'PROCESSING' });
    expect(deps.jobQueue.enqueue).toHaveBeenCalledWith('appointment.import.commit', {
      importId: 'import-1', actorTimezone: 'Australia/Sydney', actor: AM,
    }, { singletonKey: 'import-1' });
  });

  it('uses the importId as the job singletonKey so a concurrent commit call cannot double-enqueue', async () => {
    const deps = buildDeps();
    deps.importRepo.findById.mockResolvedValue(buildRecord());
    const uc = buildUseCase(deps);
    await uc.execute({ importId: 'import-1', skipInvalidRows: false, actor: AM });
    const [, , options] = deps.jobQueue.enqueue.mock.calls[0]!;
    expect(options).toEqual({ singletonKey: 'import-1' });
  });

  it('returns a cached result on idempotent replay without re-checking record state', async () => {
    const deps = buildDeps();
    const cached = { importId: 'import-1', status: 'PROCESSING' };
    deps.idempotencyService.get.mockResolvedValue(cached);
    const uc = buildUseCase(deps);
    const result = await uc.execute({ importId: 'import-1', skipInvalidRows: false, idempotencyKey: 'key-1', actor: AM });
    expect(result).toBe(cached);
    expect(deps.importRepo.findById).not.toHaveBeenCalled();
    expect(deps.jobQueue.enqueue).not.toHaveBeenCalled();
  });
});
