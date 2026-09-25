/**
 * B1 — Idempotency-Key mandatory on POST /v1/financial/entries/:entryId/void.
 *
 * Verifies: (a) missing header → 400 VALIDATION_ERROR, (b) header forwarded to
 * the use case, (c) a use-case-level payload mismatch surfaces as 409.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { EntryNotApprovedError, BillingIdempotencyPayloadMismatchError } from '../../../src/modules/billing/domain/billing.errors';

const mockVoidFinancialEntryExecute = vi.fn();
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
        voidFinancialEntryUseCase: { execute: mockVoidFinancialEntryExecute },
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
const AM_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10';

const amContext = { userId: AM_USER_ID, tenantId: null, role: 'AM', branchId: null, inspectorId: null };

const voidedResult = {
  id: ENTRY_ID,
  status: 'VOIDED',
  voidedBy: AM_USER_ID,
  voidedAt: '2026-04-23T10:00:00.000Z',
  voidReason: 'Entry created in error',
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

describe('POST /v1/financial/entries/:entryId/void — B1 idempotency', () => {
  it('returns 200 and forwards the Idempotency-Key header to the use case', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockVoidFinancialEntryExecute.mockResolvedValueOnce(voidedResult);

    const res = await supertest(app.server)
      .post(`/v1/financial/entries/${ENTRY_ID}/void`)
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', 'void-key-1')
      .send({ reason: 'Entry created in error' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('VOIDED');
    expect(mockVoidFinancialEntryExecute).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: ENTRY_ID, reason: 'Entry created in error', idempotencyKey: 'void-key-1' }),
    );
  });

  it('returns 400 VALIDATION_ERROR without Idempotency-Key header', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/financial/entries/${ENTRY_ID}/void`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'Entry created in error' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockVoidFinancialEntryExecute).not.toHaveBeenCalled();
  });

  it('two calls with the same key and identical payload both return the cached body', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockVoidFinancialEntryExecute.mockResolvedValue(voidedResult);

    const key = 'void-replay-key';
    const payload = { reason: 'Entry created in error' };

    const first = await supertest(app.server)
      .post(`/v1/financial/entries/${ENTRY_ID}/void`)
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', key)
      .send(payload);
    const second = await supertest(app.server)
      .post(`/v1/financial/entries/${ENTRY_ID}/void`)
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', key)
      .send(payload);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
  });

  it('same key + different payload surfaces the use case IDEMPOTENCY_PAYLOAD_MISMATCH as 409', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockVoidFinancialEntryExecute.mockRejectedValueOnce(new BillingIdempotencyPayloadMismatchError());

    const res = await supertest(app.server)
      .post(`/v1/financial/entries/${ENTRY_ID}/void`)
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', 'void-mismatch-key')
      .send({ reason: 'A different reason' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
  });

  it('non-APPROVED entry returns 409 ENTRY_NOT_APPROVED', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockVoidFinancialEntryExecute.mockRejectedValueOnce(new EntryNotApprovedError());

    const res = await supertest(app.server)
      .post(`/v1/financial/entries/${ENTRY_ID}/void`)
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', 'void-key-2')
      .send({ reason: 'Test reason' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ENTRY_NOT_APPROVED');
  });

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server)
      .post(`/v1/financial/entries/${ENTRY_ID}/void`)
      .send({ reason: 'Test reason' });

    expect(res.status).toBe(401);
  });
});
