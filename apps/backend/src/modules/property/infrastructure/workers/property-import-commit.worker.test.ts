import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GeocodeVerification, ResolvedPropertyImportRow } from '@properfy/shared';
import { PropertyImportCommitWorker } from './property-import-commit.worker';
import type { PropertyImportRowResolver } from '../../application/services/property-import-row-resolver';

const IMPORT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const actor = { userId: 'user-1', tenantId: TENANT_ID, role: 'CL_ADMIN' as const, email: 'a@b.c', branchId: null, inspectorId: null };

function plan(overrides: Partial<NonNullable<ResolvedPropertyImportRow['property']>> = {}) {
  return {
    resolution: 'new' as const,
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
    ...overrides,
  };
}

function row(overrides: Partial<ResolvedPropertyImportRow> = {}): ResolvedPropertyImportRow {
  return {
    rowNumber: 2,
    severity: 'ready',
    importable: true,
    propertyCode: 'AGY-PROP-0001',
    type: 'HOUSE',
    notes: null,
    property: plan(),
    issues: [],
    ...overrides,
  };
}

function importRecord(previewGeocode: GeocodeVerification | null, overrides: Record<string, unknown> = {}) {
  return {
    id: IMPORT_ID,
    tenantId: TENANT_ID,
    status: 'PREVIEW',
    fileKey: `imports/properties/${IMPORT_ID}/props.csv`,
    originalFilename: 'props.csv',
    previewJson: { summary: {}, rows: [{ property: plan({ geocode: previewGeocode }) }] },
    resultsJson: null,
    createdByUserId: 'user-1',
    ...overrides,
  };
}

describe('PropertyImportCommitWorker', () => {
  let importRepo: { findById: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  let storageService: { download: ReturnType<typeof vi.fn> };
  let propertyRepo: { save: ReturnType<typeof vi.fn>; findByNormalizedAddress: ReturnType<typeof vi.fn> };
  let resolver: { resolve: ReturnType<typeof vi.fn> };
  let jobQueue: { enqueue: ReturnType<typeof vi.fn> };
  let auditService: { log: ReturnType<typeof vi.fn> };
  let logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    importRepo = {
      findById: vi.fn().mockResolvedValue(importRecord({ status: 'found', lat: -33.8, lng: 151.2 })),
      update: vi.fn().mockResolvedValue(undefined),
    };
    storageService = { download: vi.fn().mockResolvedValue(Buffer.from('propertyCode,street\n')) };
    propertyRepo = {
      save: vi.fn().mockResolvedValue(undefined),
      findByNormalizedAddress: vi.fn().mockResolvedValue(null),
    };
    resolver = { resolve: vi.fn().mockResolvedValue({ rows: [row()], summary: {} }) };
    jobQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    auditService = { log: vi.fn() };
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  });

  function makeWorker() {
    return new PropertyImportCommitWorker(
      importRepo as never,
      storageService as never,
      propertyRepo as never,
      resolver as unknown as PropertyImportRowResolver,
      jobQueue as never,
      auditService as never,
      logger as never,
    );
  }

  it('persists a found geocode from preview as SUCCESS with coordinates and enqueues NO geocode job', async () => {
    await makeWorker().execute({ importId: IMPORT_ID, actor });

    expect(propertyRepo.save).toHaveBeenCalledTimes(1);
    const saved = propertyRepo.save.mock.calls[0]![0];
    expect(saved.geocodingStatus).toBe('SUCCESS');
    expect(saved.lat).toBe(-33.8);
    expect(saved.lng).toBe(151.2);
    expect(saved.propertyCode).toBe('AGY-PROP-0001');
    expect(jobQueue.enqueue).not.toHaveBeenCalled();

    const finalUpdate = importRepo.update.mock.calls.at(-1)![1];
    expect(finalUpdate.status).toBe('COMPLETED');
    expect(finalUpdate.successCount).toBe(1);
  });

  it('persists a not_found geocode as FAILED without enqueueing a geocode job', async () => {
    importRepo.findById.mockResolvedValue(importRecord({ status: 'not_found', lat: null, lng: null }));
    await makeWorker().execute({ importId: IMPORT_ID, actor });

    const saved = propertyRepo.save.mock.calls[0]![0];
    expect(saved.geocodingStatus).toBe('FAILED');
    expect(saved.lat).toBeNull();
    expect(jobQueue.enqueue).not.toHaveBeenCalled();
  });

  it('falls back to PENDING + async geocode job for unverified or missing verifications', async () => {
    importRepo.findById.mockResolvedValue(importRecord(null));
    await makeWorker().execute({ importId: IMPORT_ID, actor });

    const saved = propertyRepo.save.mock.calls[0]![0];
    expect(saved.geocodingStatus).toBe('PENDING');
    expect(jobQueue.enqueue).toHaveBeenCalledWith('property.geocode', { propertyId: saved.id });
  });

  it('reuses existing properties without creating or geocoding anything', async () => {
    resolver.resolve.mockResolvedValue({
      rows: [row({
        property: plan({ resolution: 'existing', propertyId: 'existing-id', propertyCode: 'EXIST-001' }),
      })],
      summary: {},
    });
    await makeWorker().execute({ importId: IMPORT_ID, actor });

    expect(propertyRepo.save).not.toHaveBeenCalled();
    expect(jobQueue.enqueue).not.toHaveBeenCalled();
    const finalUpdate = importRepo.update.mock.calls.at(-1)![1];
    expect(finalUpdate.resultsJson).toEqual([
      expect.objectContaining({ status: 'reused', propertyId: 'existing-id' }),
    ]);
    expect(finalUpdate.status).toBe('COMPLETED');
  });

  it('creates one property for intra-batch duplicate addresses and reuses it for the rest', async () => {
    resolver.resolve.mockResolvedValue({
      rows: [
        row(),
        row({ rowNumber: 3, propertyCode: 'AGY-PROP-0002', property: plan({ propertyCode: 'AGY-PROP-0002', duplicateOfRow: 2 }) }),
      ],
      summary: {},
    });
    await makeWorker().execute({ importId: IMPORT_ID, actor });

    expect(propertyRepo.save).toHaveBeenCalledTimes(1);
    const finalUpdate = importRepo.update.mock.calls.at(-1)![1];
    const results = finalUpdate.resultsJson as Array<{ status: string; propertyId?: string }>;
    expect(results[0]!.status).toBe('created');
    expect(results[1]!.status).toBe('reused');
    expect(results[1]!.propertyId).toBe(results[0]!.propertyId);
  });

  it('records non-importable rows as errors, in resultsJson and legacy errorsJson', async () => {
    resolver.resolve.mockResolvedValue({
      rows: [row({
        importable: false,
        severity: 'error',
        issues: [{ field: 'type', code: 'PROPERTY_TYPE_INVALID', severity: 'error', message: 'Invalid property type: Castle' }],
      })],
      summary: {},
    });
    await makeWorker().execute({ importId: IMPORT_ID, actor });

    expect(propertyRepo.save).not.toHaveBeenCalled();
    const finalUpdate = importRepo.update.mock.calls.at(-1)![1];
    expect(finalUpdate.status).toBe('FAILED');
    expect(finalUpdate.errorsJson).toEqual([
      { row: 2, field: 'general', message: 'Invalid property type: Castle' },
    ]);
  });

  it('recovers a concurrent address conflict (P2002) by reusing the winning property', async () => {
    const { Prisma } = await import('@prisma/client');
    const p2002 = new Prisma.PrismaClientKnownRequestError('conflict', {
      code: 'P2002', clientVersion: 'test', meta: { target: ['tenant_id', 'normalized_address_key'] },
    });
    propertyRepo.save.mockRejectedValue(p2002);
    propertyRepo.findByNormalizedAddress.mockResolvedValue({ id: 'winner-id' });

    await makeWorker().execute({ importId: IMPORT_ID, actor });

    const finalUpdate = importRepo.update.mock.calls.at(-1)![1];
    expect(finalUpdate.resultsJson).toEqual([
      expect.objectContaining({ status: 'reused', propertyId: 'winner-id' }),
    ]);
  });

  it('records a P2002 property-code conflict as a row error', async () => {
    const { Prisma } = await import('@prisma/client');
    const p2002 = new Prisma.PrismaClientKnownRequestError('conflict', {
      code: 'P2002', clientVersion: 'test', meta: { target: ['tenant_id', 'property_code'] },
    });
    propertyRepo.save.mockRejectedValue(p2002);

    await makeWorker().execute({ importId: IMPORT_ID, actor });

    const finalUpdate = importRepo.update.mock.calls.at(-1)![1];
    expect(finalUpdate.resultsJson).toEqual([
      expect.objectContaining({ status: 'error', message: expect.stringContaining('already exists') }),
    ]);
  });

  it('resumes from prior results without re-committing completed rows', async () => {
    importRepo.findById.mockResolvedValue(importRecord(null, {
      resultsJson: [{ rowNumber: 2, status: 'created', propertyId: 'prior-id' }],
    }));
    resolver.resolve.mockResolvedValue({
      rows: [
        row(),
        row({ rowNumber: 3, propertyCode: 'AGY-PROP-0002', property: plan({ propertyCode: 'AGY-PROP-0002', duplicateOfRow: 2 }) }),
      ],
      summary: {},
    });

    await makeWorker().execute({ importId: IMPORT_ID, actor });

    // Row 2 already done — no new save; row 3 (duplicate of 2) reuses prior-id.
    expect(propertyRepo.save).not.toHaveBeenCalled();
    const finalUpdate = importRepo.update.mock.calls.at(-1)![1];
    const results = finalUpdate.resultsJson as Array<{ status: string; propertyId?: string }>;
    expect(results[0]).toEqual({ rowNumber: 2, status: 'created', propertyId: 'prior-id' });
    expect(results[1]).toEqual(expect.objectContaining({ status: 'reused', propertyId: 'prior-id' }));
  });

  it('marks the import FAILED and rethrows on unexpected batch-level errors', async () => {
    storageService.download.mockRejectedValue(new Error('storage down'));
    await expect(makeWorker().execute({ importId: IMPORT_ID, actor })).rejects.toThrow('storage down');
    expect(importRepo.update).toHaveBeenLastCalledWith(IMPORT_ID, { status: 'FAILED' });
  });

  it('does nothing when the import record is gone (swept)', async () => {
    importRepo.findById.mockResolvedValue(null);
    await makeWorker().execute({ importId: IMPORT_ID, actor });
    expect(importRepo.update).not.toHaveBeenCalled();
  });
});
