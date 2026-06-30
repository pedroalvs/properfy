import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockMarkInvoicePaidExecute = vi.fn();
const mockBatchMarkInvoicesPaidExecute = vi.fn();
const mockReverseInvoicePaymentExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
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
      markInvoicePaidUseCase: { execute: mockMarkInvoicePaidExecute },
      batchMarkInvoicesPaidUseCase: { execute: mockBatchMarkInvoicesPaidExecute },
      reverseInvoicePaymentUseCase: { execute: mockReverseInvoicePaymentExecute },
      jwtService: { verify: mockJwtVerify },
    },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const INVOICE_ID = 'f2eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const INVOICE_ID_2 = 'f3eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

const amContext = { userId: 'am-user-00-0000-0000-000000000001', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const opContext = { userId: 'op-user-00-0000-0000-000000000002', tenantId: null, role: 'OP', branchId: null, inspectorId: null };
const clAdminContext = { userId: 'cl-admin-0-0000-0000-000000000003', tenantId: 'tenant-00-0000-0000-000000000001', role: 'CL_ADMIN', branchId: null, inspectorId: null };

const paidInvoice = {
  id: INVOICE_ID,
  inspectorId: 'insp-0000-0000-0000-000000000001',
  periodStart: '2026-03-01',
  periodEnd: '2026-03-15',
  periodType: 'BIWEEKLY',
  status: 'PAID',
  totalAmount: 500,
  currency: 'AUD',
  fileKey: null,
  generatedByUserId: 'am-user-00-0000-0000-000000000001',
  generatedAt: '2026-03-16T00:00:00.000Z',
  paidAt: '2026-03-18T10:00:00.000Z',
  paymentReference: 'PAY-REF-001',
  notes: null,
  createdAt: '2026-03-16T00:00:00.000Z',
  updatedAt: '2026-03-18T10:00:00.000Z',
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

// --- POST /v1/billing/invoices/:invoiceId/mark-paid ---

describe('POST /v1/billing/invoices/:invoiceId/mark-paid', () => {
  it('AM can mark invoice as paid — returns 200 with updated invoice', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockMarkInvoicePaidExecute.mockResolvedValueOnce(paidInvoice);

    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/mark-paid`)
      .set('Authorization', 'Bearer valid-token')
      .send({ paidAt: '2026-03-18T10:00:00.000Z', paymentReference: 'PAY-REF-001' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PAID');
    expect(res.body.data.paidAt).toBe('2026-03-18T10:00:00.000Z');
    expect(mockMarkInvoicePaidExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: INVOICE_ID,
        paidAt: '2026-03-18T10:00:00.000Z',
        paymentReference: 'PAY-REF-001',
      }),
    );
  });

  it('OP can mark invoice as paid', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockMarkInvoicePaidExecute.mockResolvedValueOnce(paidInvoice);

    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/mark-paid`)
      .set('Authorization', 'Bearer valid-token')
      .send({ paidAt: '2026-03-18T10:00:00.000Z' });

    expect(res.status).toBe(200);
  });

  it('CL_ADMIN is rejected with 403', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    const { ForbiddenError } = await import('../../../src/shared/domain/errors');
    mockMarkInvoicePaidExecute.mockRejectedValueOnce(new ForbiddenError('Forbidden'));

    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/mark-paid`)
      .set('Authorization', 'Bearer valid-token')
      .send({ paidAt: '2026-03-18T10:00:00.000Z' });

    expect(res.status).toBe(403);
  });

  it('already-paid invoice returns 409', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const { InvoiceAlreadyPaidError } = await import('../../../src/modules/billing/domain/billing.errors');
    mockMarkInvoicePaidExecute.mockRejectedValueOnce(new InvoiceAlreadyPaidError());

    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/mark-paid`)
      .set('Authorization', 'Bearer valid-token')
      .send({ paidAt: '2026-03-18T10:00:00.000Z' });

    expect(res.status).toBe(409);
  });

  it('invalid paidAt datetime string returns 400', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/mark-paid`)
      .set('Authorization', 'Bearer valid-token')
      .send({ paidAt: 'not-a-datetime' });

    expect(res.status).toBe(400);
  });

  it('unauthenticated returns 401', async () => {
    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/mark-paid`)
      .send({ paidAt: '2026-03-18T10:00:00.000Z' });

    expect(res.status).toBe(401);
  });
});

// --- POST /v1/billing/invoices/batch-mark-paid ---

describe('POST /v1/billing/invoices/batch-mark-paid', () => {
  it('AM can batch-mark invoices as paid — returns 200', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockBatchMarkInvoicesPaidExecute.mockResolvedValueOnce({ processed: 2, failed: 0 });

    const res = await supertest(app.server)
      .post('/v1/billing/invoices/batch-mark-paid')
      .set('Authorization', 'Bearer valid-token')
      .send({
        invoiceIds: [INVOICE_ID, INVOICE_ID_2],
        paidAt: '2026-03-18T10:00:00.000Z',
        paymentReference: 'BATCH-001',
      });

    expect(res.status).toBe(200);
    expect(mockBatchMarkInvoicesPaidExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceIds: [INVOICE_ID, INVOICE_ID_2],
        paidAt: '2026-03-18T10:00:00.000Z',
      }),
    );
  });

  it('empty invoiceIds returns 400', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post('/v1/billing/invoices/batch-mark-paid')
      .set('Authorization', 'Bearer valid-token')
      .send({ invoiceIds: [], paidAt: '2026-03-18T10:00:00.000Z' });

    expect(res.status).toBe(400);
  });

  it('unauthenticated returns 401', async () => {
    const res = await supertest(app.server)
      .post('/v1/billing/invoices/batch-mark-paid')
      .send({ invoiceIds: [INVOICE_ID], paidAt: '2026-03-18T10:00:00.000Z' });

    expect(res.status).toBe(401);
  });
});

// --- POST /v1/billing/invoices/:invoiceId/reverse-payment ---

describe('POST /v1/billing/invoices/:invoiceId/reverse-payment', () => {
  it('AM can reverse payment — returns 200 with updated invoice', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockReverseInvoicePaymentExecute.mockResolvedValueOnce({ ...paidInvoice, status: 'CLOSED', paidAt: null });

    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/reverse-payment`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'Payment was made in error' });

    expect(res.status).toBe(200);
    expect(mockReverseInvoicePaymentExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: INVOICE_ID,
        reason: 'Payment was made in error',
      }),
    );
  });

  it('OP can reverse payment', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockReverseInvoicePaymentExecute.mockResolvedValueOnce({ ...paidInvoice, status: 'CLOSED' });

    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/reverse-payment`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'Reversal reason' });

    expect(res.status).toBe(200);
  });

  it('invoice not paid returns 409', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const errors = await import('../../../src/modules/billing/domain/billing.errors');
    mockReverseInvoicePaymentExecute.mockRejectedValueOnce(new errors.InvoiceNotPaidError());

    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/reverse-payment`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'Reversal reason' });

    expect(res.status).toBe(409);
  });

  it('missing reason returns 400', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/reverse-payment`)
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(400);
  });

  it('unauthenticated returns 401', async () => {
    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/reverse-payment`)
      .send({ reason: 'Reversal reason' });

    expect(res.status).toBe(401);
  });
});
