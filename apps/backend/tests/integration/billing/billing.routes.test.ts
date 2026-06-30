import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockGetFinancialSummaryExecute = vi.fn();
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
    billing: {
      createFinancialEntriesOnDoneUseCase: { execute: vi.fn() },
      getFinancialSummaryUseCase: { execute: mockGetFinancialSummaryExecute },
      listFinancialEntriesUseCase: { execute: mockListFinancialEntriesExecute },
      getFinancialEntryUseCase: { execute: mockGetFinancialEntryExecute },
      approveFinancialEntryUseCase: { execute: mockApproveFinancialEntryExecute },
      cancelFinancialEntryUseCase: { execute: vi.fn() },
      createManualAdjustmentUseCase: { execute: mockCreateManualAdjustmentExecute },
      createRefundUseCase: { execute: mockCreateRefundExecute },
      generateInvoiceUseCase: { execute: mockGenerateInvoiceExecute },
      listInvoicesUseCase: { execute: mockListInvoicesExecute },
      getInvoiceUseCase: { execute: mockGetInvoiceExecute },
      downloadInvoiceUseCase: { execute: mockDownloadInvoiceExecute },
      jwtService: { verify: mockJwtVerify },
    },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const ENTRY_ID = 'e1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const INVOICE_ID = 'f2eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

const amContext = { userId: 'am-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(() => { vi.clearAllMocks(); });

const fullFinancialEntry = {
  id: ENTRY_ID,
  tenantId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  appointmentId: 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
  inspectorId: null,
  entryType: 'TENANT_DEBIT',
  amount: 150,
  currency: 'AUD',
  status: 'APPROVED',
  description: 'Service debit',
  effectiveAt: '2026-03-16T00:00:00.000Z',
  reason: null,
  referenceEntryId: null,
  initiatedByUserId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99',
  approvedByUserId: null,
  approvedAt: null,
  createdAt: '2026-03-16T00:00:00.000Z',
  updatedAt: '2026-03-16T00:00:00.000Z',
};

const fullInvoice = {
  id: INVOICE_ID,
  inspectorId: 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a66',
  inspectorName: 'Mike Inspector',
  periodStart: '2026-03-01',
  periodEnd: '2026-03-15',
  periodType: 'BIWEEKLY',
  status: 'CLOSED',
  totalAmount: 500,
  currency: 'AUD',
  fileKey: null,
  generatedByUserId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99',
  generatedAt: '2026-03-16T00:00:00.000Z',
  paidAt: null,
  notes: null,
  createdAt: '2026-03-16T00:00:00.000Z',
  updatedAt: '2026-03-16T00:00:00.000Z',
};

// --- Financial Entries ---

describe('GET /v1/financial/entries', () => {
  it('should return 200 with paginated entries', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockListFinancialEntriesExecute.mockResolvedValueOnce({
      data: [fullFinancialEntry],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get('/v1/financial/entries')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('should return 401 without auth', async () => {
    const res = await supertest(app.server).get('/v1/financial/entries');
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/financial/entries/:entryId', () => {
  it('should return 200 with entry detail', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGetFinancialEntryExecute.mockResolvedValueOnce(fullFinancialEntry);

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
    mockApproveFinancialEntryExecute.mockResolvedValueOnce({
      ...fullFinancialEntry,
      status: 'APPROVED',
      approvedByUserId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99',
      approvedAt: '2026-03-16T10:00:00.000Z',
    });

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
    mockCreateManualAdjustmentExecute.mockResolvedValueOnce({
      ...fullFinancialEntry,
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      appointmentId: null,
      entryType: 'MANUAL_ADJUSTMENT',
      amount: 50,
      status: 'PENDING',
      description: 'Correction',
      reason: 'Overcharge correction',
    });

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

  it('should return 400 with invalid body (missing reason)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post('/v1/financial/entries/adjust')
      .set('Authorization', 'Bearer valid-token')
      .send({
        tenantId: 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
        amount: 50,
        description: 'Correction',
      });

    expect(res.status).toBe(400);
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
    mockCreateRefundExecute.mockResolvedValueOnce({
      ...fullFinancialEntry,
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      entryType: 'REFUND',
      status: 'PENDING',
      description: 'Service not performed',
      reason: 'Inspector did not show up',
      referenceEntryId: ENTRY_ID,
    });

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

  it('should return 400 with invalid body (empty description)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/financial/entries/${ENTRY_ID}/refund`)
      .set('Authorization', 'Bearer valid-token')
      .send({
        description: '',
        reason: 'Inspector did not show up',
      });

    expect(res.status).toBe(400);
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
    mockListInvoicesExecute.mockResolvedValueOnce({
      data: [fullInvoice],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get('/v1/invoices')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    // QA-017: inspectorName must be present in the serialized response
    expect(res.body.data[0].inspectorName).toBe('Mike Inspector');
  });

  it('should return 401 without auth', async () => {
    const res = await supertest(app.server).get('/v1/invoices');
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/invoices/generate', () => {
  it('should return 202 with invoice result', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGenerateInvoiceExecute.mockResolvedValueOnce(fullInvoice);

    const res = await supertest(app.server)
      .post('/v1/invoices/generate')
      .set('Authorization', 'Bearer valid-token')
      .send({
        inspectorId: 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-15',
      });

    expect(res.status).toBe(202);
    expect(res.body.data.id).toBe(INVOICE_ID);
    expect(res.body.data.status).toBe('CLOSED');
  });

  it('should return 400 with invalid body (periodEnd < periodStart)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post('/v1/invoices/generate')
      .set('Authorization', 'Bearer valid-token')
      .send({
        inspectorId: 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
        periodStart: '2026-03-15',
        periodEnd: '2026-03-01',
      });

    expect(res.status).toBe(400);
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
    mockGetInvoiceExecute.mockResolvedValueOnce(fullInvoice);

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

// --- GAP-009: Financial Summary date range ---

describe('GET /v1/financial/entries/summary', () => {
  const summaryResult = {
    totalDebits: 5000,
    totalPayouts: 3000,
    totalAdjustments: 200,
    totalRefunds: 150,
    pendingCount: 7,
    currency: 'AUD',
  };

  it('should return 200 with summary (no date range)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGetFinancialSummaryExecute.mockResolvedValueOnce(summaryResult);

    const res = await supertest(app.server)
      .get('/v1/financial/entries/summary')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.totalDebits).toBe(5000);
    expect(mockGetFinancialSummaryExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        effectiveFrom: undefined,
        effectiveTo: undefined,
      }),
    );
  });

  it('should pass effectiveFrom and effectiveTo to use case', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGetFinancialSummaryExecute.mockResolvedValueOnce(summaryResult);

    const res = await supertest(app.server)
      .get('/v1/financial/entries/summary?effectiveFrom=2026-03-01&effectiveTo=2026-03-31')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(mockGetFinancialSummaryExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        effectiveFrom: '2026-03-01',
        effectiveTo: '2026-03-31',
      }),
    );
  });

  it('should pass only effectiveFrom (month-to-date)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGetFinancialSummaryExecute.mockResolvedValueOnce(summaryResult);

    const res = await supertest(app.server)
      .get('/v1/financial/entries/summary?effectiveFrom=2026-04-01')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(mockGetFinancialSummaryExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        effectiveFrom: '2026-04-01',
        effectiveTo: undefined,
      }),
    );
  });

  it('should return 401 without auth', async () => {
    const res = await supertest(app.server).get('/v1/financial/entries/summary');
    expect(res.status).toBe(401);
  });
});

// --- GAP-010: Deprecation headers on legacy /v1/invoices/* routes ---

describe('Legacy /v1/invoices/* deprecation headers', () => {
  it('GET /v1/invoices should include Deprecation and Sunset headers', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockListInvoicesExecute.mockResolvedValueOnce({
      data: [fullInvoice],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get('/v1/invoices')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.headers['deprecation']).toBeDefined();
    expect(res.headers['sunset']).toBeDefined();
    expect(res.headers['link']).toContain('/v1/billing/invoices');
  });

  it('POST /v1/invoices/generate should include Deprecation and Sunset headers', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGenerateInvoiceExecute.mockResolvedValueOnce(fullInvoice);

    const res = await supertest(app.server)
      .post('/v1/invoices/generate')
      .set('Authorization', 'Bearer valid-token')
      .send({
        inspectorId: 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-15',
      });

    expect(res.status).toBe(202);
    expect(res.headers['deprecation']).toBeDefined();
    expect(res.headers['sunset']).toBeDefined();
    expect(res.headers['link']).toContain('/v1/billing/invoices');
  });

  it('GET /v1/invoices/:invoiceId should include Deprecation and Sunset headers', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGetInvoiceExecute.mockResolvedValueOnce(fullInvoice);

    const res = await supertest(app.server)
      .get(`/v1/invoices/${INVOICE_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.headers['deprecation']).toBeDefined();
    expect(res.headers['sunset']).toBeDefined();
  });

  it('GET /v1/invoices/:invoiceId/download should include Deprecation and Sunset headers', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockDownloadInvoiceExecute.mockResolvedValueOnce({
      downloadUrl: 'https://stub-storage/test',
      expiresAt: '2026-03-16T11:00:00.000Z',
    });

    const res = await supertest(app.server)
      .get(`/v1/invoices/${INVOICE_ID}/download`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.headers['deprecation']).toBeDefined();
    expect(res.headers['sunset']).toBeDefined();
  });
});

describe('Canonical /v1/billing/invoices/* routes (no deprecation headers)', () => {
  it('GET /v1/billing/invoices should NOT include Deprecation headers', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockListInvoicesExecute.mockResolvedValueOnce({
      data: [fullInvoice],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get('/v1/billing/invoices')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.headers['deprecation']).toBeUndefined();
    expect(res.headers['sunset']).toBeUndefined();
  });

  it('GET /v1/billing/invoices/:invoiceId should NOT include Deprecation headers', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGetInvoiceExecute.mockResolvedValueOnce(fullInvoice);

    const res = await supertest(app.server)
      .get(`/v1/billing/invoices/${INVOICE_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.headers['deprecation']).toBeUndefined();
    expect(res.headers['sunset']).toBeUndefined();
  });

  it('GET /v1/billing/invoices/:invoiceId/download should NOT include Deprecation headers', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockDownloadInvoiceExecute.mockResolvedValueOnce({
      downloadUrl: 'https://stub-storage/test',
      expiresAt: '2026-03-16T11:00:00.000Z',
    });

    const res = await supertest(app.server)
      .get(`/v1/billing/invoices/${INVOICE_ID}/download`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.headers['deprecation']).toBeUndefined();
    expect(res.headers['sunset']).toBeUndefined();
  });
});
