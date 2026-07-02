import { describe, it, expect, vi } from 'vitest';
import { SweepAbandonedAppointmentImportsWorker } from './sweep-abandoned-appointment-imports.worker';

function buildDeps() {
  return {
    importRepo: { findAbandonedPreviews: vi.fn().mockResolvedValue([]), deleteById: vi.fn() },
    storageService: { deleteObject: vi.fn() },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
}

function buildWorker(deps: ReturnType<typeof buildDeps>, maxAgeHours = 24) {
  return new SweepAbandonedAppointmentImportsWorker(deps.importRepo as any, deps.storageService as any, deps.logger as any, maxAgeHours);
}

describe('SweepAbandonedAppointmentImportsWorker', () => {
  it('deletes the storage file and DB row for each abandoned preview', async () => {
    const deps = buildDeps();
    deps.importRepo.findAbandonedPreviews.mockResolvedValue([
      { id: 'import-1', fileKey: 'imports/appointments/import-1/f.csv' },
      { id: 'import-2', fileKey: 'imports/appointments/import-2/f.xlsx' },
    ]);
    const worker = buildWorker(deps);

    const result = await worker.execute();

    expect(deps.storageService.deleteObject).toHaveBeenCalledWith('imports/appointments/import-1/f.csv');
    expect(deps.storageService.deleteObject).toHaveBeenCalledWith('imports/appointments/import-2/f.xlsx');
    expect(deps.importRepo.deleteById).toHaveBeenCalledWith('import-1');
    expect(deps.importRepo.deleteById).toHaveBeenCalledWith('import-2');
    expect(result).toEqual({ sweptCount: 2 });
  });

  it('passes the configured max-age cutoff to the repository query', async () => {
    const deps = buildDeps();
    const before = Date.now();
    const worker = buildWorker(deps, 48);

    await worker.execute();

    const cutoff = deps.importRepo.findAbandonedPreviews.mock.calls[0]![0] as Date;
    const expectedMs = before - 48 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - expectedMs)).toBeLessThan(5000);
  });

  it('still deletes the DB row even when the storage delete fails (file already gone)', async () => {
    const deps = buildDeps();
    deps.importRepo.findAbandonedPreviews.mockResolvedValue([{ id: 'import-1', fileKey: 'x' }]);
    deps.storageService.deleteObject.mockRejectedValue(new Error('not found'));
    const worker = buildWorker(deps);

    const result = await worker.execute();

    expect(deps.importRepo.deleteById).toHaveBeenCalledWith('import-1');
    expect(result).toEqual({ sweptCount: 1 });
    expect(deps.logger.warn).toHaveBeenCalled();
  });

  it('returns sweptCount 0 and does not log when nothing is abandoned', async () => {
    const deps = buildDeps();
    const worker = buildWorker(deps);

    const result = await worker.execute();

    expect(result).toEqual({ sweptCount: 0 });
    expect(deps.logger.info).not.toHaveBeenCalled();
  });
});
