/**
 * Route-level coverage for whole-file import diagnostics: that `fileIssues`
 * survives the response serializer, and that an unreadable file reaches the
 * client as a 4xx carrying its own code (anything >= 500 has its message
 * replaced by a generic string in `getErrorMessage`, so a 500 could never
 * tell the user what is wrong with their file).
 *
 * Deliberately a separate file from appointment-import.routes.test.ts: the
 * preview route is rate-limited to 5 requests/minute and the limiter store is
 * per-app-instance, so a second file gets its own budget.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import {
  ImportFileMissingColumnsError,
  ImportFileCorruptXlsxError,
} from '../../../src/modules/appointment/domain/appointment-import.errors';

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
    apartmentNumber: null,
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

describe('POST /v1/appointments/import/preview — file diagnostics', () => {
  const attach = (filename: string) =>
    supertest(app.server)
      .post('/v1/appointments/import/preview')
      .set('Authorization', 'Bearer valid-token')
      .field('branchId', BRANCH_ID)
      .attach('file', Buffer.from('Type,Street\nRoutine Inspection,1 Main St\n'), filename);

  it('round-trips file issues through the response serializer', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockPreviewExecute.mockResolvedValueOnce({
      ...previewResult,
      fileIssues: [{
        code: 'IMPORT_FILE_MULTIPLE_SHEETS',
        severity: 'warning',
        message: 'This workbook has 2 sheets. Only "Data" was imported; "Instructions" was ignored.',
        missingColumns: [],
        foundColumns: [],
        unknownColumns: [],
        sheetUsed: 'Data',
        sheetsIgnored: ['Instructions'],
      }],
    });

    const res = await attach('import.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.fileIssues).toHaveLength(1);
    expect(res.body.data.fileIssues[0]).toMatchObject({
      code: 'IMPORT_FILE_MULTIPLE_SHEETS',
      sheetUsed: 'Data',
      sheetsIgnored: ['Instructions'],
    });
  });

  /**
   * The zod response serializer `safeParse`s the payload and throws a 500 on a
   * missing required key — AFTER the storage upload and the DB save have
   * committed. The `.default([])` on `fileIssues` is what turns an omitted key
   * into a benign empty array instead of a post-commit 500.
   */
  it('still returns 200 when the use case omits fileIssues entirely', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockPreviewExecute.mockResolvedValueOnce(previewResult);

    const res = await attach('import.csv');

    expect(res.status).toBe(200);
    expect(res.body.data.fileIssues).toEqual([]);
  });

  it('surfaces a missing-columns rejection as a 400 with its code and column lists', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockPreviewExecute.mockRejectedValueOnce(
      new ImportFileMissingColumnsError(['Suburb', 'Postcode'], ['Type', 'Street']),
    );

    const res = await attach('import.csv');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IMPORT_FILE_MISSING_COLUMNS');
    expect(res.body.error.message).toBe('This file is missing 2 required columns.');
    expect(res.body.error.details[0].missingColumns).toEqual(['Suburb', 'Postcode']);
    expect(res.body.error.details[0].foundColumns).toEqual(['Type', 'Street']);
  });

  it('surfaces a corrupted file as a 400, not the 500 it used to be', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockPreviewExecute.mockRejectedValueOnce(new ImportFileCorruptXlsxError());

    const res = await attach('import.xlsx');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IMPORT_FILE_CORRUPT_XLSX');
    expect(res.body.error.message).toContain('could not be opened');
  });
});
