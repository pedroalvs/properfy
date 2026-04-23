/**
 * QA-002-HIGH-001 (Pattern A regression): POST /v1/financial/entries/adjust
 * must return 201 with approvedByUserId, approvedAt, and updatedAt in the response.
 *
 * Root cause: create-manual-adjustment.use-case.ts omitted approvedByUserId,
 * approvedAt, and updatedAt from its output, causing fastify-type-provider-zod
 * to throw ResponseValidationError after the DB commit → 500.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockCreateManualAdjustmentExecute = vi.fn();
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
        createManualAdjustmentUseCase: { execute: mockCreateManualAdjustmentExecute },
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
const ENTRY_ID = 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a03';
const AM_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10';

const amContext = { userId: AM_USER_ID, tenantId: null, role: 'AM', branchId: null, inspectorId: null };

const adjustmentOutput = {
  id: ENTRY_ID,
  tenantId: TENANT_ID,
  appointmentId: null,
  inspectorId: null,
  entryType: 'MANUAL_ADJUSTMENT',
  amount: 150,
  currency: 'AUD',
  status: 'PENDING',
  description: 'Test adjustment',
  reason: 'Correction',
  effectiveAt: '2026-04-01T00:00:00.000Z',
  initiatedByUserId: AM_USER_ID,
  approvedByUserId: null,
  approvedAt: null,
  referenceEntryId: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
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

describe('QA-002-HIGH-001 — POST /v1/financial/entries/adjust response shape (Pattern A)', () => {
  it('returns 201 with approvedByUserId, approvedAt, updatedAt present in response', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockCreateManualAdjustmentExecute.mockResolvedValueOnce(adjustmentOutput);

    const res = await supertest(app.server)
      .post('/v1/financial/entries/adjust')
      .set('Authorization', 'Bearer am-token')
      .send({
        tenantId: TENANT_ID,
        amount: 150,
        description: 'Test adjustment',
        reason: 'Correction',
      })
      .expect(201);

    expect(res.body.data.id).toBe(ENTRY_ID);
    expect(res.body.data.approvedByUserId).toBeNull();
    expect(res.body.data.approvedAt).toBeNull();
    expect(res.body.data.updatedAt).toBeDefined();
    expect(mockCreateManualAdjustmentExecute).toHaveBeenCalledOnce();
  });

  it('CL_USER receives 403 — cannot create manual adjustments', async () => {
    const clUserContext = { userId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', tenantId: TENANT_ID, role: 'CL_USER', branchId: null, inspectorId: null };
    mockJwtVerify.mockResolvedValueOnce(clUserContext);

    const res = await supertest(app.server)
      .post('/v1/financial/entries/adjust')
      .set('Authorization', 'Bearer cl-user-token')
      .send({
        tenantId: TENANT_ID,
        amount: 150,
        description: 'Test adjustment',
        reason: 'Correction',
      })
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockCreateManualAdjustmentExecute).not.toHaveBeenCalled();
  });
});
