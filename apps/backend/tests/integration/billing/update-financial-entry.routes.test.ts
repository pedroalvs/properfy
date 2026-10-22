/**
 * WEB-FIN-TYPING (PR-N): PATCH /v1/financial/entries/:entryId — edit a PENDING
 * manual adjustment in place. Route-level contract: Zod body validation, mandatory
 * Idempotency-Key header, and domain-error → HTTP envelope mapping. RBAC and the
 * editability guard live in the use-case, so denial/conflict are simulated by
 * making the mocked use-case reject (mirrors draft-invoice-admin-review.test.ts).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { EntryNotEditableError, EntryNotFoundError } from '../../../src/modules/billing/domain/billing.errors';

const mockUpdateExecute = vi.fn();
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
        updateFinancialEntryUseCase: { execute: mockUpdateExecute },
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
const clUserContext = { userId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', tenantId: TENANT_ID, role: 'CL_USER', branchId: null, inspectorId: null };

const updatedOutput = {
  id: ENTRY_ID,
  tenantId: TENANT_ID,
  appointmentId: null,
  inspectorId: null,
  entryType: 'MANUAL_ADJUSTMENT',
  amount: 250,
  currency: 'AUD',
  status: 'PENDING',
  description: 'Corrected amount',
  effectiveAt: '2026-04-01T00:00:00.000Z',
  initiatedByUserId: AM_USER_ID,
  approvedByUserId: null,
  approvedAt: null,
  referenceEntryId: null,
  reason: 'Operator correction',
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-04-02T10:00:00.000Z',
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

describe('PATCH /v1/financial/entries/:entryId', () => {
  it('returns 200 with the updated entry when the edit succeeds', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUpdateExecute.mockResolvedValueOnce(updatedOutput);

    const res = await supertest(app.server)
      .patch(`/v1/financial/entries/${ENTRY_ID}`)
      .set('Authorization', 'Bearer am-token')
      .set('Idempotency-Key', 'edit-key-1')
      .send({ amount: 250, description: 'Corrected amount', reason: 'Operator correction' })
      .expect(200);

    expect(res.body.data.id).toBe(ENTRY_ID);
    expect(res.body.data.amount).toBe(250);
    expect(res.body.data.status).toBe('PENDING');
    expect(mockUpdateExecute).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: ENTRY_ID, amount: 250, description: 'Corrected amount', actor: amContext }),
    );
  });

  it('coerces effectiveAt to a Date before calling the use-case', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUpdateExecute.mockResolvedValueOnce(updatedOutput);

    await supertest(app.server)
      .patch(`/v1/financial/entries/${ENTRY_ID}`)
      .set('Authorization', 'Bearer am-token')
      .set('Idempotency-Key', 'edit-key-2')
      .send({ effectiveAt: '2026-04-01T00:00:00.000Z' })
      .expect(200);

    const arg = mockUpdateExecute.mock.calls[0]![0];
    expect(arg.effectiveAt).toBeInstanceOf(Date);
    expect(arg.effectiveAt.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('returns 400 when the Idempotency-Key header is missing', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .patch(`/v1/financial/entries/${ENTRY_ID}`)
      .set('Authorization', 'Bearer am-token')
      .send({ amount: 250 })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockUpdateExecute).not.toHaveBeenCalled();
  });

  it('returns 400 when no editable field is provided (empty body)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .patch(`/v1/financial/entries/${ENTRY_ID}`)
      .set('Authorization', 'Bearer am-token')
      .set('Idempotency-Key', 'edit-key-3')
      .send({})
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockUpdateExecute).not.toHaveBeenCalled();
  });

  it('returns 400 when amount is not positive', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .patch(`/v1/financial/entries/${ENTRY_ID}`)
      .set('Authorization', 'Bearer am-token')
      .set('Idempotency-Key', 'edit-key-4')
      .send({ amount: -5 })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockUpdateExecute).not.toHaveBeenCalled();
  });

  it('returns 403 when a CL_USER attempts the edit (use-case denies)', async () => {
    mockJwtVerify.mockResolvedValueOnce(clUserContext);
    mockUpdateExecute.mockRejectedValueOnce(new ForbiddenError('FORBIDDEN', 'Role CL_USER is not permitted'));

    const res = await supertest(app.server)
      .patch(`/v1/financial/entries/${ENTRY_ID}`)
      .set('Authorization', 'Bearer cl-user-token')
      .set('Idempotency-Key', 'edit-key-5')
      .send({ amount: 250 })
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 409 when the entry is not an editable pending manual adjustment', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUpdateExecute.mockRejectedValueOnce(new EntryNotEditableError());

    const res = await supertest(app.server)
      .patch(`/v1/financial/entries/${ENTRY_ID}`)
      .set('Authorization', 'Bearer am-token')
      .set('Idempotency-Key', 'edit-key-6')
      .send({ amount: 250 })
      .expect(409);

    expect(res.body.error.code).toBe('ENTRY_NOT_EDITABLE');
  });

  it('returns 404 when the entry does not exist', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUpdateExecute.mockRejectedValueOnce(new EntryNotFoundError());

    const res = await supertest(app.server)
      .patch(`/v1/financial/entries/${ENTRY_ID}`)
      .set('Authorization', 'Bearer am-token')
      .set('Idempotency-Key', 'edit-key-7')
      .send({ amount: 250 })
      .expect(404);

    expect(res.body.error.code).toBe('ENTRY_NOT_FOUND');
  });
});
