import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';

// Mock functions for billing use cases
const mockListFinancialEntriesExecute = vi.fn();
const mockGetFinancialEntryExecute = vi.fn();
const mockApproveFinancialEntryExecute = vi.fn();
const mockCreateManualAdjustmentExecute = vi.fn();
const mockCreateRefundExecute = vi.fn();
const mockGenerateInvoiceExecute = vi.fn();
const mockListInvoicesExecute = vi.fn();
const mockGetInvoiceExecute = vi.fn();
const mockDownloadInvoiceExecute = vi.fn();
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
      listFinancialEntriesUseCase: { execute: mockListFinancialEntriesExecute },
      getFinancialEntryUseCase: { execute: mockGetFinancialEntryExecute },
      approveFinancialEntryUseCase: { execute: mockApproveFinancialEntryExecute },
      createManualAdjustmentUseCase: { execute: mockCreateManualAdjustmentExecute },
      createRefundUseCase: { execute: mockCreateRefundExecute },
      generateInvoiceUseCase: { execute: mockGenerateInvoiceExecute },
      listInvoicesUseCase: { execute: mockListInvoicesExecute },
      getInvoiceUseCase: { execute: mockGetInvoiceExecute },
      downloadInvoiceUseCase: { execute: mockDownloadInvoiceExecute },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
  }),
}));

const ENTRY_ID = 'e1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const INVOICE_ID = 'f2eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

const amContext = { userId: 'am-1', tenantId: null, role: 'AM', branchId: null };

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

// --- Financial Entries ---

describe('GET /v1/financial/entries', () => {
  it('should return 200 with paginated entries', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const listResult = {
      data: [
        {
          id: ENTRY_ID,
          tenantId: 'tenant-1',
          appointmentId: 'appt-1',
          inspectorId: null,
          entryType: 'TENANT_DEBIT',
          amount: '150.00',
          currency: 'AUD',
          status: 'APPROVED',
          description: 'Service debit',
          effectiveAt: '2026-03-16T00:00:00.000Z',
          reason: null,
          referenceEntryId: null,
          initiatedByUserId: 'SYSTEM',
          approvedByUserId: null,
          approvedAt: null,
          createdAt: '2026-03-16T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    };
    mockListFinancialEntriesExecute.mockResolvedValueOnce(listResult);

    const res = await supertest(app.server)
      .get('/v1/financial/entries')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  it('should return 401 without auth', async () => {
    const res = await supertest(app.server).get('/v1/financial/entries');
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/financial/entries/:entryId', () => {
  it('should return 200 with entry detail', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const entryResult = {
      id: ENTRY_ID,
      tenantId: 'tenant-1',
      appointmentId: 'appt-1',
      inspectorId: null,
      entryType: 'TENANT_DEBIT',
      amount: '150.00',
      currency: 'AUD',
      status: 'APPROVED',
      description: 'Service debit',
      effectiveAt: '2026-03-16T00:00:00.000Z',
      reason: null,
      referenceEntryId: null,
      initiatedByUserId: 'SYSTEM',
      approvedByUserId: null,
      approvedAt: null,
      createdAt: '2026-03-16T00:00:00.000Z',
    };
    mockGetFinancialEntryExecute.mockResolvedValueOnce(entryResult);

    const res = await supertest(app.server)
      .get(`/v1/financial/entries/${ENTRY_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(ENTRY_ID);
  });

  it('should return 401 without auth', async () => {
    const res = await supertest(app.server).get(`/v1/financial/entries/${ENTRY_ID}`);
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/financial/entries/:entryId/approve', () => {
  it('should return 200 with approval result', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const approveResult = {
      id: ENTRY_ID,
      status: 'APPROVED',
      approvedBy: 'am-1',
      approvedAt: new Date('2026-03-16T10:00:00.000Z'),
    };
    mockApproveFinancialEntryExecute.mockResolvedValueOnce(approveResult);

    const res = await supertest(app.server)
      .post(`/v1/financial/entries/${ENTRY_ID}/approve`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
  });

  it('should return 401 without auth', async () => {
    const res = await supertest(app.server).post(`/v1/financial/entries/${ENTRY_ID}/approve`);
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/financial/entries/adjust', () => {
  it('should return 201 with adjustment result', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const adjustResult = {
      id: 'new-adj-id',
      tenantId: 'tenant-1',
      appointmentId: null,
      inspectorId: null,
      entryType: 'MANUAL_ADJUSTMENT',
      amount: 50,
      currency: 'AUD',
      status: 'PENDING',
      description: 'Correction',
      reason: 'Overcharge correction',
      effectiveAt: new Date('2026-03-16T00:00:00.000Z'),
      initiatedByUserId: 'am-1',
      referenceEntryId: null,
      createdAt: new Date('2026-03-16T00:00:00.000Z'),
    };
    mockCreateManualAdjustmentExecute.mockResolvedValueOnce(adjustResult);

    const res = await supertest(app.server)
      .post('/v1/financial/entries/adjust')
      .set('Authorization', 'Bearer valid-token')
      .send({
        tenantId: 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
        amount: 50,
        description: 'Correction',
        reason: 'Overcharge correction',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.entryType).toBe('MANUAL_ADJUSTMENT');
  });

  it('should return 422 with invalid body (missing reason)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post('/v1/financial/entries/adjust')
      .set('Authorization', 'Bearer valid-token')
      .send({
        tenantId: 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
        amount: 50,
        description: 'Correction',
        // missing reason
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 401 without auth', async () => {
    const res = await supertest(app.server)
      .post('/v1/financial/entries/adjust')
      .send({
        tenantId: 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
        amount: 50,
        description: 'Correction',
        reason: 'Overcharge correction',
      });
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/financial/entries/:entryId/refund', () => {
  it('should return 201 with refund result', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const refundResult = {
      id: 'new-refund-id',
      tenantId: 'tenant-1',
      appointmentId: 'appt-1',
      entryType: 'REFUND',
      amount: 150,
      currency: 'AUD',
      status: 'PENDING',
      description: 'Service not performed',
      reason: 'Inspector did not show up',
      referenceEntryId: ENTRY_ID,
      initiatedByUserId: 'am-1',
      createdAt: new Date('2026-03-16T00:00:00.000Z'),
    };
    mockCreateRefundExecute.mockResolvedValueOnce(refundResult);

    const res = await supertest(app.server)
      .post(`/v1/financial/entries/${ENTRY_ID}/refund`)
      .set('Authorization', 'Bearer valid-token')
      .send({
        description: 'Service not performed',
        reason: 'Inspector did not show up',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.entryType).toBe('REFUND');
  });

  it('should return 422 with invalid body (empty description)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/financial/entries/${ENTRY_ID}/refund`)
      .set('Authorization', 'Bearer valid-token')
      .send({
        description: '',
        reason: 'Inspector did not show up',
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 401 without auth', async () => {
    const res = await supertest(app.server)
      .post(`/v1/financial/entries/${ENTRY_ID}/refund`)
      .send({
        description: 'Service not performed',
        reason: 'Inspector did not show up',
      });
    expect(res.status).toBe(401);
  });
});

// --- Invoices ---

describe('GET /v1/invoices', () => {
  it('should return 200 with paginated invoices', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const listResult = {
      data: [
        {
          id: INVOICE_ID,
          inspectorId: 'insp-1',
          periodStart: '2026-03-01',
          periodEnd: '2026-03-15',
          periodType: 'BIWEEKLY',
          status: 'CLOSED',
          totalAmount: '500.00',
          currency: 'AUD',
          generatedAt: '2026-03-16T00:00:00.000Z',
          paidAt: null,
          createdAt: '2026-03-16T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    };
    mockListInvoicesExecute.mockResolvedValueOnce(listResult);

    const res = await supertest(app.server)
      .get('/v1/invoices')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  it('should return 401 without auth', async () => {
    const res = await supertest(app.server).get('/v1/invoices');
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/invoices/generate', () => {
  it('should return 202 with invoice result', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const generateResult = {
      invoiceId: INVOICE_ID,
      status: 'CLOSED',
      totalAmount: '500.00',
      currency: 'AUD',
      message: 'Invoice generation queued. File will be available shortly.',
    };
    mockGenerateInvoiceExecute.mockResolvedValueOnce(generateResult);

    const res = await supertest(app.server)
      .post('/v1/invoices/generate')
      .set('Authorization', 'Bearer valid-token')
      .send({
        inspectorId: 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-15',
      });

    expect(res.status).toBe(202);
    expect(res.body.data.invoiceId).toBe(INVOICE_ID);
    expect(res.body.data.status).toBe('CLOSED');
  });

  it('should return 422 with invalid body (periodEnd < periodStart)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post('/v1/invoices/generate')
      .set('Authorization', 'Bearer valid-token')
      .send({
        inspectorId: 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
        periodStart: '2026-03-15',
        periodEnd: '2026-03-01',
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 401 without auth', async () => {
    const res = await supertest(app.server)
      .post('/v1/invoices/generate')
      .send({
        inspectorId: 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-15',
      });
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/invoices/:invoiceId', () => {
  it('should return 200 with invoice detail', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const invoiceResult = {
      id: INVOICE_ID,
      inspectorId: 'insp-1',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-15',
      periodType: 'BIWEEKLY',
      status: 'CLOSED',
      totalAmount: '500.00',
      currency: 'AUD',
      fileKey: null,
      generatedByUserId: 'am-1',
      generatedAt: '2026-03-16T00:00:00.000Z',
      paidAt: null,
      notes: null,
      createdAt: '2026-03-16T00:00:00.000Z',
      updatedAt: '2026-03-16T00:00:00.000Z',
    };
    mockGetInvoiceExecute.mockResolvedValueOnce(invoiceResult);

    const res = await supertest(app.server)
      .get(`/v1/invoices/${INVOICE_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(INVOICE_ID);
  });

  it('should return 401 without auth', async () => {
    const res = await supertest(app.server).get(`/v1/invoices/${INVOICE_ID}`);
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/invoices/:invoiceId/download', () => {
  it('should return 200 with download URL', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const downloadResult = {
      downloadUrl: 'https://stub-storage/billing-documents/invoices/insp-1/inv-1.xlsx?token=stub',
      expiresAt: '2026-03-16T11:00:00.000Z',
    };
    mockDownloadInvoiceExecute.mockResolvedValueOnce(downloadResult);

    const res = await supertest(app.server)
      .get(`/v1/invoices/${INVOICE_ID}/download`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('downloadUrl');
    expect(res.body.data).toHaveProperty('expiresAt');
  });

  it('should return 401 without auth', async () => {
    const res = await supertest(app.server).get(`/v1/invoices/${INVOICE_ID}/download`);
    expect(res.status).toBe(401);
  });
});
