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
  periodType: 'FORTNIGHTLY',
  status: 'PAID',
  totalAmount: 500,
  currency: 'AUD',
  fileKey: null,
  generatedByUserId: 'am-user-00-0000-0000-000000000001',
  issuedAt: '2026-03-16T00:00:00.000Z',
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
      .set('Idempotency-Key', 'mark-paid-key-1')
      .send({ paidAt: '2026-03-18T10:00:00.000Z', paymentReference: 'PAY-REF-001' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PAID');
    expect(res.body.data.paidAt).toBe('2026-03-18T10:00:00.000Z');
    expect(mockMarkInvoicePaidExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: INVOICE_ID,
        paidAt: '2026-03-18T10:00:00.000Z',
        paymentReference: 'PAY-REF-001',
        idempotencyKey: 'mark-paid-key-1',
      }),
    );
  });

  it('OP can mark invoice as paid', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockMarkInvoicePaidExecute.mockResolvedValueOnce(paidInvoice);

    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/mark-paid`)
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', 'mark-paid-key-2')
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
      .set('Idempotency-Key', 'mark-paid-key-3')
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
      .set('Idempotency-Key', 'mark-paid-key-4')
      .send({ paidAt: '2026-03-18T10:00:00.000Z' });

    expect(res.status).toBe(409);
  });

  it('invalid paidAt datetime string returns 400', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/mark-paid`)
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', 'mark-paid-key-5')
      .send({ paidAt: 'not-a-datetime' });

    expect(res.status).toBe(400);
  });

  it('unauthenticated returns 401', async () => {
    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/mark-paid`)
      .send({ paidAt: '2026-03-18T10:00:00.000Z' });

    expect(res.status).toBe(401);
  });

  it('missing Idempotency-Key header returns 400 VALIDATION_ERROR', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/mark-paid`)
      .set('Authorization', 'Bearer valid-token')
      .send({ paidAt: '2026-03-18T10:00:00.000Z' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockMarkInvoicePaidExecute).not.toHaveBeenCalled();
  });

  it('same Idempotency-Key + identical payload replayed twice returns identical body, use case invoked once per call (route passthrough)', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockMarkInvoicePaidExecute.mockResolvedValue(paidInvoice);

    const key = 'mark-paid-replay-key';
    const payload = { paidAt: '2026-03-18T10:00:00.000Z', paymentReference: 'PAY-REF-001' };

    const first = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/mark-paid`)
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', key)
      .send(payload);
    const second = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/mark-paid`)
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', key)
      .send(payload);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    // The route always forwards the key; actual dedup is exercised at the
    // use-case unit level (mocked here) and in the DB-backed idempotency
    // integration suite.
    expect(mockMarkInvoicePaidExecute).toHaveBeenCalledTimes(2);
    expect(mockMarkInvoicePaidExecute).toHaveBeenNthCalledWith(1, expect.objectContaining({ idempotencyKey: key }));
    expect(mockMarkInvoicePaidExecute).toHaveBeenNthCalledWith(2, expect.objectContaining({ idempotencyKey: key }));
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
      .set('Idempotency-Key', 'batch-key-1')
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
        idempotencyKey: 'batch-key-1',
      }),
    );
  });

  it('empty invoiceIds returns 400', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post('/v1/billing/invoices/batch-mark-paid')
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', 'batch-key-2')
      .send({ invoiceIds: [], paidAt: '2026-03-18T10:00:00.000Z' });

    expect(res.status).toBe(400);
  });

  it('unauthenticated returns 401', async () => {
    const res = await supertest(app.server)
      .post('/v1/billing/invoices/batch-mark-paid')
      .send({ invoiceIds: [INVOICE_ID], paidAt: '2026-03-18T10:00:00.000Z' });

    expect(res.status).toBe(401);
  });

  it('missing Idempotency-Key header returns 400 VALIDATION_ERROR — ONE key covers the whole batch', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post('/v1/billing/invoices/batch-mark-paid')
      .set('Authorization', 'Bearer valid-token')
      .send({ invoiceIds: [INVOICE_ID, INVOICE_ID_2], paidAt: '2026-03-18T10:00:00.000Z' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockBatchMarkInvoicesPaidExecute).not.toHaveBeenCalled();
  });

  it('same Idempotency-Key replayed forwards the same key on both calls (batch-as-unit)', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockBatchMarkInvoicesPaidExecute.mockResolvedValue({
      processed: [{ id: INVOICE_ID, status: 'PAID' }, { id: INVOICE_ID_2, status: 'PAID' }],
      skipped: [],
    });

    const key = 'batch-replay-key';
    const payload = { invoiceIds: [INVOICE_ID, INVOICE_ID_2], paidAt: '2026-03-18T10:00:00.000Z' };

    const first = await supertest(app.server)
      .post('/v1/billing/invoices/batch-mark-paid')
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', key)
      .send(payload);
    const second = await supertest(app.server)
      .post('/v1/billing/invoices/batch-mark-paid')
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', key)
      .send(payload);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(mockBatchMarkInvoicesPaidExecute).toHaveBeenNthCalledWith(1, expect.objectContaining({ idempotencyKey: key }));
    expect(mockBatchMarkInvoicesPaidExecute).toHaveBeenNthCalledWith(2, expect.objectContaining({ idempotencyKey: key }));
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
      .set('Idempotency-Key', 'reverse-key-1')
      .send({ reason: 'Payment was made in error' });

    expect(res.status).toBe(200);
    expect(mockReverseInvoicePaymentExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: INVOICE_ID,
        reason: 'Payment was made in error',
        idempotencyKey: 'reverse-key-1',
      }),
    );
  });

  it('OP can reverse payment', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockReverseInvoicePaymentExecute.mockResolvedValueOnce({ ...paidInvoice, status: 'CLOSED' });

    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/reverse-payment`)
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', 'reverse-key-2')
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
      .set('Idempotency-Key', 'reverse-key-3')
      .send({ reason: 'Reversal reason' });

    expect(res.status).toBe(409);
  });

  it('missing reason returns 400', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/reverse-payment`)
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', 'reverse-key-4')
      .send({});

    expect(res.status).toBe(400);
  });

  it('unauthenticated returns 401', async () => {
    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/reverse-payment`)
      .send({ reason: 'Reversal reason' });

    expect(res.status).toBe(401);
  });

  it('missing Idempotency-Key header returns 400 VALIDATION_ERROR', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/reverse-payment`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'Reversal reason' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockReverseInvoicePaymentExecute).not.toHaveBeenCalled();
  });

  it('same Idempotency-Key + different payload still forwards distinct calls at the route layer (mismatch detection lives in the use case)', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockReverseInvoicePaymentExecute
      .mockResolvedValueOnce({ ...paidInvoice, status: 'CLOSED', paidAt: null })
      .mockRejectedValueOnce(
        new (await import('../../../src/modules/billing/domain/billing.errors')).BillingIdempotencyPayloadMismatchError(),
      );

    const key = 'reverse-mismatch-key';
    const first = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/reverse-payment`)
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', key)
      .send({ reason: 'First reason' });
    const second = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/reverse-payment`)
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', key)
      .send({ reason: 'Different reason' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
  });
});
