/**
 * QA-017-HIGH-001: POST /v1/invoices/:invoiceId/close and /pay routes.
 * These are alias routes added because the frontend expects them;
 * they delegate to approveDraftInvoiceUseCase and markInvoicePaidUseCase respectively.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockApproveDraftInvoiceExecute = vi.fn();
const mockMarkInvoicePaidExecute = vi.fn();
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
      billing: {
        approveDraftInvoiceUseCase: { execute: mockApproveDraftInvoiceExecute },
        markInvoicePaidUseCase: { execute: mockMarkInvoicePaidExecute },
        jwtService: { verify: mockJwtVerify },
      },
      report: { jwtService: { verify: mockJwtVerify } },
      notification: { jwtService: { verify: mockJwtVerify } },
      serviceRegion: { jwtService: { verify: mockJwtVerify } },
      contact: { jwtService: { verify: mockJwtVerify } },
      appointmentTimeSlot: { jwtService: { verify: mockJwtVerify } },
      dashboard: { jwtService: { verify: mockJwtVerify } },
    } as any),
}));

const INVOICE_ID = 'f2eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const AM_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10';

const amContext = { userId: AM_USER_ID, tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const opContext = { userId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', tenantId: null, role: 'OP', branchId: null, inspectorId: null };
const clUserContext = { userId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', tenantId: 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', role: 'CL_USER', branchId: null, inspectorId: null };

const closedInvoiceResult = {
  id: INVOICE_ID,
  status: 'CLOSED',
  generatedByUserId: AM_USER_ID,
  generatedAt: '2026-04-01T00:00:00.000Z',
};

const paidInvoiceResult = {
  id: INVOICE_ID,
  inspectorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a20',
  periodStart: '2026-04-01',
  periodEnd: '2026-04-15',
  periodType: 'BIWEEKLY',
  status: 'PAID',
  totalAmount: 500,
  currency: 'AUD',
  fileKey: null,
  generatedByUserId: AM_USER_ID,
  generatedAt: '2026-04-16T00:00:00.000Z',
  paidAt: '2026-04-18T10:00:00.000Z',
  paymentReference: 'PAY-REF-001',
  notes: null,
  createdAt: '2026-04-16T00:00:00.000Z',
  updatedAt: '2026-04-18T10:00:00.000Z',
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

// ---------------------------------------------------------------------------
// POST /v1/invoices/:invoiceId/close
// ---------------------------------------------------------------------------

describe('QA-017-HIGH-001 — POST /v1/invoices/:invoiceId/close', () => {
  it('AM receives 200 and approveDraftInvoiceUseCase is called', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockApproveDraftInvoiceExecute.mockResolvedValueOnce(closedInvoiceResult);

    const res = await supertest(app.server)
      .post(`/v1/invoices/${INVOICE_ID}/close`)
      .set('Authorization', 'Bearer am-token')
      .expect(200);

    expect(res.body.data.status).toBe('CLOSED');
    expect(mockApproveDraftInvoiceExecute).toHaveBeenCalledOnce();
  });

  it('OP receives 200 and approveDraftInvoiceUseCase is called', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockApproveDraftInvoiceExecute.mockResolvedValueOnce(closedInvoiceResult);

    await supertest(app.server)
      .post(`/v1/invoices/${INVOICE_ID}/close`)
      .set('Authorization', 'Bearer op-token')
      .expect(200);

    expect(mockApproveDraftInvoiceExecute).toHaveBeenCalledOnce();
  });

  it('CL_USER receives 403 FORBIDDEN', async () => {
    mockJwtVerify.mockResolvedValueOnce(clUserContext);

    const res = await supertest(app.server)
      .post(`/v1/invoices/${INVOICE_ID}/close`)
      .set('Authorization', 'Bearer cl-user-token')
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockApproveDraftInvoiceExecute).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/invoices/:invoiceId/pay
// ---------------------------------------------------------------------------

describe('QA-017-HIGH-001 — POST /v1/invoices/:invoiceId/pay', () => {
  it('AM receives 200 and markInvoicePaidUseCase is called', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockMarkInvoicePaidExecute.mockResolvedValueOnce(paidInvoiceResult);

    const res = await supertest(app.server)
      .post(`/v1/invoices/${INVOICE_ID}/pay`)
      .set('Authorization', 'Bearer am-token')
      .send({ paidAt: '2026-04-18T10:00:00.000Z', paymentReference: 'PAY-REF-001' })
      .expect(200);

    expect(res.body.data.status).toBe('PAID');
    expect(mockMarkInvoicePaidExecute).toHaveBeenCalledOnce();
  });

  it('OP receives 200 and markInvoicePaidUseCase is called', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockMarkInvoicePaidExecute.mockResolvedValueOnce(paidInvoiceResult);

    await supertest(app.server)
      .post(`/v1/invoices/${INVOICE_ID}/pay`)
      .set('Authorization', 'Bearer op-token')
      .send({ paidAt: '2026-04-18T10:00:00.000Z', paymentReference: 'PAY-REF-001' })
      .expect(200);

    expect(mockMarkInvoicePaidExecute).toHaveBeenCalledOnce();
  });

  it('CL_USER receives 403 FORBIDDEN', async () => {
    mockJwtVerify.mockResolvedValueOnce(clUserContext);

    const res = await supertest(app.server)
      .post(`/v1/invoices/${INVOICE_ID}/pay`)
      .set('Authorization', 'Bearer cl-user-token')
      .send({ paidAt: '2026-04-18T10:00:00.000Z', paymentReference: 'PAY-REF-001' })
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockMarkInvoicePaidExecute).not.toHaveBeenCalled();
  });
});
