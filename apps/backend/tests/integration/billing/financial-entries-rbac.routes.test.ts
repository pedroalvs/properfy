/**
 * QA-015-HIGH-001: CL_USER must NOT read financial entries (GET returns 403, not 200)
 * QA-015-HIGH-002: CL_USER must NOT approve financial entries (POST returns 403, not 500)
 *
 * Pattern A: buildApp + vi.mock(container) + Supertest.
 * RBAC guard at route level is tested; use-case RBAC verified by unit tests in
 * tests/unit/billing/list-financial-entries.use-case.test.ts.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockListFinancialEntriesExecute = vi.fn();
const mockApproveFinancialEntryExecute = vi.fn();
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
      tenantPortal: { jwtService: { verify: mockJwtVerify } },
      inspectorExecution: { jwtService: { verify: mockJwtVerify } },
      billing: {
        listFinancialEntriesUseCase: { execute: mockListFinancialEntriesExecute },
        approveFinancialEntryUseCase: { execute: mockApproveFinancialEntryExecute },
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

const TENANT_ID = 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01';
const ENTRY_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a02';

const AM_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10';
const OP_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const CL_ADMIN_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12';
const CL_USER_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13';

const amContext = { userId: AM_USER_ID, tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const opContext = { userId: OP_USER_ID, tenantId: null, role: 'OP', branchId: null, inspectorId: null };
const clAdminContext = { userId: CL_ADMIN_USER_ID, tenantId: TENANT_ID, role: 'CL_ADMIN', branchId: null, inspectorId: null };
const clUserContext = { userId: CL_USER_USER_ID, tenantId: TENANT_ID, role: 'CL_USER', branchId: null, inspectorId: null };

const paginatedEntries = {
  data: [],
  total: 0,
  page: 1,
  pageSize: 10,
};

const approvedEntry = {
  id: ENTRY_ID,
  tenantId: TENANT_ID,
  appointmentId: null,
  inspectorId: null,
  entryType: 'MANUAL_ADJUSTMENT',
  amount: 100,
  currency: 'AUD',
  status: 'APPROVED',
  description: 'Test',
  effectiveAt: '2026-04-01T00:00:00.000Z',
  reason: null,
  referenceEntryId: null,
  initiatedByUserId: AM_USER_ID,
  approvedByUserId: AM_USER_ID,
  approvedAt: '2026-04-01T10:00:00.000Z',
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T10:00:00.000Z',
  appointmentCode: null,
  relatedEntityName: null,
  approvedByName: null,
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
// QA-015-HIGH-001 — GET /v1/financial/entries RBAC
// ---------------------------------------------------------------------------

describe('QA-015-HIGH-001 — GET /v1/financial/entries role enforcement', () => {
  it('CL_USER receives 403 FORBIDDEN — cannot read financial entries', async () => {
    mockJwtVerify.mockResolvedValueOnce(clUserContext);

    const res = await supertest(app.server)
      .get(`/v1/financial/entries?tenantId=${TENANT_ID}`)
      .set('Authorization', 'Bearer cl-user-token')
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
    // Use case must NOT be called — gate must stop at route layer
    expect(mockListFinancialEntriesExecute).not.toHaveBeenCalled();
  });

  it('AM receives 200 and use case is called', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockListFinancialEntriesExecute.mockResolvedValueOnce(paginatedEntries);

    const res = await supertest(app.server)
      .get('/v1/financial/entries')
      .set('Authorization', 'Bearer am-token')
      .expect(200);

    expect(res.body.data).toBeInstanceOf(Array);
    expect(mockListFinancialEntriesExecute).toHaveBeenCalledOnce();
  });

  it('OP receives 200 and use case is called', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockListFinancialEntriesExecute.mockResolvedValueOnce(paginatedEntries);

    await supertest(app.server)
      .get('/v1/financial/entries')
      .set('Authorization', 'Bearer op-token')
      .expect(200);

    expect(mockListFinancialEntriesExecute).toHaveBeenCalledOnce();
  });

  it('CL_ADMIN receives 200 and use case is called (scoped read allowed)', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    mockListFinancialEntriesExecute.mockResolvedValueOnce(paginatedEntries);

    await supertest(app.server)
      .get(`/v1/financial/entries?tenantId=${TENANT_ID}`)
      .set('Authorization', 'Bearer cl-admin-token')
      .expect(200);

    expect(mockListFinancialEntriesExecute).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// QA-015-HIGH-002 — POST /v1/financial/entries/:entryId/approve RBAC
// ---------------------------------------------------------------------------

describe('QA-015-HIGH-002 — POST /v1/financial/entries/:entryId/approve role enforcement', () => {
  it('CL_USER receives 403 FORBIDDEN — cannot approve entries', async () => {
    mockJwtVerify.mockResolvedValueOnce(clUserContext);

    const res = await supertest(app.server)
      .post(`/v1/financial/entries/${ENTRY_ID}/approve`)
      .set('Authorization', 'Bearer cl-user-token')
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockApproveFinancialEntryExecute).not.toHaveBeenCalled();
  });

  it('CL_ADMIN receives 403 FORBIDDEN — cannot approve entries', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);

    const res = await supertest(app.server)
      .post(`/v1/financial/entries/${ENTRY_ID}/approve`)
      .set('Authorization', 'Bearer cl-admin-token')
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockApproveFinancialEntryExecute).not.toHaveBeenCalled();
  });

  it('AM receives 200 when approval succeeds', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockApproveFinancialEntryExecute.mockResolvedValueOnce(approvedEntry);

    const res = await supertest(app.server)
      .post(`/v1/financial/entries/${ENTRY_ID}/approve`)
      .set('Authorization', 'Bearer am-token')
      .expect(200);

    expect(res.body.data.status).toBe('APPROVED');
    expect(mockApproveFinancialEntryExecute).toHaveBeenCalledOnce();
  });

  it('OP receives 200 when approval succeeds', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockApproveFinancialEntryExecute.mockResolvedValueOnce(approvedEntry);

    await supertest(app.server)
      .post(`/v1/financial/entries/${ENTRY_ID}/approve`)
      .set('Authorization', 'Bearer op-token')
      .expect(200);

    expect(mockApproveFinancialEntryExecute).toHaveBeenCalledOnce();
  });
});
