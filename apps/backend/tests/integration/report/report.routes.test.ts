import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';

// Mock functions for report use cases
const mockRequestReportExecute = vi.fn();
const mockGetReportStatusExecute = vi.fn();
const mockDownloadReportExecute = vi.fn();
const mockListReportsExecute = vi.fn();
const mockProcessReportJobExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockAuditLog = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => ({
    prisma: {},
    auditService: { log: mockAuditLog },
    auth: {
      loginUseCase: { execute: vi.fn() },
      refreshTokenUseCase: { execute: vi.fn() },
      logoutUseCase: { execute: vi.fn() },
      getMeUseCase: { execute: vi.fn() },
      changePasswordUseCase: { execute: vi.fn() },
      revokeSessionUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    tenant: {
      createTenantUseCase: { execute: vi.fn() },
      getTenantUseCase: { execute: vi.fn() },
      listTenantsUseCase: { execute: vi.fn() },
      updateTenantUseCase: { execute: vi.fn() },
      deactivateTenantUseCase: { execute: vi.fn() },
      createBranchUseCase: { execute: vi.fn() },
      listBranchesUseCase: { execute: vi.fn() },
      updateBranchUseCase: { execute: vi.fn() },
      deactivateBranchUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    user: {
      createUserUseCase: { execute: vi.fn() },
      getUserUseCase: { execute: vi.fn() },
      listUsersUseCase: { execute: vi.fn() },
      updateUserUseCase: { execute: vi.fn() },
      deactivateUserUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    property: {
      createPropertyUseCase: { execute: vi.fn() },
      getPropertyUseCase: { execute: vi.fn() },
      listPropertiesUseCase: { execute: vi.fn() },
      updatePropertyUseCase: { execute: vi.fn() },
      deletePropertyUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    serviceType: {
      createServiceTypeUseCase: { execute: vi.fn() },
      getServiceTypeUseCase: { execute: vi.fn() },
      listServiceTypesUseCase: { execute: vi.fn() },
      updateServiceTypeUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    pricingRule: {
      createPricingRuleUseCase: { execute: vi.fn() },
      listPricingRulesUseCase: { execute: vi.fn() },
      updatePricingRuleUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    inspector: {
      createInspectorUseCase: { execute: vi.fn() },
      getInspectorUseCase: { execute: vi.fn() },
      listInspectorsUseCase: { execute: vi.fn() },
      updateInspectorUseCase: { execute: vi.fn() },
      createAvailabilitySlotUseCase: { execute: vi.fn() },
      listAvailabilitySlotsUseCase: { execute: vi.fn() },
      updateAvailabilitySlotUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    appointment: {
      createAppointmentUseCase: { execute: vi.fn() },
      getAppointmentUseCase: { execute: vi.fn() },
      listAppointmentsUseCase: { execute: vi.fn() },
      updateAppointmentUseCase: { execute: vi.fn() },
      executeStatusTransitionUseCase: { execute: vi.fn() },
      forceManualConfirmationUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    audit: {
      listAuditLogsUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    serviceGroup: {
      createServiceGroupUseCase: { execute: vi.fn() },
      getServiceGroupUseCase: { execute: vi.fn() },
      listServiceGroupsUseCase: { execute: vi.fn() },
      publishServiceGroupUseCase: { execute: vi.fn() },
      assignInspectorManuallyUseCase: { execute: vi.fn() },
      cancelServiceGroupUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    marketplace: {
      getMarketplaceOffersUseCase: { execute: vi.fn() },
      acceptOfferUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    tenantPortal: {
      getPortalDataUseCase: { execute: vi.fn() },
      confirmAppointmentUseCase: { execute: vi.fn() },
      rescheduleRequestUseCase: { execute: vi.fn() },
      updateContactUseCase: { execute: vi.fn() },
      reportUnavailabilityUseCase: { execute: vi.fn() },
      generatePortalTokenUseCase: { execute: vi.fn() },
      tokenRepo: { findByTokenHash: vi.fn(), findActiveByAppointmentId: vi.fn(), save: vi.fn(), updateStatus: vi.fn(), updateLastAccessedAt: vi.fn(), revokeAllForAppointment: vi.fn() },
      tokenService: { generateRawToken: vi.fn(), hashToken: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    inspectorExecution: {
      getInspectorScheduleUseCase: { execute: vi.fn() },
      getAppointmentDetailUseCase: { execute: vi.fn() },
      startInspectionUseCase: { execute: vi.fn() },
      finishInspectionUseCase: { execute: vi.fn() },
      requestAssetUploadUseCase: { execute: vi.fn() },
      confirmAssetUploadUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    billing: {
      createFinancialEntriesOnDoneUseCase: { execute: vi.fn() },
      listFinancialEntriesUseCase: { execute: vi.fn() },
      getFinancialEntryUseCase: { execute: vi.fn() },
      approveFinancialEntryUseCase: { execute: vi.fn() },
      createManualAdjustmentUseCase: { execute: vi.fn() },
      createRefundUseCase: { execute: vi.fn() },
      generateInvoiceUseCase: { execute: vi.fn() },
      listInvoicesUseCase: { execute: vi.fn() },
      getInvoiceUseCase: { execute: vi.fn() },
      downloadInvoiceUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    report: {
      requestReportUseCase: { execute: mockRequestReportExecute },
      getReportStatusUseCase: { execute: mockGetReportStatusExecute },
      downloadReportUseCase: { execute: mockDownloadReportExecute },
      listReportsUseCase: { execute: mockListReportsExecute },
      processReportJobUseCase: { execute: mockProcessReportJobExecute },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    notification: {
      sendNotificationUseCase: { execute: vi.fn() },
      retryNotificationUseCase: { execute: vi.fn() },
      handleProviderWebhookUseCase: { execute: vi.fn() },
      listNotificationsUseCase: { execute: vi.fn() },
      getNotificationUseCase: { execute: vi.fn() },
      upsertNotificationTemplateUseCase: { execute: vi.fn() },
      listNotificationTemplatesUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
  }),
}));

const REPORT_ID = 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const amContext = { userId: 'am-1', tenantId: null, role: 'AM', branchId: null };
const clAdminContext = { userId: 'cl-1', tenantId: 'tenant-1', role: 'CL_ADMIN', branchId: null };

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// --- POST /v1/reports ---

describe('POST /v1/reports', () => {
  const validBody = {
    reportType: 'INSPECTIONS_SCHEDULED',
    filters: {
      fromDate: '2026-01-01',
      toDate: '2026-03-01',
    },
    format: 'XLSX',
  };

  it('should return 401 without auth', async () => {
    const res = await supertest(app.server).post('/v1/reports').send(validBody);
    expect(res.status).toBe(401);
  });

  it('should return 202 with valid body for AM', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const now = new Date();
    mockRequestReportExecute.mockResolvedValueOnce({
      reportId: REPORT_ID,
      status: 'PENDING',
      reportType: 'INSPECTIONS_SCHEDULED',
      createdAt: now,
    });

    const res = await supertest(app.server)
      .post('/v1/reports')
      .set('Authorization', 'Bearer valid-token')
      .send(validBody);

    expect(res.status).toBe(202);
    expect(res.body.data.reportId).toBe(REPORT_ID);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.reportType).toBe('INSPECTIONS_SCHEDULED');
    expect(res.body.message).toBe('Report generation request accepted');
  });

  it('should return 403 when CL_ADMIN requests INSPECTOR_PERFORMANCE', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);

    const { ReportTypeForbiddenError } = await import(
      '../../../src/modules/report/domain/report.errors'
    );
    mockRequestReportExecute.mockRejectedValueOnce(new ReportTypeForbiddenError());

    const res = await supertest(app.server)
      .post('/v1/reports')
      .set('Authorization', 'Bearer valid-token')
      .send({
        reportType: 'INSPECTOR_PERFORMANCE',
        filters: { fromDate: '2026-01-01', toDate: '2026-03-01' },
        format: 'XLSX',
      });

    expect(res.status).toBe(403);
  });

  it('should return 403 when CL_ADMIN provides tenantId not matching own', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);

    const { ReportTenantScopeViolationError } = await import(
      '../../../src/modules/report/domain/report.errors'
    );
    mockRequestReportExecute.mockRejectedValueOnce(new ReportTenantScopeViolationError());

    const res = await supertest(app.server)
      .post('/v1/reports')
      .set('Authorization', 'Bearer valid-token')
      .send({
        reportType: 'INSPECTIONS_SCHEDULED',
        filters: { fromDate: '2026-01-01', toDate: '2026-03-01', tenantId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' },
        format: 'XLSX',
      });

    expect(res.status).toBe(403);
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
      .send({
        reportType: 'INSPECTIONS_SCHEDULED',
        filters: { fromDate: '2024-01-01', toDate: '2026-03-01' },
        format: 'XLSX',
      });

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
    const listResult = {
      data: [
        {
          id: REPORT_ID,
          reportType: 'INSPECTIONS_SCHEDULED',
          status: 'READY',
          format: 'XLSX',
          filters: { fromDate: '2026-01-01', toDate: '2026-03-01' },
          rowCount: 42,
          requestedByUserId: 'am-1',
          createdAt: '2026-03-16T09:00:00.000Z',
          completedAt: '2026-03-16T09:05:00.000Z',
          expiresAt: '2026-04-15T09:05:00.000Z',
          errorMessage: null,
        },
      ],
      meta: {
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      },
    };
    mockListReportsExecute.mockResolvedValueOnce(listResult);

    const res = await supertest(app.server)
      .get('/v1/reports')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
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
    const statusResult = {
      id: REPORT_ID,
      reportType: 'INSPECTIONS_SCHEDULED',
      status: 'READY',
      format: 'XLSX',
      filters: { fromDate: '2026-01-01', toDate: '2026-03-01' },
      rowCount: 42,
      requestedByUserId: 'am-1',
      createdAt: '2026-03-16T09:00:00.000Z',
      startedAt: '2026-03-16T09:01:00.000Z',
      completedAt: '2026-03-16T09:05:00.000Z',
      failedAt: null,
      expiresAt: '2026-04-15T09:05:00.000Z',
      errorMessage: null,
    };
    mockGetReportStatusExecute.mockResolvedValueOnce(statusResult);

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
    const expiresAt = new Date('2026-03-16T11:00:00.000Z');
    const downloadResult = {
      downloadUrl: 'https://storage.example.com/signed/reports/platform/INSPECTIONS_SCHEDULED/report-id.xlsx?token=stub-token',
      fileName: 'inspections-scheduled-2026-01-01-to-2026-03-01.xlsx',
      expiresAt,
    };
    mockDownloadReportExecute.mockResolvedValueOnce(downloadResult);

    const res = await supertest(app.server)
      .get(`/v1/reports/${REPORT_ID}/download`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.downloadUrl).toContain('storage.example.com');
    expect(res.body.data.fileName).toContain('inspections-scheduled');
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
