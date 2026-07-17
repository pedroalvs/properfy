import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResolvedPropertyImportRow } from '@properfy/shared';
import { PreviewPropertyImportUseCase } from './preview-property-import.use-case';
import { ValidationError } from '../../../../shared/domain/errors';
import { TenantInactiveError } from '../../domain/property.errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { PropertyImportRowResolver } from '../services/property-import-row-resolver';
import type { IImportGeocodeVerifier } from '../services/apply-geocode-verification';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const CSV = Buffer.from(
  'propertyCode,type,street,suburb,postcode,state,country\nAGY-PROP-0001,House,1 Test St,Sydney,2000,NSW,Australia\n',
);

const clAdmin = { userId: 'user-1', tenantId: TENANT_ID, role: 'CL_ADMIN' as const, email: 'a@b.c', branchId: null, inspectorId: null };
const opActor = { userId: 'user-2', tenantId: null, role: 'OP' as const, email: 'op@b.c', branchId: null, inspectorId: null };

function newRow(): ResolvedPropertyImportRow {
  return {
    rowNumber: 2,
    severity: 'ready',
    importable: true,
    propertyCode: 'AGY-PROP-0001',
    type: 'HOUSE',
    notes: null,
    property: {
      resolution: 'new',
      propertyId: null,
      propertyCode: 'AGY-PROP-0001',
      street: '1 Test St',
      addressLine2: null,
      suburb: 'Sydney',
      state: 'NSW',
      postcode: '2000',
      country: 'Australia',
      duplicateOfRow: null,
      geocode: null,
    },
    issues: [],
  };
}

describe('PreviewPropertyImportUseCase', () => {
  let importRepo: { save: ReturnType<typeof vi.fn> };
  let storageService: { upload: ReturnType<typeof vi.fn> };
  let tenantRepo: { findById: ReturnType<typeof vi.fn> };
  let resolver: { resolve: ReturnType<typeof vi.fn> };
  let verifier: { verifyMany: ReturnType<typeof vi.fn> } & IImportGeocodeVerifier;
  let authorizationService: AuthorizationService;

  beforeEach(() => {
    importRepo = { save: vi.fn().mockResolvedValue(undefined) };
    storageService = { upload: vi.fn().mockResolvedValue(undefined) };
    tenantRepo = { findById: vi.fn().mockResolvedValue({ isActive: () => true }) };
    resolver = {
      resolve: vi.fn().mockResolvedValue({
        rows: [newRow()],
        summary: { totalRows: 1, importable: 1, withWarnings: 0, withErrors: 0 },
      }),
    };
    verifier = {
      verifyMany: vi.fn().mockImplementation(async (addresses: Map<string, string>) => {
        const out = new Map();
        for (const key of addresses.keys()) out.set(key, { status: 'found', lat: -33.8, lng: 151.2 });
        return out;
      }),
    };
    authorizationService = { assertRoles: vi.fn() } as unknown as AuthorizationService;
  });

  function makeUseCase() {
    return new PreviewPropertyImportUseCase(
      importRepo as never,
      storageService as never,
      tenantRepo as never,
      resolver as unknown as PropertyImportRowResolver,
      verifier,
      authorizationService,
    );
  }

  it('previews a file: uploads, resolves, geocode-verifies and persists a PREVIEW record', async () => {
    const result = await makeUseCase().execute({ fileBuffer: CSV, filename: 'props.csv', actor: clAdmin });

    expect(storageService.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^imports\/properties\/.+\/props\.csv$/), CSV, 'text/csv',
    );
    expect(resolver.resolve).toHaveBeenCalledWith(
      [expect.objectContaining({ propertyCode: 'AGY-PROP-0001', street: '1 Test St' })],
      { tenantId: TENANT_ID },
    );
    expect(verifier.verifyMany).toHaveBeenCalledTimes(1);
    expect(result.tenantId).toBe(TENANT_ID);
    expect(result.rows[0]!.property!.geocode).toEqual({ status: 'found', lat: -33.8, lng: 151.2 });
    expect(result.summary).toEqual({ totalRows: 1, importable: 1, withWarnings: 0, withErrors: 0 });

    const saved = importRepo.save.mock.calls[0]![0];
    expect(saved.status).toBe('PREVIEW');
    expect(saved.tenantId).toBe(TENANT_ID);
    expect(saved.previewJson).toEqual({ summary: result.summary, rows: result.rows });
  });

  it('adds ADDRESS_NOT_FOUND warnings from the verifier into the summary', async () => {
    verifier.verifyMany.mockImplementation(async (addresses: Map<string, string>) => {
      const out = new Map();
      for (const key of addresses.keys()) out.set(key, { status: 'not_found', lat: null, lng: null });
      return out;
    });

    const result = await makeUseCase().execute({ fileBuffer: CSV, filename: 'props.csv', actor: clAdmin });

    expect(result.rows[0]!.issues).toEqual([
      expect.objectContaining({ code: 'ADDRESS_NOT_FOUND', severity: 'warning' }),
    ]);
    expect(result.summary.withWarnings).toBe(1);
    expect(result.rows[0]!.importable).toBe(true);
  });

  it('requires tenantId for AM/OP actors', async () => {
    await expect(
      makeUseCase().execute({ fileBuffer: CSV, filename: 'props.csv', actor: opActor }),
    ).rejects.toThrow(ValidationError);
  });

  it('uses the supplied tenantId for OP actors', async () => {
    const result = await makeUseCase().execute({
      fileBuffer: CSV, filename: 'props.csv', tenantId: TENANT_ID, actor: opActor,
    });
    expect(result.tenantId).toBe(TENANT_ID);
    expect(tenantRepo.findById).toHaveBeenCalledWith(TENANT_ID);
  });

  it('rejects inactive tenants', async () => {
    tenantRepo.findById.mockResolvedValue({ isActive: () => false });
    await expect(
      makeUseCase().execute({ fileBuffer: CSV, filename: 'props.csv', actor: clAdmin }),
    ).rejects.toThrow(TenantInactiveError);
  });

  it('rejects unsupported file extensions', async () => {
    await expect(
      makeUseCase().execute({ fileBuffer: CSV, filename: 'props.pdf', actor: clAdmin }),
    ).rejects.toThrow(ValidationError);
    expect(storageService.upload).not.toHaveBeenCalled();
  });

  it('rejects files above the preview row cap', async () => {
    const header = 'propertyCode,type,street,suburb,postcode,state,country\n';
    const bigCsv = Buffer.from(
      header + Array.from({ length: 2001 }, (_, i) => `P-${i},House,${i} St,Sydney,2000,NSW,Australia`).join('\n'),
    );
    await expect(
      makeUseCase().execute({ fileBuffer: bigCsv, filename: 'props.csv', actor: clAdmin }),
    ).rejects.toThrow(/maximum for preview/);
  });
});
