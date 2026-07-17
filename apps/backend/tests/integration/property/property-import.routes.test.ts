/**
 * Route-level coverage for the property-import preview/commit endpoints.
 * Exercises the actual Fastify route wiring — multipart part extraction,
 * Idempotency-Key enforcement, and (critically) that the preview response
 * actually serializes against `propertyImportPreviewResponseSchema` without
 * throwing. Per `project_fastify_response_schema_serializer_throws`: a route
 * `response` schema that doesn't exactly match what the use case returns
 * throws a 500 AFTER the work is already done — only a real route round-trip
 * catches this.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockPreviewExecute = vi.fn();
const mockCommitExecute = vi.fn();
const mockGetStatusExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auditService: { log: vi.fn() } as any,
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: { jwtService: { verify: mockJwtVerify } },
    user: { jwtService: { verify: mockJwtVerify } },
    property: {
      previewPropertyImportUseCase: { execute: mockPreviewExecute },
      commitPropertyImportUseCase: { execute: mockCommitExecute },
      getPropertyImportStatusUseCase: { execute: mockGetStatusExecute },
      jwtService: { verify: mockJwtVerify },
      tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true, settingsJson: {} }) },
    },
    serviceType: { jwtService: { verify: mockJwtVerify } },
    pricingRule: { jwtService: { verify: mockJwtVerify } },
    inspector: { jwtService: { verify: mockJwtVerify } },
    appointment: { jwtService: { verify: mockJwtVerify } },
    audit: { jwtService: { verify: mockJwtVerify } },
    serviceGroup: { jwtService: { verify: mockJwtVerify } },
    marketplace: { jwtService: { verify: mockJwtVerify } },
    rentalTenantPortal: { jwtService: { verify: mockJwtVerify } },
    inspectorExecution: { jwtService: { verify: mockJwtVerify } },
    billing: { jwtService: { verify: mockJwtVerify } },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const IMPORT_ID = 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55';

const amContext = { userId: 'admin-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

const fullResolvedRow = {
  rowNumber: 2,
  severity: 'warning',
  importable: true,
  propertyCode: 'AGY-PROP-0001',
  type: 'HOUSE',
  notes: null,
  property: {
    resolution: 'new',
    propertyId: null,
    propertyCode: 'AGY-PROP-0001',
    street: '1 Main St',
    addressLine2: null,
    suburb: 'Kogarah',
    state: 'NSW',
    postcode: '2217',
    country: 'AU',
    duplicateOfRow: null,
    geocode: { status: 'not_found', lat: null, lng: null },
  },
  issues: [
    { field: 'property', code: 'ADDRESS_NOT_FOUND', severity: 'warning', message: 'Address was not found by geocoding — the property will be created but flagged for manual location' },
  ],
};

const previewResult = {
  importId: IMPORT_ID,
  tenantId: TENANT_ID,
  summary: { totalRows: 1, importable: 1, withWarnings: 1, withErrors: 0 },
  rows: [fullResolvedRow],
};

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(() => { vi.clearAllMocks(); });

describe('POST /v1/properties/import/preview', () => {
  it('extracts tenantId + file from the multipart body and returns 200 with a schema-valid body', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockPreviewExecute.mockResolvedValueOnce(previewResult);

    const res = await supertest(app.server)
      .post('/v1/properties/import/preview')
      .set('Authorization', 'Bearer valid-token')
      .field('tenantId', TENANT_ID)
      .attach('file', Buffer.from('propertyCode,street\nAGY-PROP-0001,1 Main St\n'), 'props.csv');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(previewResult);
    expect(mockPreviewExecute).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TENANT_ID, filename: 'props.csv', actor: amContext,
    }));
  });

  it('works without a tenantId field (tenant-scoped actors)', async () => {
    mockJwtVerify.mockResolvedValueOnce({ ...amContext, role: 'CL_ADMIN', tenantId: TENANT_ID });
    mockPreviewExecute.mockResolvedValueOnce(previewResult);

    const res = await supertest(app.server)
      .post('/v1/properties/import/preview')
      .set('Authorization', 'Bearer valid-token')
      .attach('file', Buffer.from('propertyCode\n'), 'props.csv');

    expect(res.status).toBe(200);
    expect(mockPreviewExecute).toHaveBeenCalledWith(
      expect.not.objectContaining({ tenantId: expect.anything() }),
    );
  });

  it('returns 400 for a malformed tenantId field', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post('/v1/properties/import/preview')
      .set('Authorization', 'Bearer valid-token')
      .field('tenantId', 'not-a-uuid')
      .attach('file', Buffer.from('propertyCode\n'), 'props.csv');

    expect(res.status).toBe(400);
    expect(mockPreviewExecute).not.toHaveBeenCalled();
  });

  it('returns 400 when no file is attached', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post('/v1/properties/import/preview')
      .set('Authorization', 'Bearer valid-token')
      .field('tenantId', TENANT_ID);

    expect(res.status).toBe(400);
    expect(mockPreviewExecute).not.toHaveBeenCalled();
  });
});

describe('POST /v1/properties/import/:importId/commit', () => {
  it('requires an Idempotency-Key header', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/properties/import/${IMPORT_ID}/commit`)
      .set('Authorization', 'Bearer valid-token')
      .send({ skipInvalidRows: false });

    expect(res.status).toBe(400);
    expect(mockCommitExecute).not.toHaveBeenCalled();
  });

  it('returns 202 with a valid body and Idempotency-Key', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockCommitExecute.mockResolvedValueOnce({ importId: IMPORT_ID, status: 'PROCESSING' });

    const res = await supertest(app.server)
      .post(`/v1/properties/import/${IMPORT_ID}/commit`)
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', 'commit-key-1')
      .send({ skipInvalidRows: true });

    expect(res.status).toBe(202);
    expect(res.body.data).toEqual({ importId: IMPORT_ID, status: 'PROCESSING' });
    expect(mockCommitExecute).toHaveBeenCalledWith({
      importId: IMPORT_ID, skipInvalidRows: true,
      idempotencyKey: 'commit-key-1', actor: amContext,
    });
  });
});

describe('GET /v1/properties/import/:importId', () => {
  it('returns the extended status including previewJson/resultsJson', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const statusResult = {
      id: IMPORT_ID, tenantId: TENANT_ID, status: 'COMPLETED',
      originalFilename: 'props.csv', totalRows: 1, successCount: 1, errorCount: 0,
      errorsJson: null, previewJson: { summary: previewResult.summary, rows: previewResult.rows },
      resultsJson: [{ rowNumber: 2, status: 'created', propertyId: 'prop-1' }],
      createdByUserId: 'admin-1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    mockGetStatusExecute.mockResolvedValueOnce(statusResult);

    const res = await supertest(app.server)
      .get(`/v1/properties/import/${IMPORT_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.previewJson.summary).toEqual(previewResult.summary);
    expect(res.body.data.resultsJson).toEqual([{ rowNumber: 2, status: 'created', propertyId: 'prop-1' }]);
  });
});
