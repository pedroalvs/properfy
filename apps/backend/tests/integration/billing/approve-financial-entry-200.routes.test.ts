/**
 * QA-010-HIGH-001: POST /v1/financial/entries/:id/approve returns 500 after successful write.
 *
 * Root cause: ApproveFinancialEntryUseCase.execute() returned only {id, status, approvedBy, approvedAt},
 * which does not satisfy financialEntryResponseSchema (missing tenantId, amount, currency, etc.).
 * Fastify's response serializer strips/rejects the incomplete object → 500.
 *
 * Fix: after transitionStatus, call findByIdEnriched and return the full enriched entity.
 *
 * This test verifies:
 * 1. POST approve → 200 with full entity fields (status APPROVED, approvedByUserId non-null)
 * 2. Retry (already APPROVED) → 409 ENTRY_NOT_PENDING
 *
 * (031 PR-2: the duplicate PATCH verb was removed; POST is canonical.)
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { EntryNotPendingError } from '../../../src/modules/billing/domain/billing.errors';

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
      rentalTenantPortal: { jwtService: { verify: mockJwtVerify } },
      inspectorExecution: { jwtService: { verify: mockJwtVerify } },
      billing: {
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

const ENTRY_ID = 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01';
const TENANT_ID = 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01';
const AM_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10';

const amContext = {
  userId: AM_USER_ID,
  tenantId: null,
  role: 'AM',
  branchId: null,
  inspectorId: null,
};

/** Full enriched entity — matches financialEntryResponseSchema requirements */
const approvedEnrichedEntry = {
  id: ENTRY_ID,
  tenantId: TENANT_ID,
  appointmentId: 'd1eebc99-9c0b-4ef8-bb6d-6bb9bd380a02',
  inspectorId: null,
  entryType: 'TENANT_DEBIT',
  amount: 150,
  currency: 'AUD',
  status: 'APPROVED',
  description: 'Service debit for inspection',
  effectiveAt: '2026-04-01T00:00:00.000Z',
  reason: null,
  referenceEntryId: null,
  initiatedByUserId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a20',
  approvedByUserId: AM_USER_ID,
  approvedAt: '2026-04-23T10:00:00.000Z',
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-23T10:00:00.000Z',
  appointmentCode: 'INS-2026-0001',
  relatedEntityName: 'Test Agency',
  approvedByName: 'Admin Master',
};

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

describe('POST /v1/financial/entries/:entryId/approve — QA-010-HIGH-001', () => {
  it('should return 200 with full enriched entry fields after approval', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockApproveFinancialEntryExecute.mockResolvedValueOnce(approvedEnrichedEntry);

    const res = await supertest(app.server)
      .post(`/v1/financial/entries/${ENTRY_ID}/approve`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(ENTRY_ID);
    expect(res.body.data.status).toBe('APPROVED');
    expect(res.body.data.approvedByUserId).toBe(AM_USER_ID);
    expect(res.body.data.approvedAt).toBe('2026-04-23T10:00:00.000Z');
    // Full entity fields — these would be missing if use-case returned partial object
    expect(res.body.data.tenantId).toBe(TENANT_ID);
    expect(res.body.data.amount).toBe(150);
    expect(res.body.data.currency).toBe('AUD');
    expect(res.body.data.entryType).toBe('TENANT_DEBIT');
    expect(res.body.data.initiatedByUserId).toBe('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a20');
    // Enriched fields
    expect(res.body.data.appointmentCode).toBe('INS-2026-0001');
    expect(res.body.data.relatedEntityName).toBe('Test Agency');
    expect(res.body.data.approvedByName).toBe('Admin Master');
  });

  it('should return 409 ENTRY_NOT_PENDING when entry is already approved (retry)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockApproveFinancialEntryExecute.mockRejectedValueOnce(new EntryNotPendingError());

    const res = await supertest(app.server)
      .post(`/v1/financial/entries/${ENTRY_ID}/approve`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ENTRY_NOT_PENDING');
  });

  it('should return 401 without auth', async () => {
    const res = await supertest(app.server)
      .post(`/v1/financial/entries/${ENTRY_ID}/approve`);

    expect(res.status).toBe(401);
  });
});
