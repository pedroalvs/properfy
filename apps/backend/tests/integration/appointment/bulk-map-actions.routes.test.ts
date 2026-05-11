/**
 * 025 §FR-411..441 — POST /v1/appointments/bulk-{cancel,reschedule,
 * status-transition,assign-inspector} route contracts.
 *
 * Wire-shape tests only: the per-item idempotency + state-machine
 * semantics live in the unit tests for each use case. This file pins
 * (a) the canonical `{ data: { results: [...] } }` envelope, (b) the
 * RBAC gates at the route layer (defence in depth), and (c) Zod-driven
 * validation rejecting malformed payloads.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockBulkCancelExecute = vi.fn();
const mockBulkRescheduleExecute = vi.fn();
const mockBulkStatusTransitionExecute = vi.fn();
const mockBulkAssignInspectorExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    appointment: {
      bulkCancelAppointmentsUseCase: { execute: mockBulkCancelExecute },
      bulkRescheduleAppointmentsUseCase: { execute: mockBulkRescheduleExecute },
      bulkStatusTransitionUseCase: { execute: mockBulkStatusTransitionExecute },
      bulkAssignInspectorUseCase: { execute: mockBulkAssignInspectorExecute },
      jwtService: { verify: mockJwtVerify },
      tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true, settingsJson: {} }) },
    },
  }),
}));

const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const APPT_ID_1 = 'aaaaaaaa-0000-4000-8000-000000000010';
const APPT_ID_2 = 'aaaaaaaa-0000-4000-8000-000000000011';
const INSPECTOR_ID = 'cccccccc-0000-4000-8000-000000001111';

const amContext = { userId: 'admin-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const opContext = { userId: 'op-1', tenantId: null, role: 'OP', branchId: null, inspectorId: null };
const clAdminContext = { userId: 'cl-a', tenantId: TENANT_A, role: 'CL_ADMIN', branchId: null, inspectorId: null };
const clUserContext = { userId: 'cl-u', tenantId: TENANT_A, role: 'CL_USER', branchId: null, inspectorId: null };
const inspContext = { userId: 'insp-1', tenantId: null, role: 'INSP', branchId: null, inspectorId: 'i-1' };

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
  mockBulkCancelExecute.mockReset();
  mockBulkRescheduleExecute.mockReset();
  mockBulkStatusTransitionExecute.mockReset();
  mockBulkAssignInspectorExecute.mockReset();
});

describe('POST /v1/appointments/bulk-cancel', () => {
  it('returns the canonical { data: { results } } envelope on success', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    mockBulkCancelExecute.mockResolvedValue({
      results: [
        { appointmentId: APPT_ID_1, status: 'OK' },
        { appointmentId: APPT_ID_2, status: 'INVALID_TRANSITION' },
      ],
    });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-cancel')
      .set('Authorization', 'Bearer token')
      .send({ appointmentIds: [APPT_ID_1, APPT_ID_2], reason: 'tenant unavailable' });

    expect(res.status).toBe(200);
    expect(res.body.data.results).toHaveLength(2);
    expect(res.body.data.results[0]).toEqual({ appointmentId: APPT_ID_1, status: 'OK' });
  });

  it('forwards reason and actorTimezone to the use case', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    mockBulkCancelExecute.mockResolvedValue({ results: [] });

    await supertest(app.server)
      .post('/v1/appointments/bulk-cancel')
      .set('Authorization', 'Bearer token')
      .send({
        appointmentIds: [APPT_ID_1],
        reason: 'Operator cancelled',
        actorTimezone: 'Australia/Sydney',
      });

    expect(mockBulkCancelExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentIds: [APPT_ID_1],
        reason: 'Operator cancelled',
        actorTimezone: 'Australia/Sydney',
      }),
    );
  });

  it('allows CL_ADMIN (CL_USER gating is enforced inside the underlying use case)', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockBulkCancelExecute.mockResolvedValue({ results: [] });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-cancel')
      .set('Authorization', 'Bearer token')
      .send({ appointmentIds: [APPT_ID_1], reason: 'cancel' });

    expect(res.status).toBe(200);
  });

  it('rejects INSP with 403', async () => {
    mockJwtVerify.mockResolvedValue(inspContext);

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-cancel')
      .set('Authorization', 'Bearer token')
      .send({ appointmentIds: [APPT_ID_1], reason: 'cancel' });

    expect(res.status).toBe(403);
    expect(mockBulkCancelExecute).not.toHaveBeenCalled();
  });

  it('rejects empty appointmentIds via Zod (400)', async () => {
    mockJwtVerify.mockResolvedValue(opContext);

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-cancel')
      .set('Authorization', 'Bearer token')
      .send({ appointmentIds: [], reason: 'x' });

    expect(res.status).toBe(400);
    expect(mockBulkCancelExecute).not.toHaveBeenCalled();
  });
});

describe('POST /v1/appointments/bulk-reschedule', () => {
  it('returns the canonical envelope and forwards newDate + newTimeSlot', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockBulkRescheduleExecute.mockResolvedValue({
      results: [{ appointmentId: APPT_ID_1, status: 'OK' }],
    });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-reschedule')
      .set('Authorization', 'Bearer token')
      .send({
        appointmentIds: [APPT_ID_1],
        newDate: '2026-06-01',
        newTimeSlot: '09:00-10:00',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.results).toEqual([{ appointmentId: APPT_ID_1, status: 'OK' }]);
    expect(mockBulkRescheduleExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentIds: [APPT_ID_1],
        newDate: '2026-06-01',
        newTimeSlot: '09:00-10:00',
      }),
    );
  });

  it('allows CL_USER (flag check is enforced by UpdateAppointment)', async () => {
    mockJwtVerify.mockResolvedValue(clUserContext);
    mockBulkRescheduleExecute.mockResolvedValue({ results: [] });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-reschedule')
      .set('Authorization', 'Bearer token')
      .send({ appointmentIds: [APPT_ID_1], newDate: '2026-06-01' });

    expect(res.status).toBe(200);
  });

  it('rejects INSP with 403', async () => {
    mockJwtVerify.mockResolvedValue(inspContext);

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-reschedule')
      .set('Authorization', 'Bearer token')
      .send({ appointmentIds: [APPT_ID_1], newDate: '2026-06-01' });

    expect(res.status).toBe(403);
  });

  it('rejects malformed newTimeSlot via Zod', async () => {
    mockJwtVerify.mockResolvedValue(amContext);

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-reschedule')
      .set('Authorization', 'Bearer token')
      .send({ appointmentIds: [APPT_ID_1], newDate: '2026-06-01', newTimeSlot: '9-10' });

    expect(res.status).toBe(400);
  });
});

describe('POST /v1/appointments/bulk-status-transition', () => {
  it('forwards targetStatus + reason and returns the envelope', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    mockBulkStatusTransitionExecute.mockResolvedValue({
      results: [{ appointmentId: APPT_ID_1, status: 'OK' }],
    });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-status-transition')
      .set('Authorization', 'Bearer token')
      .send({
        appointmentIds: [APPT_ID_1],
        targetStatus: 'REJECTED',
        reason: 'Invalid property',
      });

    expect(res.status).toBe(200);
    expect(mockBulkStatusTransitionExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentIds: [APPT_ID_1],
        targetStatus: 'REJECTED',
        reason: 'Invalid property',
      }),
    );
  });

  it('rejects CL_ADMIN with 403 (AM/OP only)', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-status-transition')
      .set('Authorization', 'Bearer token')
      .send({ appointmentIds: [APPT_ID_1], targetStatus: 'DRAFT' });

    expect(res.status).toBe(403);
    expect(mockBulkStatusTransitionExecute).not.toHaveBeenCalled();
  });

  it('rejects unknown targetStatus via Zod', async () => {
    mockJwtVerify.mockResolvedValue(opContext);

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-status-transition')
      .set('Authorization', 'Bearer token')
      .send({ appointmentIds: [APPT_ID_1], targetStatus: 'FROZEN' });

    expect(res.status).toBe(400);
  });
});

describe('POST /v1/appointments/bulk-assign-inspector', () => {
  it('forwards inspectorId + appointmentIds and returns the envelope', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    mockBulkAssignInspectorExecute.mockResolvedValue({
      results: [
        { appointmentId: APPT_ID_1, status: 'OK' },
        { appointmentId: APPT_ID_2, status: 'FORBIDDEN', error: { code: 'INSPECTOR_NOT_ELIGIBLE', message: 'not eligible' } },
      ],
    });

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-assign-inspector')
      .set('Authorization', 'Bearer token')
      .send({ appointmentIds: [APPT_ID_1, APPT_ID_2], inspectorId: INSPECTOR_ID });

    expect(res.status).toBe(200);
    expect(res.body.data.results).toHaveLength(2);
    expect(mockBulkAssignInspectorExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentIds: [APPT_ID_1, APPT_ID_2],
        inspectorId: INSPECTOR_ID,
      }),
    );
  });

  it('rejects CL_ADMIN with 403 (AM/OP only)', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-assign-inspector')
      .set('Authorization', 'Bearer token')
      .send({ appointmentIds: [APPT_ID_1], inspectorId: INSPECTOR_ID });

    expect(res.status).toBe(403);
  });

  it('rejects non-uuid inspectorId via Zod', async () => {
    mockJwtVerify.mockResolvedValue(opContext);

    const res = await supertest(app.server)
      .post('/v1/appointments/bulk-assign-inspector')
      .set('Authorization', 'Bearer token')
      .send({ appointmentIds: [APPT_ID_1], inspectorId: 'not-a-uuid' });

    expect(res.status).toBe(400);
  });
});
