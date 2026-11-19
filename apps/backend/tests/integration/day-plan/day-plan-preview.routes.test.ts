/**
 * Route-level coverage for POST /v1/day-plans/preview (F04-2b, contract 01.14,
 * L-F04-14). The use case is mocked; this asserts the success envelope, body
 * validation, the AM/OP-vs-others error mapping, the 422 range mapping and the
 * 10/min rate limit. Own file so the per-app rate-limit store cannot leak.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/main/server';
import { createMockContainer } from '../../helpers/mock-container';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { dayPlanPreviewDateOutOfRange, inspectorNotFound } from '../../../src/modules/day-plan/domain/day-plan.errors';

const mockPreviewExecute = vi.fn();
const mockOperatorRead = vi.fn();
const mockJwtVerify = vi.fn();
const mockTenantFindById = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      dayPlan: {
        previewRouteWeightsUseCase: { execute: mockPreviewExecute },
        getDayPlanForOperatorUseCase: { execute: mockOperatorRead },
        jwtService: { verify: mockJwtVerify },
        tenantRepo: { findById: mockTenantFindById },
      },
    }),
}));

const amContext = { userId: 'am-u', tenantId: null, role: 'AM', branchId: null, inspectorId: null, timezone: 'Australia/Sydney' };
const opContext = { userId: 'op-u', tenantId: null, role: 'OP', branchId: null, inspectorId: null, timezone: 'Australia/Sydney' };
const inspContext = { userId: 'insp-u', tenantId: null, role: 'INSP', branchId: null, inspectorId: 'insp-1' };
const clContext = { userId: 'cl-u', tenantId: 'tenant-1', role: 'CL_ADMIN', branchId: null, inspectorId: null };

const INSPECTOR_ID = '88888888-8888-4888-8888-888888888888';
const VALID_BODY = {
  inspectorId: INSPECTOR_ID,
  date: '2026-11-05',
  weights: { travel: 1, windowWait: 0, baseProximity: 1 },
};

function variant() {
  return {
    weights: { travel: 1, windowWait: 1, baseProximity: 1 },
    etaSource: 'MATRIX' as const,
    approximate: false,
    departureAt: '2026-11-04T20:50:00.000Z',
    finishEta: '2026-11-04T23:30:00.000Z',
    totals: { driveS: 1800, waitS: 0, lateS: 0 },
    feasible: true,
    stops: [
      {
        appointmentId: '11111111-1111-4111-8111-111111111111',
        sequence: 1,
        appointmentCode: 'APPT-A',
        suburb: 'Suburb-A',
        windowStart: '08:00',
        windowEnd: '17:00',
        timezone: 'Australia/Sydney',
        eta: '2026-11-04T21:00:00.000Z',
        lateS: 0,
      },
    ],
  };
}

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});
afterAll(async () => { await app.close(); });
beforeEach(() => {
  mockJwtVerify.mockReset();
  mockPreviewExecute.mockReset();
  mockOperatorRead.mockReset();
  mockTenantFindById.mockReset().mockResolvedValue({ isActive: () => true });
});

describe('POST /v1/day-plans/preview', () => {
  it('returns { data: { current, proposed } } for AM', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockPreviewExecute.mockResolvedValueOnce({ current: variant(), proposed: variant() });
    const res = await supertest(app.server)
      .post('/v1/day-plans/preview')
      .set('Authorization', 'Bearer t')
      .send(VALID_BODY);
    expect(res.status).toBe(200);
    expect(res.body.data.current.etaSource).toBe('MATRIX');
    expect(res.body.data.proposed.stops[0].appointmentCode).toBe('APPT-A');
    expect(mockPreviewExecute).toHaveBeenCalledWith(
      expect.objectContaining({ inspectorId: INSPECTOR_ID, date: '2026-11-05' }),
    );
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockPreviewExecute.mockResolvedValueOnce({ current: variant(), proposed: variant() });
    const res = await supertest(app.server)
      .post('/v1/day-plans/preview').set('Authorization', 'Bearer t').send(VALID_BODY);
    expect(res.status).toBe(200);
  });

  it('maps a forbidden actor (CL/INSP) to 403 FORBIDDEN', async () => {
    for (const ctx of [clContext, inspContext]) {
      mockJwtVerify.mockResolvedValueOnce(ctx);
      mockPreviewExecute.mockRejectedValueOnce(
        new ForbiddenError('FORBIDDEN', `Role ${ctx.role} is not permitted to perform day_plan.preview_weights`),
      );
      const res = await supertest(app.server)
        .post('/v1/day-plans/preview').set('Authorization', 'Bearer t').send(VALID_BODY);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('rejects an invalid body with 400 before the use case runs', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const res = await supertest(app.server)
      .post('/v1/day-plans/preview').set('Authorization', 'Bearer t')
      .send({ inspectorId: 'not-a-uuid', date: '2026-11-05', weights: { travel: 1, windowWait: 0, baseProximity: 1 } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockPreviewExecute).not.toHaveBeenCalled();
  });

  it('rejects all-zero weights with 400 before the use case runs', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const res = await supertest(app.server)
      .post('/v1/day-plans/preview').set('Authorization', 'Bearer t')
      .send({ inspectorId: INSPECTOR_ID, date: '2026-11-05', weights: { travel: 0, windowWait: 0, baseProximity: 0 } });
    expect(res.status).toBe(400);
    expect(mockPreviewExecute).not.toHaveBeenCalled();
  });

  it('maps an out-of-range date to 422 DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockPreviewExecute.mockRejectedValueOnce(dayPlanPreviewDateOutOfRange());
    const res = await supertest(app.server)
      .post('/v1/day-plans/preview').set('Authorization', 'Bearer t').send(VALID_BODY);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE');
    expect(res.body.error.message).toBe('Pick a day between today and 14 days ahead');
  });

  it('maps a missing inspector to 404 INSPECTOR_NOT_FOUND', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockPreviewExecute.mockRejectedValueOnce(inspectorNotFound());
    const res = await supertest(app.server)
      .post('/v1/day-plans/preview').set('Authorization', 'Bearer t').send(VALID_BODY);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('INSPECTOR_NOT_FOUND');
  });

  it('does not route a POST /preview to the parametric read handler (no collision)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockPreviewExecute.mockResolvedValueOnce({ current: variant(), proposed: variant() });
    const res = await supertest(app.server)
      .post('/v1/day-plans/preview').set('Authorization', 'Bearer t').send(VALID_BODY);
    expect(res.status).toBe(200);
    expect(mockOperatorRead).not.toHaveBeenCalled();
  });
});

describe('rate limit (L-F04-14): 10/min per user', () => {
  it('returns 429 once the per-minute budget is exhausted', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockPreviewExecute.mockResolvedValue({ current: variant(), proposed: variant() });
    let last = 0;
    for (let i = 0; i < 12; i += 1) {
      const res = await supertest(app.server)
        .post('/v1/day-plans/preview').set('Authorization', 'Bearer t').send(VALID_BODY);
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
