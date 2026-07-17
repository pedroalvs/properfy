import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PreviewAppointmentImportUseCase } from './preview-appointment-import.use-case';
import { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { BranchEntity } from '../../../tenant/domain/branch.entity';
import { ValidationError, ForbiddenError } from '../../../../shared/domain/errors';
import { AppointmentBranchNotFoundError, AppointmentBranchInactiveError } from '../../domain/appointment.errors';
import type { AuthContext } from '@properfy/shared';

function buildBranch(overrides: Partial<ConstructorParameters<typeof BranchEntity>[0]> = {}) {
  const now = new Date();
  return new BranchEntity({
    id: 'branch-1', tenantId: 'tenant-1', name: 'Main', addressJson: null, contactEmail: null,
    status: 'ACTIVE', createdAt: now, updatedAt: now, deletedAt: null,
    ...overrides,
  });
}

const AM: AuthContext = { userId: 'am-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const CL_ADMIN: AuthContext = { userId: 'cl-1', tenantId: 'tenant-1', role: 'CL_ADMIN', branchId: null, inspectorId: null };
const INSP: AuthContext = { userId: 'insp-1', tenantId: null, role: 'INSP', branchId: null, inspectorId: 'insp-x' };

function buildDeps() {
  const auditService = { log: vi.fn() };
  return {
    importRepo: { save: vi.fn(), findById: vi.fn(), update: vi.fn() },
    storageService: { upload: vi.fn(), download: vi.fn(), generatePresignedGetUrl: vi.fn(), deleteObject: vi.fn() },
    branchRepo: { findById: vi.fn() },
    resolver: { resolve: vi.fn().mockResolvedValue({ rows: [], summary: { totalRows: 0, importable: 0, withWarnings: 0, withErrors: 0 } }) },
    geocodeVerifier: {
      verifyMany: vi.fn().mockImplementation(async (addresses: Map<string, string>) => {
        const out = new Map();
        for (const key of addresses.keys()) out.set(key, { status: 'found', lat: -33.8, lng: 151.2 });
        return out;
      }),
    },
    authorizationService: new AuthorizationService(auditService as any),
  };
}

function buildUseCase(deps: ReturnType<typeof buildDeps>) {
  return new PreviewAppointmentImportUseCase(
    deps.importRepo as any,
    deps.storageService as any,
    deps.branchRepo as any,
    deps.resolver as any,
    deps.geocodeVerifier as any,
    deps.authorizationService,
  );
}

function buildNewPropertyRow() {
  return {
    rowNumber: 2,
    severity: 'ready' as const,
    importable: true,
    property: {
      resolution: 'new' as const,
      propertyId: null,
      propertyCode: null,
      street: '9 New St',
      addressLine2: null,
      suburb: 'Carlton',
      state: 'NSW',
      postcode: '2218',
      country: 'AU',
      duplicateOfRow: null,
      geocode: null,
    },
    issues: [] as Array<{ field: string; code: string; severity: 'warning' | 'error'; message: string }>,
  };
}

const CSV_BUFFER = Buffer.from('Type,Street\nRoutine Inspection,1 Main St\n');

describe('PreviewAppointmentImportUseCase', () => {
  describe('RBAC', () => {
    it('rejects INSP', async () => {
      const deps = buildDeps();
      const uc = buildUseCase(deps);
      await expect(uc.execute({ fileBuffer: CSV_BUFFER, filename: 'x.csv', branchId: 'branch-1', actor: INSP }))
        .rejects.toThrow();
    });

    it('allows AM', async () => {
      const deps = buildDeps();
      deps.branchRepo.findById.mockResolvedValue(buildBranch());
      const uc = buildUseCase(deps);
      await expect(uc.execute({ fileBuffer: CSV_BUFFER, filename: 'x.csv', branchId: 'branch-1', actor: AM }))
        .resolves.toBeDefined();
    });

    it('allows CL_ADMIN', async () => {
      const deps = buildDeps();
      deps.branchRepo.findById.mockResolvedValue(buildBranch());
      const uc = buildUseCase(deps);
      await expect(uc.execute({ fileBuffer: CSV_BUFFER, filename: 'x.csv', branchId: 'branch-1', actor: CL_ADMIN }))
        .resolves.toBeDefined();
    });
  });

  describe('file validation', () => {
    it('rejects an unsupported file extension', async () => {
      const deps = buildDeps();
      deps.branchRepo.findById.mockResolvedValue(buildBranch());
      const uc = buildUseCase(deps);
      await expect(uc.execute({ fileBuffer: CSV_BUFFER, filename: 'x.pdf', branchId: 'branch-1', actor: AM }))
        .rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('tenant/branch resolution', () => {
    it('AM/OP: infers tenantId from the branch (queried with empty tenant scope)', async () => {
      const deps = buildDeps();
      deps.branchRepo.findById.mockResolvedValue(buildBranch({ tenantId: 'tenant-derived' }));
      const uc = buildUseCase(deps);

      const result = await uc.execute({ fileBuffer: CSV_BUFFER, filename: 'x.csv', branchId: 'branch-1', actor: AM });
      expect(deps.branchRepo.findById).toHaveBeenCalledWith('branch-1', '');
      expect(result.tenantId).toBe('tenant-derived');
    });

    it('CL_ADMIN: uses the JWT tenantId and scopes the branch lookup to it', async () => {
      const deps = buildDeps();
      deps.branchRepo.findById.mockResolvedValue(buildBranch());
      const uc = buildUseCase(deps);

      await uc.execute({ fileBuffer: CSV_BUFFER, filename: 'x.csv', branchId: 'branch-1', actor: CL_ADMIN });
      expect(deps.branchRepo.findById).toHaveBeenCalledWith('branch-1', 'tenant-1');
    });

    it('CL_ADMIN with no tenantId fails closed instead of falling through to a cross-tenant lookup', async () => {
      const deps = buildDeps();
      const uc = buildUseCase(deps);

      await expect(
        uc.execute({ fileBuffer: CSV_BUFFER, filename: 'x.csv', branchId: 'branch-1', actor: { ...CL_ADMIN, tenantId: null } }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(deps.branchRepo.findById).not.toHaveBeenCalled();
    });

    it('throws when the branch does not exist', async () => {
      const deps = buildDeps();
      deps.branchRepo.findById.mockResolvedValue(null);
      const uc = buildUseCase(deps);
      await expect(uc.execute({ fileBuffer: CSV_BUFFER, filename: 'x.csv', branchId: 'branch-1', actor: AM }))
        .rejects.toBeInstanceOf(AppointmentBranchNotFoundError);
    });

    it('throws when the branch is inactive', async () => {
      const deps = buildDeps();
      deps.branchRepo.findById.mockResolvedValue(buildBranch({ status: 'INACTIVE' }));
      const uc = buildUseCase(deps);
      await expect(uc.execute({ fileBuffer: CSV_BUFFER, filename: 'x.csv', branchId: 'branch-1', actor: AM }))
        .rejects.toBeInstanceOf(AppointmentBranchInactiveError);
    });
  });

  describe('persistence + response shape', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('uploads the file, persists a PREVIEW record, and returns the resolver output', async () => {
      const deps = buildDeps();
      deps.branchRepo.findById.mockResolvedValue(buildBranch());
      const resolvedRows = [{ rowNumber: 2, severity: 'ready', importable: true }];
      const summary = { totalRows: 1, importable: 1, withWarnings: 0, withErrors: 0 };
      deps.resolver.resolve.mockResolvedValue({ rows: resolvedRows, summary });
      const uc = buildUseCase(deps);

      const result = await uc.execute({ fileBuffer: CSV_BUFFER, filename: 'x.csv', branchId: 'branch-1', actor: AM });

      expect(deps.storageService.upload).toHaveBeenCalledTimes(1);
      const [key, buf, contentType] = deps.storageService.upload.mock.calls[0]!;
      expect(key).toMatch(/^imports\/appointments\/.+\/x\.csv$/);
      expect(buf).toBe(CSV_BUFFER);
      expect(contentType).toBe('text/csv');

      expect(deps.importRepo.save).toHaveBeenCalledTimes(1);
      const savedEntity = deps.importRepo.save.mock.calls[0]![0];
      expect(savedEntity.status).toBe('PREVIEW');
      expect(savedEntity.branchId).toBe('branch-1');
      expect(savedEntity.previewJson).toEqual({ summary, rows: resolvedRows });

      expect(result.rows).toEqual(resolvedRows);
      expect(result.summary).toEqual(summary);
      expect(result.branchId).toBe('branch-1');
      expect(typeof result.importId).toBe('string');
    });

    it('resolves rows in the platform timezone (Sydney)', async () => {
      const deps = buildDeps();
      deps.branchRepo.findById.mockResolvedValue(buildBranch());
      const uc = buildUseCase(deps);

      await uc.execute({ fileBuffer: CSV_BUFFER, filename: 'x.csv', branchId: 'branch-1', actor: AM });
      expect(deps.resolver.resolve).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ tz: 'Australia/Sydney' }));
    });

    it('geocode-verifies new-property rows and stores the verification in previewJson', async () => {
      const deps = buildDeps();
      deps.branchRepo.findById.mockResolvedValue(buildBranch());
      deps.resolver.resolve.mockResolvedValue({
        rows: [buildNewPropertyRow()],
        summary: { totalRows: 1, importable: 1, withWarnings: 0, withErrors: 0 },
      });
      const uc = buildUseCase(deps);

      const result = await uc.execute({ fileBuffer: CSV_BUFFER, filename: 'x.csv', branchId: 'branch-1', actor: AM });

      expect(deps.geocodeVerifier.verifyMany).toHaveBeenCalledTimes(1);
      expect(result.rows[0]!.property!.geocode).toEqual({ status: 'found', lat: -33.8, lng: 151.2 });
      const savedEntity = deps.importRepo.save.mock.calls[0]![0];
      expect(savedEntity.previewJson.rows[0].property.geocode).toEqual({ status: 'found', lat: -33.8, lng: 151.2 });
    });

    it('turns a not_found verification into an ADDRESS_NOT_FOUND warning and recomputes the summary', async () => {
      const deps = buildDeps();
      deps.branchRepo.findById.mockResolvedValue(buildBranch());
      deps.resolver.resolve.mockResolvedValue({
        rows: [buildNewPropertyRow()],
        summary: { totalRows: 1, importable: 1, withWarnings: 0, withErrors: 0 },
      });
      deps.geocodeVerifier.verifyMany.mockImplementation(async (addresses: Map<string, string>) => {
        const out = new Map();
        for (const key of addresses.keys()) out.set(key, { status: 'not_found', lat: null, lng: null });
        return out;
      });
      const uc = buildUseCase(deps);

      const result = await uc.execute({ fileBuffer: CSV_BUFFER, filename: 'x.csv', branchId: 'branch-1', actor: AM });

      expect(result.rows[0]!.issues).toEqual([
        expect.objectContaining({ code: 'ADDRESS_NOT_FOUND', severity: 'warning' }),
      ]);
      expect(result.rows[0]!.severity).toBe('warning');
      expect(result.rows[0]!.importable).toBe(true);
      expect(result.summary.withWarnings).toBe(1);
    });

    it('never geocodes existing-property rows', async () => {
      const deps = buildDeps();
      deps.branchRepo.findById.mockResolvedValue(buildBranch());
      const existingRow = buildNewPropertyRow();
      existingRow.property = { ...existingRow.property, resolution: 'existing' as never, propertyId: 'prop-1' as never, propertyCode: 'PROP-001' as never };
      deps.resolver.resolve.mockResolvedValue({
        rows: [existingRow],
        summary: { totalRows: 1, importable: 1, withWarnings: 0, withErrors: 0 },
      });
      const uc = buildUseCase(deps);

      await uc.execute({ fileBuffer: CSV_BUFFER, filename: 'x.csv', branchId: 'branch-1', actor: AM });
      expect(deps.geocodeVerifier.verifyMany).not.toHaveBeenCalled();
    });

    it('rejects a file with more rows than the preview cap, without uploading it', async () => {
      const deps = buildDeps();
      deps.branchRepo.findById.mockResolvedValue(buildBranch());
      const hugeCsv = Buffer.from('Type\n' + Array.from({ length: 2001 }, () => 'Routine Inspection').join('\n'));
      const uc = buildUseCase(deps);

      await expect(uc.execute({ fileBuffer: hugeCsv, filename: 'huge.csv', branchId: 'branch-1', actor: AM }))
        .rejects.toBeInstanceOf(ValidationError);
      expect(deps.storageService.upload).not.toHaveBeenCalled();
    });
  });
});
