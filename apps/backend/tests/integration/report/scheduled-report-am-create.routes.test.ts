/**
 * QA-019-MEDIUM-001: AM can create scheduled reports by supplying tenantId in body.
 *
 * Covers:
 *   - AM + tenantId in body → 201
 *   - AM without tenantId → 403
 *   - CL_ADMIN without tenantId in body (uses JWT tenantId) → 201
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const mockCreate = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      report: {
        createScheduledReportUseCase: { execute: mockCreate },
        jwtService: { verify: mockJwtVerify },
      },
    } as any),
}));

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const amActor = { userId: 'am-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const clAdminActor = { userId: 'cl-1', tenantId: TENANT_ID, role: 'CL_ADMIN', branchId: null, inspectorId: null };

const validCreateBody = {
  reportType: 'INSPECTIONS_SCHEDULED',
  filtersJson: {},
  format: 'XLSX',
  recurrence: { type: 'daily', hour: 8 },
  deliveryMode: 'OWNER_ONLY',
  recipientUserIds: [],
  skipDeliveryWhenEmpty: false,
};

const mockCreatedSchedule = {
  id: '11111111-2222-3333-4444-555555555555',
  reportType: 'INSPECTIONS_SCHEDULED',
  cronExpression: '0 8 * * *',
  displayName: null,
  deliveryMode: 'OWNER_ONLY',
  recipientUserIds: [],
  skipDeliveryWhenEmpty: false,
  status: 'ACTIVE',
  nextRunAt: new Date('2026-04-25T08:00:00Z'),
  createdAt: new Date('2026-04-24T00:00:00Z'),
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

function authHeader(actor: typeof amActor | typeof clAdminActor) {
  mockJwtVerify.mockResolvedValue({
    userId: actor.userId,
    tenantId: actor.tenantId,
    role: actor.role,
    branchId: actor.branchId,
    inspectorId: actor.inspectorId,
    email: 'test@properfy.local',
  });
  return { Authorization: 'Bearer mock-token' };
}

describe('QA-019-MEDIUM-001: POST /v1/reports/schedules — AM tenant resolution', () => {
  it('AM with tenantId in body creates schedule and returns 201', async () => {
    mockCreate.mockResolvedValue(mockCreatedSchedule);

    const response = await supertest(app.server)
      .post('/v1/reports/schedules')
      .set(authHeader(amActor))
      .send({ ...validCreateBody, tenantId: TENANT_ID })
      .expect(201);

    expect(response.body.data.id).toBe(mockCreatedSchedule.id);
    expect(mockCreate).toHaveBeenCalledOnce();
    const [callInput] = mockCreate.mock.calls[0];
    expect(callInput.tenantId).toBe(TENANT_ID);
  });

  it('AM without tenantId in body returns 403', async () => {
    mockCreate.mockRejectedValue(
      new ForbiddenError('FORBIDDEN', 'Scheduled reports require a tenant context'),
    );

    const response = await supertest(app.server)
      .post('/v1/reports/schedules')
      .set(authHeader(amActor))
      .send(validCreateBody)
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('CL_ADMIN without tenantId in body uses JWT tenantId and returns 201', async () => {
    mockCreate.mockResolvedValue(mockCreatedSchedule);

    const response = await supertest(app.server)
      .post('/v1/reports/schedules')
      .set(authHeader(clAdminActor))
      .send(validCreateBody)
      .expect(201);

    expect(response.body.data.id).toBe(mockCreatedSchedule.id);
    expect(mockCreate).toHaveBeenCalledOnce();
  });
});
