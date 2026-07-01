import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

// QA-017-MEDIUM-001: GET /v1/invoices/:id must return inspectorName as a non-null string.
// The findById() query was missing the inspector JOIN that findAll() already had.

const mockGetInvoiceExecute = vi.fn();
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
    appointment: { jwtService: { verify: mockJwtVerify } },
    audit: { jwtService: { verify: mockJwtVerify } },
    serviceGroup: { jwtService: { verify: mockJwtVerify } },
    marketplace: { jwtService: { verify: mockJwtVerify } },
    rentalTenantPortal: { jwtService: { verify: mockJwtVerify } },
    inspectorExecution: { jwtService: { verify: mockJwtVerify } },
    billing: {
      createFinancialEntriesOnDoneUseCase: { execute: vi.fn() },
      getFinancialSummaryUseCase: { execute: vi.fn() },
      listFinancialEntriesUseCase: { execute: vi.fn() },
      getFinancialEntryUseCase: { execute: vi.fn() },
      approveFinancialEntryUseCase: { execute: vi.fn() },
      cancelFinancialEntryUseCase: { execute: vi.fn() },
      createManualAdjustmentUseCase: { execute: vi.fn() },
      createRefundUseCase: { execute: vi.fn() },
      generateInvoiceUseCase: { execute: vi.fn() },
      listInvoicesUseCase: { execute: vi.fn() },
      getInvoiceUseCase: { execute: mockGetInvoiceExecute },
      downloadInvoiceUseCase: { execute: vi.fn() },
      markInvoicePaidUseCase: { execute: vi.fn() },
      batchMarkInvoicesPaidUseCase: { execute: vi.fn() },
      reverseInvoicePaymentUseCase: { execute: vi.fn() },
      getReconciliationSummaryUseCase: { execute: vi.fn() },
      voidFinancialEntryUseCase: { execute: vi.fn() },
      regenerateInspectorInvoiceUseCase: { execute: vi.fn() },
      approveDraftInvoiceUseCase: { execute: vi.fn() },
      rejectDraftInvoiceUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify },
    },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const INVOICE_ID = 'f2eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

const amContext = { userId: 'am-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

const invoiceWithInspectorName = {
  id: INVOICE_ID,
  inspectorId: 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a66',
  inspectorName: 'John Inspector',
  periodStart: '2026-03-01',
  periodEnd: '2026-03-07',
  periodType: 'WEEKLY',
  status: 'OPEN',
  totalAmount: 80,
  currency: 'AUD',
  fileKey: null,
  generatedByUserId: null,
  generatedAt: null,
  paidAt: null,
  paidByUserId: null,
  paymentReference: null,
  notes: null,
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
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

describe('GET /v1/billing/invoices/:invoiceId — QA-017-MEDIUM-001', () => {
  it('returns 200 with inspectorName as a non-null string', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGetInvoiceExecute.mockResolvedValueOnce(invoiceWithInspectorName);

    const res = await supertest(app.server)
      .get(`/v1/billing/invoices/${INVOICE_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(INVOICE_ID);
    expect(res.body.data.inspectorName).toBe('John Inspector');
    expect(res.body.data.inspectorName).not.toBeNull();
  });

  it('returns 404 for a non-existent invoice', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const { InvoiceNotFoundError } = await import('../../../src/modules/billing/domain/billing.errors');
    mockGetInvoiceExecute.mockRejectedValueOnce(new InvoiceNotFoundError());

    const res = await supertest(app.server)
      .get(`/v1/billing/invoices/${NONEXISTENT_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('INVOICE_NOT_FOUND');
  });
});
