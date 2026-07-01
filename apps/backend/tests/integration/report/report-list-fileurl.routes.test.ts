/**
 * QA-011-HIGH-001: GET /v1/reports and GET /v1/reports/:id must expose fileUrl
 * for READY reports so the frontend can offer a download link.
 *
 * Root cause: list-reports and get-report-status use cases did not call
 * storageService.generatePresignedGetUrl — they only returned fileKey (internal).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockListReportsExecute = vi.fn();
const mockGetReportStatusExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
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
        listReportsUseCase: { execute: mockListReportsExecute },
        getReportStatusUseCase: { execute: mockGetReportStatusExecute },
        jwtService: { verify: mockJwtVerify },
      },
      notification: { jwtService: { verify: mockJwtVerify } },
      serviceRegion: { jwtService: { verify: mockJwtVerify } },
      contact: { jwtService: { verify: mockJwtVerify } },
      appointmentTimeSlot: { jwtService: { verify: mockJwtVerify } },
      dashboard: { jwtService: { verify: mockJwtVerify } },
    } as any),
}));

const REPORT_ID = 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const amContext = { userId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

const readyReportWithUrl = {
  id: REPORT_ID,
  tenantId: null,
  reportType: 'APPOINTMENTS',
  filtersJson: { fromDate: '2026-01-01', toDate: '2026-03-01', dateAxis: 'SCHEDULED' },
  status: 'READY',
  fileKey: 'reports/tenant-1/2026-03-16/report.xlsx',
  fileUrl: 'https://supabase.example/storage/v1/object/sign/reports/tenant-1/2026-03-16/report.xlsx?token=signed',
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

const pendingReportNoUrl = {
  ...readyReportWithUrl,
  status: 'PENDING',
  fileKey: null,
  fileUrl: null,
  completedAt: null,
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

describe('QA-011-HIGH-001 — GET /v1/reports returns fileUrl for READY reports', () => {
  it('READY report includes fileUrl in list response', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockListReportsExecute.mockResolvedValueOnce({
      data: [readyReportWithUrl],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });

    const res = await supertest(app.server)
      .get('/v1/reports')
      .set('Authorization', 'Bearer am-token')
      .expect(200);

    expect(res.body.data[0].fileUrl).toBeDefined();
    expect(res.body.data[0].fileUrl).toContain('https://');
  });

  it('PENDING report has null fileUrl in list response', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockListReportsExecute.mockResolvedValueOnce({
      data: [pendingReportNoUrl],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });

    const res = await supertest(app.server)
      .get('/v1/reports')
      .set('Authorization', 'Bearer am-token')
      .expect(200);

    expect(res.body.data[0].fileUrl).toBeNull();
  });
});

describe('QA-011-HIGH-001 — GET /v1/reports/:reportId returns fileUrl for READY reports', () => {
  it('READY report includes fileUrl in status response', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGetReportStatusExecute.mockResolvedValueOnce({
      ...readyReportWithUrl,
      requestedBy: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99', name: 'AM User' },
      startedAt: new Date('2026-03-16T09:01:00.000Z'),
      failedAt: null,
    });

    const res = await supertest(app.server)
      .get(`/v1/reports/${REPORT_ID}`)
      .set('Authorization', 'Bearer am-token')
      .expect(200);

    expect(res.body.data.fileUrl).toBeDefined();
    expect(res.body.data.fileUrl).toContain('https://');
  });

  it('PENDING report has null fileUrl in status response', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGetReportStatusExecute.mockResolvedValueOnce({
      ...pendingReportNoUrl,
      requestedBy: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99', name: 'AM User' },
      startedAt: null,
      failedAt: null,
    });

    const res = await supertest(app.server)
      .get(`/v1/reports/${REPORT_ID}`)
      .set('Authorization', 'Bearer am-token')
      .expect(200);

    expect(res.body.data.fileUrl).toBeNull();
  });
});
