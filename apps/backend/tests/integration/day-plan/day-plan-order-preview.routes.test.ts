/**
 * Route-level coverage for POST /v1/inspector/day-plans/:date/order/preview
 * (F04 Plan B). The use case is mocked; this asserts the success envelope, INSP-only
 * access, body validation, error mapping and the 30/min rate limit. Own file so the
 * per-app rate-limit store cannot leak.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/main/server';
import { createMockContainer } from '../../helpers/mock-container';
import {
  dayPlanNotFound,
  dayPlanVersionConflict,
} from '../../../src/modules/day-plan/domain/day-plan.errors';

const mockPreviewExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockTenantFindById = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      dayPlan: {
        previewDayPlanOrderUseCase: { execute: mockPreviewExecute },
        jwtService: { verify: mockJwtVerify },
        tenantRepo: { findById: mockTenantFindById },
      },
    }),
}));

const inspContext = { userId: 'insp-u', tenantId: null, role: 'INSP', branchId: null, inspectorId: 'insp-1' };
const amContext = { userId: 'am-u', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const URL = '/v1/inspector/day-plans/2026-11-05/order/preview';
const BODY = { appointmentIds: [B, A], basedOnVersion: 2 };

const RESULT = {
  etaSource: 'MATRIX' as const,
  approximate: false,
  approximateReason: null,
  departureAt: '2026-11-04T20:50:00.000Z',
  finishEta: '2026-11-04T23:30:00.000Z',
  totals: { driveS: 1800, waitS: 0, serviceS: 5400, lateS: 0, distanceM: null },
  feasible: true,
  violations: [],
  stops: [
    { appointmentId: B, sequence: 1, eta: '2026-11-04T21:00:00.000Z', travelS: 900, waitS: 0, lateS: 0 },
    { appointmentId: A, sequence: 2, eta: '2026-11-04T22:00:00.000Z', travelS: 900, waitS: 0, lateS: 0 },
  ],
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
  mockJwtVerify.mockReset();
  mockPreviewExecute.mockReset();
  mockTenantFindById.mockReset().mockResolvedValue({ isActive: () => true });
});

describe('POST /v1/inspector/day-plans/:date/order/preview', () => {
  it('returns the evaluated order for the calling inspector only', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockPreviewExecute.mockResolvedValueOnce(RESULT);
    const res = await supertest(app.server).post(URL).set('Authorization', 'Bearer t').send(BODY);
    expect(res.status).toBe(200);
    expect(res.body.data.etaSource).toBe('MATRIX');
    expect(res.body.data.stops.map((s: { appointmentId: string }) => s.appointmentId)).toEqual([B, A]);
    expect(mockPreviewExecute).toHaveBeenCalledWith({
      inspectorId: 'insp-1',
      date: '2026-11-05',
      appointmentIds: [B, A],
      basedOnVersion: 2,
    });
  });

  it('refuses non-inspector roles with 403', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const res = await supertest(app.server).post(URL).set('Authorization', 'Bearer t').send(BODY);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INSP_ONLY');
    expect(mockPreviewExecute).not.toHaveBeenCalled();
  });

  it('rejects duplicate ids and a bad version with 400 before the use case runs', async () => {
    mockJwtVerify.mockResolvedValue(inspContext);
    const dup = await supertest(app.server).post(URL).set('Authorization', 'Bearer t').send({ appointmentIds: [A, A], basedOnVersion: 1 });
    expect(dup.status).toBe(400);
    const ver = await supertest(app.server).post(URL).set('Authorization', 'Bearer t').send({ appointmentIds: [A], basedOnVersion: 0 });
    expect(ver.status).toBe(400);
    expect(mockPreviewExecute).not.toHaveBeenCalled();
  });

  it('maps 404 / 409 domain errors', async () => {
    mockJwtVerify.mockResolvedValue(inspContext);
    mockPreviewExecute.mockRejectedValueOnce(dayPlanNotFound());
    expect((await supertest(app.server).post(URL).set('Authorization', 'Bearer t').send(BODY)).status).toBe(404);
    mockPreviewExecute.mockRejectedValueOnce(dayPlanVersionConflict(3));
    expect((await supertest(app.server).post(URL).set('Authorization', 'Bearer t').send(BODY)).status).toBe(409);
  });
});

describe('rate limit: 30/min per inspector', () => {
  it('returns 429 once the per-minute budget is exhausted', async () => {
    mockJwtVerify.mockResolvedValue(inspContext);
    mockPreviewExecute.mockResolvedValue(RESULT);
    const statuses: number[] = [];
    for (let i = 0; i < 33; i += 1) {
      const res = await supertest(app.server).post(URL).set('Authorization', 'Bearer t').send(BODY);
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 200 || s === 404 || s === 409 || s === 422)).toBe(true);
    expect(statuses[statuses.length - 1]).toBe(429);
  });
});
