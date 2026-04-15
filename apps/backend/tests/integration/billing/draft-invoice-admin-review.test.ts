import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { InvoiceNotPendingReviewError } from '../../../src/modules/billing/domain/billing.errors';

const mockApproveDraftExecute = vi.fn();
const mockRejectDraftExecute = vi.fn();
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
    tenantPortal: { jwtService: { verify: mockJwtVerify } },
    inspectorExecution: { jwtService: { verify: mockJwtVerify } },
    billing: {
      approveDraftInvoiceUseCase: { execute: mockApproveDraftExecute },
      rejectDraftInvoiceUseCase: { execute: mockRejectDraftExecute },
      jwtService: { verify: mockJwtVerify },
    },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
    dashboard: { jwtService: { verify: mockJwtVerify } },
    appointmentTimeSlot: { jwtService: { verify: mockJwtVerify } },
    serviceRegion: { jwtService: { verify: mockJwtVerify } },
    contact: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const INVOICE_ID = 'f2eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const amContext = { userId: 'am-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const clContext = { userId: 'cl-1', tenantId: 'tenant-1', role: 'CL_ADMIN', branchId: null, inspectorId: null };

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(() => { vi.clearAllMocks(); });

describe('POST /v1/billing/invoices/:invoiceId/approve-draft', () => {
  it('should return 200 when approve succeeds', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockApproveDraftExecute.mockResolvedValueOnce({
      id: INVOICE_ID,
      status: 'CLOSED',
      generatedByUserId: 'am-1',
      generatedAt: '2026-04-12T10:00:00.000Z',
    });

    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/approve-draft`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CLOSED');
    expect(mockApproveDraftExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: INVOICE_ID,
        actor: amContext,
      }),
    );
  });

  it('should return 409 when invoice is not PENDING_REVIEW', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockApproveDraftExecute.mockRejectedValueOnce(new InvoiceNotPendingReviewError());

    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/approve-draft`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVOICE_NOT_PENDING_REVIEW');
  });

  it('should return 403 when CL_ADMIN tries to approve', async () => {
    mockJwtVerify.mockResolvedValueOnce(clContext);
    mockApproveDraftExecute.mockRejectedValueOnce(
      new ForbiddenError('FORBIDDEN', 'Role CL_ADMIN is not permitted'),
    );

    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/approve-draft`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(403);
  });
});

describe('POST /v1/billing/invoices/:invoiceId/reject-draft', () => {
  it('should return 200 when reject succeeds', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockRejectDraftExecute.mockResolvedValueOnce({
      invoiceId: INVOICE_ID,
      status: 'DELETED',
    });

    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/reject-draft`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'Period is incorrect, please resubmit the draft' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DELETED');
    expect(mockRejectDraftExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: INVOICE_ID,
        reason: 'Period is incorrect, please resubmit the draft',
        actor: amContext,
      }),
    );
  });

  it('should return 409 when invoice is not PENDING_REVIEW', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockRejectDraftExecute.mockRejectedValueOnce(new InvoiceNotPendingReviewError());

    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/reject-draft`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'Period is incorrect, please resubmit the draft' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVOICE_NOT_PENDING_REVIEW');
  });

  it('should return 400 when reason is missing', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/reject-draft`)
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when reason is too short', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/reject-draft`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 403 when CL_ADMIN tries to reject', async () => {
    mockJwtVerify.mockResolvedValueOnce(clContext);
    mockRejectDraftExecute.mockRejectedValueOnce(
      new ForbiddenError('FORBIDDEN', 'Role CL_ADMIN is not permitted'),
    );

    const res = await supertest(app.server)
      .post(`/v1/billing/invoices/${INVOICE_ID}/reject-draft`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'Period is incorrect, please resubmit the draft' });

    expect(res.status).toBe(403);
  });
});
