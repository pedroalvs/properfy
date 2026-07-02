import { describe, it, expect, vi } from 'vitest';
import { ExportAppointmentImportErrorsUseCase } from './export-appointment-import-errors.use-case';
import { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { AppointmentImportEntity } from '../../domain/appointment-import.entity';
import { NotFoundError } from '../../../../shared/domain/errors';
import type { AuthContext } from '@properfy/shared';

function buildRecord(overrides: Partial<ConstructorParameters<typeof AppointmentImportEntity>[0]> = {}) {
  const now = new Date();
  return new AppointmentImportEntity({
    id: 'import-1', tenantId: 'tenant-1', branchId: 'branch-1', status: 'COMPLETED',
    fileKey: 'imports/appointments/import-1/f.csv', originalFilename: 'f.csv',
    totalRows: 2, successCount: 1, errorCount: 1, errorsJson: null,
    previewJson: null, resultsJson: null, createdByUserId: 'user-1', createdAt: now, updatedAt: now,
    ...overrides,
  });
}

const AM: AuthContext = { userId: 'am-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

function buildUseCase(importRepo: { findById: ReturnType<typeof vi.fn> }) {
  const auditService = { log: vi.fn() };
  return new ExportAppointmentImportErrorsUseCase(importRepo as any, new AuthorizationService(auditService as any));
}

describe('ExportAppointmentImportErrorsUseCase', () => {
  it('throws 404 when the import does not exist', async () => {
    const importRepo = { findById: vi.fn().mockResolvedValue(null) };
    const uc = buildUseCase(importRepo);
    await expect(uc.execute({ importId: 'missing', actor: AM })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('renders a CSV with only the error rows from resultsJson', async () => {
    const importRepo = { findById: vi.fn().mockResolvedValue(buildRecord({
      resultsJson: [
        { rowNumber: 2, status: 'created', appointmentId: 'apt-1' },
        { rowNumber: 3, status: 'error', message: 'No service type found' },
      ],
    })) };
    const uc = buildUseCase(importRepo);

    const csv = await uc.execute({ importId: 'import-1', actor: AM });
    const lines = csv.split('\n');
    expect(lines[0]).toBe('row,message');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('3,No service type found');
  });

  it('CSV-escapes messages containing commas or quotes', async () => {
    const importRepo = { findById: vi.fn().mockResolvedValue(buildRecord({
      resultsJson: [{ rowNumber: 2, status: 'error', message: 'Bad, row "quoted"' }],
    })) };
    const uc = buildUseCase(importRepo);

    const csv = await uc.execute({ importId: 'import-1', actor: AM });
    expect(csv.split('\n')[1]).toBe('2,"Bad, row ""quoted"""');
  });

  it('neutralizes a leading formula-triggering character (CSV/formula injection)', async () => {
    const importRepo = { findById: vi.fn().mockResolvedValue(buildRecord({
      resultsJson: [{ rowNumber: 2, status: 'error', message: '=cmd|"/c calc"!A1' }],
    })) };
    const uc = buildUseCase(importRepo);

    const csv = await uc.execute({ importId: 'import-1', actor: AM });
    const messageCell = csv.split('\n')[1]!.slice('2,'.length);
    expect(messageCell.startsWith("'=") || messageCell.startsWith('"\'=')).toBe(true);
  });

  it('returns just the header when there are no errors yet (e.g. still in PREVIEW)', async () => {
    const importRepo = { findById: vi.fn().mockResolvedValue(buildRecord({ status: 'PREVIEW', resultsJson: null })) };
    const uc = buildUseCase(importRepo);

    const csv = await uc.execute({ importId: 'import-1', actor: AM });
    expect(csv).toBe('row,message');
  });
});
