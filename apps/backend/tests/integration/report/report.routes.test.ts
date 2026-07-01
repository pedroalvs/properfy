import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockRequestReportExecute = vi.fn();
const mockGetReportStatusExecute = vi.fn();
const mockDownloadReportExecute = vi.fn();
const mockListReportsExecute = vi.fn();
const mockProcessReportJobExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockAuditLog = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auditService: { log: mockAuditLog } as any,
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: { jwtService: { verify: mockJwtVerify } },
    user: { jwtService: { verify: mockJwtVerify } },
    property: { jwtService: { verify: mockJwtVerify } },
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
    report: {
      requestReportUseCase: { execute: mockRequestReportExecute },
      getReportStatusUseCase: { execute: mockGetReportStatusExecute },
      downloadReportUseCase: { execute: mockDownloadReportExecute },
      listReportsUseCase: { execute: mockListReportsExecute },
      processReportJobUseCase: { execute: mockProcessReportJobExecute },
      jwtService: { verify: mockJwtVerify },
    },
    notification: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const REPORT_ID = 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const amContext = { userId: 'am-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const clAdminContext = { userId: 'cl-1', tenantId: 'tenant-1', role: 'CL_ADMIN', branchId: null, inspectorId: null };

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(() => { vi.clearAllMocks(); });

const fullReport = {
  id: REPORT_ID,
  tenantId: null,
  reportType: 'APPOINTMENTS',
  filtersJson: { fromDate: '2026-01-01', toDate: '2026-03-01', dateAxis: 'SCHEDULED' },
  status: 'READY',
  fileKey: null,
  requestedByUserId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99',
  startedAt: '2026-03-16T09:01:00.000Z',
  completedAt: '2026-03-16T09:05:00.000Z',
  failedAt: null,
  errorMessage: null,
  rowCount: 42,
  expiresAt: '2026-04-15T09:05:00.000Z',
  createdAt: '2026-03-16T09:00:00.000Z',
  updatedAt: '2026-03-16T09:05:00.000Z',
};

// --- POST /v1/reports ---

describe('POST /v1/reports', () => {
  const validBody = {
    reportType: 'APPOINTMENTS',
    filters: {
      fromDate: '2026-01-01',
      toDate: '2026-03-01',
      dateAxis: 'SCHEDULED',
    },
  };

  it('should return 401 without auth', async () => {
    const res = await supertest(app.server).post('/v1/reports').send(validBody);
    expect(res.status).toBe(401);
  });

  it('should return 202 with valid body for AM', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockRequestReportExecute.mockResolvedValueOnce({
      reportId: REPORT_ID,
      status: 'PENDING',
      reportType: 'APPOINTMENTS',
      createdAt: '2026-03-16T09:00:00.000Z',
    });

    const res = await supertest(app.server)
      .post('/v1/reports')
      .set('Authorization', 'Bearer valid-token')
      .send(validBody);

    expect(res.status).toBe(202);
    expect(res.body.data.reportId).toBe(REPORT_ID);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.reportType).toBe('APPOINTMENTS');
    expect(res.body.message).toBe('Report generation request accepted');
  });

  it('should return 403 when a non-operator requests a report', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);

    const { ReportForbiddenError } = await import(
      '../../../src/modules/report/domain/report.errors'
    );
    mockRequestReportExecute.mockRejectedValueOnce(new ReportForbiddenError());

    // Uses a valid new report type so the request reaches auth (body validation runs first).
    const res = await supertest(app.server)
      .post('/v1/reports')
      .set('Authorization', 'Bearer valid-token')
      .send({ reportType: 'APPOINTMENTS', filters: { fromDate: '2026-01-01', toDate: '2026-03-01' } });

    expect(res.status).toBe(403);
  });

  it('should return 400 for a removed legacy report type', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post('/v1/reports')
      .set('Authorization', 'Bearer valid-token')
      .send({ reportType: 'INSPECTIONS_SCHEDULED', filters: { fromDate: '2026-01-01', toDate: '2026-03-01' } });

    expect(res.status).toBe(400);
  });

  it('should return 422 when date range is invalid', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const { ReportDateRangeExceededError } = await import(
      '../../../src/modules/report/domain/report.errors'
    );
    mockRequestReportExecute.mockRejectedValueOnce(new ReportDateRangeExceededError(12));

    const res = await supertest(app.server)
      .post('/v1/reports')
      .set('Authorization', 'Bearer valid-token')
      .send({ reportType: 'APPOINTMENTS', filters: { fromDate: '2024-01-01', toDate: '2026-03-01' } });

    expect(res.status).toBe(422);
  });

  it('should return 429 when concurrent limit exceeded', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const { ReportConcurrentLimitExceededError } = await import(
      '../../../src/modules/report/domain/report.errors'
    );
    mockRequestReportExecute.mockRejectedValueOnce(new ReportConcurrentLimitExceededError());

    const res = await supertest(app.server)
      .post('/v1/reports')
      .set('Authorization', 'Bearer valid-token')
      .send(validBody);

    expect(res.status).toBe(429);
  });
});

// --- GET /v1/reports ---

describe('GET /v1/reports', () => {
  it('should return 401 without auth', async () => {
    const res = await supertest(app.server).get('/v1/reports');
    expect(res.status).toBe(401);
  });

  it('should return 200 with paginated data for AM', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockListReportsExecute.mockResolvedValueOnce({
      data: [fullReport],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });

    const res = await supertest(app.server)
      .get('/v1/reports')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });
});

// --- GET /v1/reports/:reportId ---

describe('GET /v1/reports/:reportId', () => {
  it('should return 401 without auth', async () => {
    const res = await supertest(app.server).get(`/v1/reports/${REPORT_ID}`);
    expect(res.status).toBe(401);
  });

  it('should return 200 with report status for AM', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGetReportStatusExecute.mockResolvedValueOnce(fullReport);

    const res = await supertest(app.server)
      .get(`/v1/reports/${REPORT_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(REPORT_ID);
    expect(res.body.data.status).toBe('READY');
  });

  it('should return 404 when report not found', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const { ReportNotFoundError } = await import(
      '../../../src/modules/report/domain/report.errors'
    );
    mockGetReportStatusExecute.mockRejectedValueOnce(new ReportNotFoundError());

    const res = await supertest(app.server)
      .get(`/v1/reports/${REPORT_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
  });
});

// --- GET /v1/reports/:reportId/download ---

describe('GET /v1/reports/:reportId/download', () => {
  it('should return 401 without auth', async () => {
    const res = await supertest(app.server).get(`/v1/reports/${REPORT_ID}/download`);
    expect(res.status).toBe(401);
  });

  it('should return 200 with download URL for AM', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const downloadResult = {
      downloadUrl: 'https://storage.example.com/signed/reports/platform/APPOINTMENTS/report-id.xlsx?token=stub-token',
      expiresAt: '2026-03-16T11:00:00.000Z',
    };
    mockDownloadReportExecute.mockResolvedValueOnce(downloadResult);

    const res = await supertest(app.server)
      .get(`/v1/reports/${REPORT_ID}/download`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.downloadUrl).toContain('storage.example.com');
  });

  it('should return 409 when report is not ready', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const { ReportNotReadyError } = await import(
      '../../../src/modules/report/domain/report.errors'
    );
    mockDownloadReportExecute.mockRejectedValueOnce(new ReportNotReadyError());

    const res = await supertest(app.server)
      .get(`/v1/reports/${REPORT_ID}/download`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(409);
  });

  it('should return 410 when report has expired', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const { ReportExpiredError } = await import(
      '../../../src/modules/report/domain/report.errors'
    );
    mockDownloadReportExecute.mockRejectedValueOnce(new ReportExpiredError());

    const res = await supertest(app.server)
      .get(`/v1/reports/${REPORT_ID}/download`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(410);
  });
});
