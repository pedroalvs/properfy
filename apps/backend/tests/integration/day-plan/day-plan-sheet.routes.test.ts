/**
 * Route-level coverage for the Esteio slice of the day-plan interface: the PDF/XLSX
 * route sheet (01.A6, L-F04-10), the ETA-accuracy metric (FR-014) and the AM/OP
 * rate limits (L-F04-14). The use cases are mocked; this asserts RBAC, download
 * headers, query validation and the declared per-route limits. Own file so the
 * per-app rate-limit store cannot leak into other suites.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/main/server';
import { createMockContainer } from '../../helpers/mock-container';
import { dayPlanSheetTooOld } from '../../../src/modules/day-plan/domain/day-plan.errors';

const mockSheetExecute = vi.fn();
const mockEtaExecute = vi.fn();
const mockOperatorRead = vi.fn();
const mockJwtVerify = vi.fn();
const mockTenantFindById = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      dayPlan: {
        getDayPlanSheetUseCase: { execute: mockSheetExecute },
        getRouteEtaAccuracyUseCase: { execute: mockEtaExecute },
        getDayPlanForOperatorUseCase: { execute: mockOperatorRead },
        jwtService: { verify: mockJwtVerify },
        tenantRepo: { findById: mockTenantFindById },
      },
    }),
}));

const inspContext = { userId: 'insp-u', tenantId: null, role: 'INSP', branchId: null, inspectorId: 'insp-1' };
const amContext = { userId: 'am-u', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const clContext = { userId: 'cl-u', tenantId: 'tenant-1', role: 'CL_ADMIN', branchId: null, inspectorId: null };

const INSPECTOR_ID = '88888888-8888-4888-8888-888888888888';

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});
afterAll(async () => { await app.close(); });
beforeEach(() => {
  // mockReset (not clearAllMocks) so an unconsumed `mockResolvedValueOnce` — e.g. the
  // csv test, rejected at schema validation before the auth preHandler runs — cannot
  // leak into the next test's verify queue and invert the resolved role.
  mockJwtVerify.mockReset();
  mockSheetExecute.mockReset();
  mockEtaExecute.mockReset();
  mockOperatorRead.mockReset();
  mockTenantFindById.mockReset().mockResolvedValue({ isActive: () => true });
});

describe('GET /v1/inspector/day-plans/:date/sheet', () => {
  it('returns a PDF with the download headers (test 21)', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockSheetExecute.mockResolvedValueOnce({
      buffer: Buffer.from('%PDF-1.7 body'),
      contentType: 'application/pdf',
      filename: 'route-jane-doe-2026-11-05.pdf',
    });
    const res = await supertest(app.server)
      .get('/v1/inspector/day-plans/2026-11-05/sheet?format=pdf')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="route-jane-doe-2026-11-05.pdf"',
    );
  });

  it('returns an XLSX content type for format=xlsx', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockSheetExecute.mockResolvedValueOnce({
      buffer: Buffer.from('PK'),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: 'route-jane-doe-2026-11-05.xlsx',
    });
    const res = await supertest(app.server)
      .get('/v1/inspector/day-plans/2026-11-05/sheet?format=xlsx')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

  it('rejects format=csv with a 400 VALIDATION_ERROR (test 21)', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    const res = await supertest(app.server)
      .get('/v1/inspector/day-plans/2026-11-05/sheet?format=csv')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockSheetExecute).not.toHaveBeenCalled();
  });

  it('maps a too-old sheet to 422 DAY_PLAN_SHEET_TOO_OLD (test 24d)', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockSheetExecute.mockRejectedValueOnce(dayPlanSheetTooOld());
    const res = await supertest(app.server)
      .get('/v1/inspector/day-plans/2026-01-01/sheet?format=pdf')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('DAY_PLAN_SHEET_TOO_OLD');
  });
});

describe('GET /v1/day-plans/:inspectorId/:date/sheet (AM/OP)', () => {
  it('lets AM download any inspector sheet', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockSheetExecute.mockResolvedValueOnce({
      buffer: Buffer.from('%PDF'),
      contentType: 'application/pdf',
      filename: 'route-x-2026-11-05.pdf',
    });
    const res = await supertest(app.server)
      .get(`/v1/day-plans/${INSPECTOR_ID}/2026-11-05/sheet?format=pdf`)
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(mockSheetExecute).toHaveBeenCalledWith(
      expect.objectContaining({ inspectorId: INSPECTOR_ID, date: '2026-11-05', format: 'pdf' }),
    );
  });

  it('forbids an inspector on the AM/OP sheet route', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    const res = await supertest(app.server)
      .get(`/v1/day-plans/${INSPECTOR_ID}/2026-11-05/sheet?format=pdf`)
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
    expect(mockSheetExecute).not.toHaveBeenCalled();
  });
});

describe('GET /v1/day-plans/eta-accuracy (test 22)', () => {
  const metric = {
    from: '2026-10-07', to: '2026-11-05', days: 30, sampleSize: 40, excludedOutliers: 0,
    meanAbsoluteErrorMinutes: 5, thresholdMinutes: 10, minSampleSize: 30, status: 'OK' as const,
  };

  it('answers AM with the metric envelope', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockEtaExecute.mockResolvedValueOnce(metric);
    const res = await supertest(app.server)
      .get('/v1/day-plans/eta-accuracy?days=30')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: metric });
    expect(mockEtaExecute).toHaveBeenCalledWith({ days: 30 });
  });

  it('forbids an inspector', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    const res = await supertest(app.server)
      .get('/v1/day-plans/eta-accuracy?days=30')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
    expect(mockEtaExecute).not.toHaveBeenCalled();
  });

  it('forbids a CL actor', async () => {
    mockJwtVerify.mockResolvedValueOnce(clContext);
    const res = await supertest(app.server)
      .get('/v1/day-plans/eta-accuracy?days=30')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });

  it('does not collide with the parametric read route (test 24)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockEtaExecute.mockResolvedValueOnce(metric);
    const res = await supertest(app.server)
      .get('/v1/day-plans/eta-accuracy?days=7')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    // The parametric handler must not have run.
    expect(mockOperatorRead).not.toHaveBeenCalled();
  });
});

describe('rate limits (L-F04-14, test 24c)', () => {
  it('limits the inspector sheet to 20/min (429 on the 21st)', async () => {
    mockJwtVerify.mockResolvedValue(inspContext);
    mockSheetExecute.mockResolvedValue({
      buffer: Buffer.from('%PDF'),
      contentType: 'application/pdf',
      filename: 'route-x-2026-11-05.pdf',
    });
    let last = 0;
    for (let i = 0; i < 21; i += 1) {
      const res = await supertest(app.server)
        .get('/v1/inspector/day-plans/2026-11-05/sheet?format=pdf')
        .set('Authorization', 'Bearer t');
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
