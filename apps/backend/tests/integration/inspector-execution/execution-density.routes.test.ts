import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/main/server';
import { createMockContainer } from '../../helpers/mock-container';
import { ForbiddenError, ValidationError } from '../../../src/shared/domain/errors';

const mockExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockTenantFindById = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      executionDensity: {
        getExecutionDensityUseCase: { execute: mockExecute },
        jwtService: { verify: mockJwtVerify },
        tenantRepo: { findById: mockTenantFindById },
      },
    }),
}));

const amContext = { userId: 'am-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const inspContext = { userId: 'insp-1', tenantId: null, role: 'INSP', branchId: null, inspectorId: 'insp-1' };
const clAdminContext = { userId: 'cl-1', tenantId: 'tenant-1', role: 'CL_ADMIN', branchId: null, inspectorId: null };

const validResponse = {
  fromDate: '2026-10-01',
  toDate: '2026-10-30',
  gridSizeDegrees: 0.001,
  minCellCount: 1,
  cells: [{ lat: -33.8685, lng: 151.2095, count: 3 }],
  cellCount: 1,
  totalExecutions: 3,
  excludedWithoutCoordinates: 0,
  truncated: false,
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
  mockTenantFindById.mockResolvedValue({ isActive: () => true });
});

describe('GET /v1/map/execution-density', () => {
  it('R1: AM gets 200 with the data envelope and the use case receives the parsed query', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockExecute.mockResolvedValueOnce(validResponse);
    const res = await supertest(app.server)
      .get('/v1/map/execution-density?fromDate=2026-10-01&toDate=2026-10-30')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: validResponse });
    expect(mockExecute).toHaveBeenCalledWith({
      actor: amContext,
      query: { fromDate: '2026-10-01', toDate: '2026-10-30' },
    });
  });

  it('R2: no token with a valid query is 401', async () => {
    const res = await supertest(app.server).get(
      '/v1/map/execution-density?fromDate=2026-10-01&toDate=2026-10-30',
    );
    expect(res.status).toBe(401);
  });

  it('R3: toDate < fromDate is a 400 VALIDATION_ERROR envelope', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const res = await supertest(app.server)
      .get('/v1/map/execution-density?fromDate=2026-10-30&toDate=2026-10-01')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error).toHaveProperty('message');
  });

  it('R4: a 400-day period is a 400 VALIDATION_ERROR', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const res = await supertest(app.server)
      .get('/v1/map/execution-density?fromDate=2025-09-01&toDate=2026-10-30')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('R5: INSP is 403 AUTH_FORBIDDEN (use case rejects)', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockExecute.mockRejectedValueOnce(
      new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions to view activity density.'),
    );
    const res = await supertest(app.server)
      .get('/v1/map/execution-density?fromDate=2026-10-01&toDate=2026-10-30')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
  });

  it('R6: CL_ADMIN passing inspectorId is 403 AUTH_FORBIDDEN', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    mockExecute.mockRejectedValueOnce(
      new ForbiddenError(
        'AUTH_FORBIDDEN',
        'Filtering activity density by inspector is not available for agency accounts.',
      ),
    );
    const res = await supertest(app.server)
      .get(
        '/v1/map/execution-density?fromDate=2026-10-06&toDate=2026-11-04&inspectorId=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      )
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
  });

  it('R7: an extra key on a cell is stripped by the response serializer', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockExecute.mockResolvedValueOnce({
      ...validResponse,
      cells: [{ lat: -33.8685, lng: 151.2095, count: 3, inspectorId: 'leaked' }],
    });
    const res = await supertest(app.server)
      .get('/v1/map/execution-density?fromDate=2026-10-01&toDate=2026-10-30')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.data.cells[0]).toEqual({ lat: -33.8685, lng: 151.2095, count: 3 });
    expect(res.body.data.cells[0]).not.toHaveProperty('inspectorId');
  });

  it('R8: an inactive agency is rejected by the middleware for a CL actor', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    mockTenantFindById.mockResolvedValueOnce({ isActive: () => false });
    const res = await supertest(app.server)
      .get('/v1/map/execution-density?fromDate=2026-10-06&toDate=2026-11-04')
      .set('Authorization', 'Bearer valid-token');
    expect([401, 403]).toContain(res.status);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('R9: a CL non-preset period surfaces PERIOD_NOT_A_PRESET (400)', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    mockExecute.mockRejectedValueOnce(
      new ValidationError('Agency accounts can only view the last 7, 30 or 90 days.', {
        reason: 'PERIOD_NOT_A_PRESET',
        allowedDays: [7, 30, 90],
      }),
    );
    const res = await supertest(app.server)
      .get('/v1/map/execution-density?fromDate=2026-10-01&toDate=2026-10-10')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.reason).toBe('PERIOD_NOT_A_PRESET');
  });
});
