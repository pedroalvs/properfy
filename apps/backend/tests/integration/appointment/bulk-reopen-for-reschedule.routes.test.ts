/**
 * POST /v1/appointments/bulk-reopen-for-reschedule — route contracts.
 *
 * Covers (cycle 11 Revisor findings):
 *  F1 — CL_ADMIN is allowed (RBAC widen).
 *  F2a — INVALID_DATE_WINDOW code surfaces in the mixed-result envelope.
 *  F2b — use case receives the correct payload (event name verified in unit tests).
 *  Zod validation for malformed payloads.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    appointment: {
      bulkReopenForRescheduleUseCase: { execute: mockExecute },
      jwtService: { verify: mockJwtVerify },
      tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true, settingsJson: {} }) },
    },
  }),
}));

const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const APPT_ID_1 = 'aaaaaaaa-0000-4000-8000-000000000010';
const APPT_ID_2 = 'aaaaaaaa-0000-4000-8000-000000000011';

const opContext    = { userId: 'op-1',   tenantId: null,    role: 'OP',       branchId: null, inspectorId: null };
const amContext    = { userId: 'am-1',   tenantId: null,    role: 'AM',       branchId: null, inspectorId: null };
const clAdminCtx  = { userId: 'cl-a',   tenantId: TENANT_A, role: 'CL_ADMIN', branchId: null, inspectorId: null };
const clUserCtx   = { userId: 'cl-u',   tenantId: TENANT_A, role: 'CL_USER',  branchId: null, inspectorId: null };
const inspCtx     = { userId: 'insp-1', tenantId: null,    role: 'INSP',     branchId: null, inspectorId: 'i-1' };

const VALID_BODY = {
  appointmentIds: [APPT_ID_1],
  newDate: '2027-08-01',
  newTimeSlot: '09:00-10:00',
  reason: 'Tenant requested',
  actorTimezone: 'Australia/Sydney',
};

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(() => {
  vi.clearAllMocks();
  mockJwtVerify.mockReset();
  mockExecute.mockReset();
});

describe('POST /v1/appointments/bulk-reopen-for-reschedule', () => {
  it('returns { data: { results } } envelope on success (OP)', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    mockExecute.mockResolvedValue({ results: [{ appointmentId: APPT_ID_1, status: 'OK' }] });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-reopen-for-reschedule')
      .set('Authorization', 'Bearer token')
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.data.results[0]).toEqual({ appointmentId: APPT_ID_1, status: 'OK' });
  });

  // F1 — Revisor cycle 11: CL_ADMIN must be allowed.
  it('F1: allows CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(clAdminCtx);
    mockExecute.mockResolvedValue({ results: [{ appointmentId: APPT_ID_1, status: 'OK' }] });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-reopen-for-reschedule')
      .set('Authorization', 'Bearer token')
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(mockExecute).toHaveBeenCalled();
  });

  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockExecute.mockResolvedValue({ results: [] });
    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-reopen-for-reschedule')
      .set('Authorization', 'Bearer token')
      .send(VALID_BODY);
    expect(res.status).toBe(200);
  });

  it('rejects INSP with 403', async () => {
    mockJwtVerify.mockResolvedValue(inspCtx);
    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-reopen-for-reschedule')
      .set('Authorization', 'Bearer token')
      .send(VALID_BODY);
    expect(res.status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('rejects CL_USER with 403', async () => {
    mockJwtVerify.mockResolvedValue(clUserCtx);
    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-reopen-for-reschedule')
      .set('Authorization', 'Bearer token')
      .send(VALID_BODY);
    expect(res.status).toBe(403);
  });

  // F2a — INVALID_DATE_WINDOW surfaces in the mixed envelope without aborting batch.
  it('F2a: INVALID_DATE_WINDOW code is visible in per-item result (mixed envelope)', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    mockExecute.mockResolvedValue({
      results: [
        { appointmentId: APPT_ID_1, status: 'OK' },
        {
          appointmentId: APPT_ID_2,
          status: 'INVALID_TRANSITION',
          error: { code: 'INVALID_DATE_WINDOW', message: 'New date exceeds 30-day rescheduling window from 2027-08-01' },
        },
      ],
    });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-reopen-for-reschedule')
      .set('Authorization', 'Bearer token')
      .send({ ...VALID_BODY, appointmentIds: [APPT_ID_1, APPT_ID_2] });

    expect(res.status).toBe(200);
    const results = res.body.data.results;
    expect(results).toHaveLength(2);
    const windowFail = results.find((r: any) => r.appointmentId === APPT_ID_2);
    expect(windowFail?.error?.code).toBe('INVALID_DATE_WINDOW');
  });

  it('forwards actorTimezone and reason to the use case', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    mockExecute.mockResolvedValue({ results: [] });

    await supertest(app.server)
      .post('/v1/appointments/bulk-reopen-for-reschedule')
      .set('Authorization', 'Bearer token')
      .send(VALID_BODY);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        newDate: '2027-08-01',
        newTimeSlot: '09:00-10:00',
        reason: 'Tenant requested',
        actorTimezone: 'Australia/Sydney',
      }),
    );
  });

  it('rejects missing appointmentIds with 400', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-reopen-for-reschedule')
      .set('Authorization', 'Bearer token')
      .send({ newDate: '2027-08-01', newTimeSlot: '09:00-10:00' });
    expect(res.status).toBe(400);
  });
});
