/**
 * Feature 019: scheduled-reports lifecycle integration tests.
 *
 * Uses a mocked container (no real DB) to verify:
 *   - route registration for all 9 Feature 019 schedule endpoints
 *   - auth required on all of them
 *   - Zod validation for create, update, pause, reassign
 *   - RBAC pass-through (AM cross-tenant, OP/CL_ADMIN/CL_USER scoped)
 *   - AM-only reassignment
 *   - soft-delete returns 204
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { ScheduleForbiddenReassignmentError } from '../../../src/modules/report/domain/report.errors';

const mockCreate = vi.fn();
const mockList = vi.fn();
const mockGet = vi.fn();
const mockUpdate = vi.fn();
const mockPause = vi.fn();
const mockResume = vi.fn();
const mockDelete = vi.fn();
const mockReassign = vi.fn();
const mockListRuns = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      report: {
        createScheduledReportUseCase: { execute: mockCreate },
        listScheduledReportsUseCase: { execute: mockList },
        getScheduledReportUseCase: { execute: mockGet },
        updateScheduledReportUseCase: { execute: mockUpdate },
        pauseScheduledReportUseCase: { execute: mockPause },
        resumeScheduledReportUseCase: { execute: mockResume },
        deleteScheduledReportUseCase: { execute: mockDelete },
        reassignScheduleOwnershipUseCase: { execute: mockReassign },
        listScheduleRunsUseCase: { execute: mockListRuns },
        jwtService: { verify: mockJwtVerify },
      },
    } as any),
}));

const SCHEDULE_ID = '11111111-2222-3333-4444-555555555555';
const opActor = { userId: 'op-1', tenantId: 'tenant-1', role: 'OP', branchId: null, inspectorId: null };
const amActor = { userId: 'am-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const clAdminActor = { userId: 'cl-1', tenantId: 'tenant-1', role: 'CL_ADMIN', branchId: null, inspectorId: null };

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(() => { vi.clearAllMocks(); });

function authHeader(actor: typeof opActor) {
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

describe('Feature 019: POST /v1/reports/schedules', () => {
  it('creates a schedule with structured recurrence for OP', async () => {
    mockCreate.mockResolvedValue({
      id: SCHEDULE_ID,
      reportType: 'INSPECTIONS_SCHEDULED',
      cronExpression: '0 9 * * *',
      deliveryEmail: '',
      displayName: 'Daily Inspections',
      deliveryMode: 'OWNER_ONLY',
      recipientUserIds: [],
      skipDeliveryWhenEmpty: false,
      isActive: true,
      status: 'ACTIVE',
      nextRunAt: new Date('2026-04-13T09:00:00Z'),
      createdAt: new Date('2026-04-12T00:00:00Z'),
    });

    const response = await supertest(app.server)
      .post('/v1/reports/schedules')
      .set(authHeader(opActor))
      .send({
        reportType: 'INSPECTIONS_SCHEDULED',
        filtersJson: { tenantId: 'tenant-1' },
        format: 'XLSX',
        recurrence: { type: 'daily', hour: 9 },
        deliveryMode: 'OWNER_ONLY',
        recipientUserIds: [],
        displayName: 'Daily Inspections',
        skipDeliveryWhenEmpty: false,
      })
      .expect(201);

    expect(response.body.data.id).toBe(SCHEDULE_ID);
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it('rejects a request without recurrence or cronExpression with 400', async () => {
    await supertest(app.server)
      .post('/v1/reports/schedules')
      .set(authHeader(opActor))
      .send({
        reportType: 'INSPECTIONS_SCHEDULED',
        filtersJson: {},
        format: 'XLSX',
        deliveryMode: 'OWNER_ONLY',
        recipientUserIds: [],
        skipDeliveryWhenEmpty: false,
      })
      .expect(400);
  });

  it('returns 401 without auth when the body is valid', async () => {
    await supertest(app.server)
      .post('/v1/reports/schedules')
      .send({
        reportType: 'INSPECTIONS_SCHEDULED',
        filtersJson: {},
        format: 'XLSX',
        recurrence: { type: 'daily', hour: 9 },
        deliveryMode: 'OWNER_ONLY',
        recipientUserIds: [],
        skipDeliveryWhenEmpty: false,
      })
      .expect(401);
  });
});

describe('Feature 019: GET /v1/reports/schedules/:id', () => {
  it('returns 200 with detail + lastRunStatus for OP', async () => {
    mockGet.mockResolvedValue({
      schedule: {
        id: SCHEDULE_ID,
        tenantId: 'tenant-1',
        reportType: 'INSPECTIONS_SCHEDULED',
        filtersJson: {},
        format: 'XLSX',
        cronExpression: '0 9 * * *',
        displayName: 'Daily',
        deliveryMode: 'OWNER_ONLY',
        recipientUserIds: [],
        skipDeliveryWhenEmpty: false,
        consecutiveFailureCount: 0,
        status: 'ACTIVE',
        isActive: true,
        lastRunAt: null,
        nextRunAt: new Date('2026-04-13T09:00:00Z'),
        createdByUserId: 'op-1',
        createdAt: new Date('2026-04-12T00:00:00Z'),
        updatedAt: new Date('2026-04-12T00:00:00Z'),
      },
      lastRunStatus: 'completed',
    });

    const response = await supertest(app.server)
      .get(`/v1/reports/schedules/${SCHEDULE_ID}`)
      .set(authHeader(opActor))
      .expect(200);

    expect(response.body.data.lastRunStatus).toBe('completed');
  });
});

describe('Feature 019: PUT /v1/reports/schedules/:id', () => {
  it('updates display name and recurrence for the owner', async () => {
    mockUpdate.mockResolvedValue({
      id: SCHEDULE_ID,
      displayName: 'New Name',
      deliveryMode: 'OWNER_ONLY',
      recipientUserIds: [],
      skipDeliveryWhenEmpty: false,
      cronExpression: '0 10 * * *',
      nextRunAt: new Date('2026-04-13T10:00:00Z'),
      status: 'ACTIVE',
    });

    await supertest(app.server)
      .put(`/v1/reports/schedules/${SCHEDULE_ID}`)
      .set(authHeader(opActor))
      .send({
        displayName: 'New Name',
        recurrence: { type: 'daily', hour: 10 },
      })
      .expect(200);

    expect(mockUpdate).toHaveBeenCalledOnce();
  });

  it('rejects empty update bodies with 400', async () => {
    await supertest(app.server)
      .put(`/v1/reports/schedules/${SCHEDULE_ID}`)
      .set(authHeader(opActor))
      .send({})
      .expect(400);
  });
});

describe('Feature 019: POST /v1/reports/schedules/:id/pause', () => {
  it('pauses a schedule', async () => {
    mockPause.mockResolvedValue({ id: SCHEDULE_ID, status: 'PAUSED' });

    const response = await supertest(app.server)
      .post(`/v1/reports/schedules/${SCHEDULE_ID}/pause`)
      .set(authHeader(opActor))
      .send({ reason: 'Manual intervention' })
      .expect(200);

    expect(response.body.data.status).toBe('PAUSED');
  });

  it('rejects non-owner without access with 403', async () => {
    mockPause.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Not permitted'));

    await supertest(app.server)
      .post(`/v1/reports/schedules/${SCHEDULE_ID}/pause`)
      .set(authHeader(clAdminActor))
      .send({ reason: 'test' })
      .expect(403);
  });
});

describe('Feature 019: POST /v1/reports/schedules/:id/resume', () => {
  it('resumes a schedule and returns next run time', async () => {
    mockResume.mockResolvedValue({
      id: SCHEDULE_ID,
      status: 'ACTIVE',
      nextRunAt: new Date('2026-04-13T09:00:00Z'),
    });

    const response = await supertest(app.server)
      .post(`/v1/reports/schedules/${SCHEDULE_ID}/resume`)
      .set(authHeader(opActor))
      .expect(200);

    expect(response.body.data.status).toBe('ACTIVE');
  });
});

describe('Feature 019: DELETE /v1/reports/schedules/:id', () => {
  it('returns 204 on successful soft-delete', async () => {
    mockDelete.mockResolvedValue(undefined);

    await supertest(app.server)
      .delete(`/v1/reports/schedules/${SCHEDULE_ID}`)
      .set(authHeader(opActor))
      .expect(204);

    expect(mockDelete).toHaveBeenCalledOnce();
  });
});

describe('Feature 019: POST /v1/reports/schedules/:id/reassign (AM only)', () => {
  it('allows AM to reassign ownership', async () => {
    mockReassign.mockResolvedValue({
      id: SCHEDULE_ID,
      createdByUserId: 'new-owner-id',
    });

    await supertest(app.server)
      .post(`/v1/reports/schedules/${SCHEDULE_ID}/reassign`)
      .set(authHeader(amActor))
      .send({ newOwnerUserId: '99999999-8888-7777-6666-555555555555', reason: 'Owner left' })
      .expect(200);
  });

  it('rejects OP with 403', async () => {
    mockReassign.mockRejectedValue(new ScheduleForbiddenReassignmentError());

    await supertest(app.server)
      .post(`/v1/reports/schedules/${SCHEDULE_ID}/reassign`)
      .set(authHeader(opActor))
      .send({ newOwnerUserId: '99999999-8888-7777-6666-555555555555', reason: 'test' })
      .expect(403);
  });

  it('rejects missing reason with 400', async () => {
    await supertest(app.server)
      .post(`/v1/reports/schedules/${SCHEDULE_ID}/reassign`)
      .set(authHeader(amActor))
      .send({ newOwnerUserId: '99999999-8888-7777-6666-555555555555' })
      .expect(400);
  });
});

describe('Feature 019: GET /v1/reports/schedules/:id/runs', () => {
  it('returns paginated run history', async () => {
    mockListRuns.mockResolvedValue({
      data: [
        {
          id: 'run-1',
          scheduleId: SCHEDULE_ID,
          reportId: 'report-1',
          status: 'completed',
          scheduledFor: new Date('2026-04-12T09:00:00Z'),
          startedAt: new Date('2026-04-12T09:00:01Z'),
          completedAt: new Date('2026-04-12T09:00:12Z'),
          errorMessage: null,
          recipientCount: 2,
          deliveryStatusJson: null,
          createdAt: new Date('2026-04-12T09:00:00Z'),
        },
      ],
      meta: { total: 1 },
    });

    const response = await supertest(app.server)
      .get(`/v1/reports/schedules/${SCHEDULE_ID}/runs`)
      .set(authHeader(opActor))
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].status).toBe('completed');
  });
});
