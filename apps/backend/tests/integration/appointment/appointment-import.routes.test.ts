/**
 * Route-level coverage for the appointment-import preview/commit endpoints.
 * Exercises the actual Fastify route wiring — multipart part extraction,
 * Idempotency-Key enforcement, and (critically) that the preview response
 * actually serializes against `appointmentImportPreviewResponseSchema`
 * without throwing. Per `project_fastify_response_schema_serializer_throws`:
 * a route `response` schema that doesn't exactly match what the use case
 * returns throws a 500 AFTER the work is already done — mocking the use
 * case doesn't catch this, only a real route round-trip does.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockPreviewExecute = vi.fn();
const mockCommitExecute = vi.fn();
const mockGetImportStatusExecute = vi.fn();
const mockExportErrorsExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auditService: { log: vi.fn() } as any,
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: { jwtService: { verify: mockJwtVerify } },
    user: { jwtService: { verify: mockJwtVerify } },
    property: { jwtService: { verify: mockJwtVerify } },
    serviceType: { jwtService: { verify: mockJwtVerify } },
    pricingRule: { jwtService: { verify: mockJwtVerify } },
    inspector: { jwtService: { verify: mockJwtVerify } },
    appointment: {
      previewAppointmentImportUseCase: { execute: mockPreviewExecute },
      commitAppointmentImportUseCase: { execute: mockCommitExecute },
      getImportStatusUseCase: { execute: mockGetImportStatusExecute },
      exportAppointmentImportErrorsUseCase: { execute: mockExportErrorsExecute },
      jwtService: { verify: mockJwtVerify },
      tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true, settingsJson: {} }) },
    },
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
const BRANCH_ID = 'b1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b22';
const PROPERTY_ID = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';
const SERVICE_TYPE_ID = 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';
const IMPORT_ID = 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55';

const amContext = { userId: 'admin-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

const fullResolvedRow = {
  rowNumber: 2,
  severity: 'ready',
  importable: true,
  serviceTypeName: 'Routine Inspection',
  serviceTypeId: SERVICE_TYPE_ID,
  scheduledDate: '2027-06-20',
  scheduledDateDefaulted: false,
  timeSlotStart: '09:00',
  timeSlotEnd: '10:00',
  timeDefaulted: false,
  notes: null,
  property: {
    resolution: 'existing',
    propertyId: PROPERTY_ID,
    propertyCode: 'PROP-001',
    street: '1 Main St',
    addressLine2: null,
    suburb: 'Kogarah',
    state: 'NSW',
    postcode: '2217',
    country: 'AU',
    duplicateOfRow: null,
    geocode: null,
  },
  contact: {
    resolution: 'new',
    contactId: null,
    displayName: 'Jane Smith',
    primaryEmail: 'jane@example.com',
    primaryPhone: '0412345678',
    additionalChannels: [],
    channelsDropped: false,
  },
  customFields: [],
  customFieldsTruncated: false,
  issues: [],
};

const previewResult = {
  importId: IMPORT_ID,
  branchId: BRANCH_ID,
  tenantId: TENANT_ID,
  summary: { totalRows: 1, importable: 1, withWarnings: 0, withErrors: 0 },
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

describe('POST /v1/appointments/import/preview', () => {
  it('extracts branchId + file from the multipart body and returns 200 with a schema-valid body', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockPreviewExecute.mockResolvedValueOnce(previewResult);

    const res = await supertest(app.server)
      .post('/v1/appointments/import/preview')
      .set('Authorization', 'Bearer valid-token')
      .field('branchId', BRANCH_ID)
      .attach('file', Buffer.from('Type,Street\nRoutine Inspection,1 Main St\n'), 'import.csv');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(previewResult);
    expect(mockPreviewExecute).toHaveBeenCalledWith(expect.objectContaining({
      branchId: BRANCH_ID, filename: 'import.csv', actor: amContext,
    }));
  });

  it('returns 400 when branchId is missing', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post('/v1/appointments/import/preview')
      .set('Authorization', 'Bearer valid-token')
      .attach('file', Buffer.from('Type\n'), 'import.csv');

    expect(res.status).toBe(400);
    expect(mockPreviewExecute).not.toHaveBeenCalled();
  });

  it('returns 400 when no file is attached', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post('/v1/appointments/import/preview')
      .set('Authorization', 'Bearer valid-token')
      .field('branchId', BRANCH_ID);

    expect(res.status).toBe(400);
    expect(mockPreviewExecute).not.toHaveBeenCalled();
  });
});

describe('POST /v1/appointments/import/:importId/commit', () => {
  it('requires an Idempotency-Key header', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/appointments/import/${IMPORT_ID}/commit`)
      .set('Authorization', 'Bearer valid-token')
      .send({ skipInvalidRows: false });

    expect(res.status).toBe(400);
    expect(mockCommitExecute).not.toHaveBeenCalled();
  });

  it('returns 202 with a valid body and Idempotency-Key', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockCommitExecute.mockResolvedValueOnce({ importId: IMPORT_ID, status: 'PROCESSING' });

    const res = await supertest(app.server)
      .post(`/v1/appointments/import/${IMPORT_ID}/commit`)
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', 'commit-key-1')
      // actorTimezone is a legacy field — the schema strips it (Sydney-only platform).
      .send({ skipInvalidRows: true, actorTimezone: 'Australia/Sydney' });

    expect(res.status).toBe(202);
    expect(res.body.data).toEqual({ importId: IMPORT_ID, status: 'PROCESSING' });
    expect(mockCommitExecute).toHaveBeenCalledWith({
      importId: IMPORT_ID, skipInvalidRows: true,
      idempotencyKey: 'commit-key-1', actor: amContext,
    });
  });
});

describe('GET /v1/appointments/import/:importId', () => {
  it('returns the extended status including branchId/previewJson/resultsJson', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const statusResult = {
      id: IMPORT_ID, tenantId: TENANT_ID, branchId: BRANCH_ID, status: 'COMPLETED',
      originalFilename: 'import.csv', totalRows: 1, successCount: 1, errorCount: 0,
      errorsJson: null, previewJson: { summary: previewResult.summary, rows: previewResult.rows },
      resultsJson: [{ rowNumber: 2, status: 'created', appointmentId: 'apt-1' }],
      createdByUserId: 'admin-1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    mockGetImportStatusExecute.mockResolvedValueOnce(statusResult);

    const res = await supertest(app.server)
      .get(`/v1/appointments/import/${IMPORT_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.branchId).toBe(BRANCH_ID);
    expect(res.body.data.resultsJson).toEqual([{ rowNumber: 2, status: 'created', appointmentId: 'apt-1' }]);
  });
});

describe('GET /v1/appointments/import/:importId/errors.csv', () => {
  it('returns a text/csv attachment', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockExportErrorsExecute.mockResolvedValueOnce('row,message\n3,No service type found');

    const res = await supertest(app.server)
      .get(`/v1/appointments/import/${IMPORT_ID}/errors.csv`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain(`import-${IMPORT_ID}-errors.csv`);
    expect(res.text).toBe('row,message\n3,No service type found');
  });
});
