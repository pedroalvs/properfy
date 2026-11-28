import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockFindMoveTargetsExecute = vi.fn();
const mockMoveAppointmentsExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    serviceGroup: {
      findMoveTargetGroupsForAppointmentsUseCase: { execute: mockFindMoveTargetsExecute },
      moveAppointmentsToGroupUseCase: { execute: mockMoveAppointmentsExecute },
      jwtService: { verify: mockJwtVerify },
    },
  }),
}));

const GROUP_ID = '00000000-0000-0000-0000-000000000001';
const APPT_ID = '00000000-0000-0000-0000-000000000002';

const amContext = { userId: 'admin-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const clContext = { userId: 'cl-1', tenantId: 't-1', role: 'CL_ADMIN', branchId: null, inspectorId: null };

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
});

describe('POST /v1/service-groups/find-move-targets-for-appointments', () => {
  it('returns move targets for an AM', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockFindMoveTargetsExecute.mockResolvedValue({
      groups: [
        { id: GROUP_ID, groupNumber: 1, code: '1', status: 'PUBLISHED', scheduledDate: new Date('2026-08-10T00:00:00Z'), timeWindow: '08:00-12:00', currentSize: 2, serviceTypeName: 'Routine', isCurrentDay: true },
      ],
    });

    const res = await supertest(app.server)
      .post('/v1/service-groups/find-move-targets-for-appointments')
      .set('Authorization', 'Bearer t')
      .send({ appointmentIds: [APPT_ID] });

    expect(res.status).toBe(200);
    expect(res.body.data.groups).toHaveLength(1);
    expect(res.body.data.groups[0].isCurrentDay).toBe(true);
    expect(res.body.data.groups[0].scheduledDate).toBe('2026-08-10');
  });

  it('forbids a CL role', async () => {
    mockJwtVerify.mockResolvedValue(clContext);
    const res = await supertest(app.server)
      .post('/v1/service-groups/find-move-targets-for-appointments')
      .set('Authorization', 'Bearer t')
      .send({ appointmentIds: [APPT_ID] });
    expect(res.status).toBe(403);
    expect(mockFindMoveTargetsExecute).not.toHaveBeenCalled();
  });
});

describe('POST /v1/service-groups/:groupId/move-appointments', () => {
  it('moves appointments for an AM and threads the Idempotency-Key', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockMoveAppointmentsExecute.mockResolvedValue({
      results: [{ appointmentId: APPT_ID, status: 'OK' }],
      movedCount: 1,
    });

    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/move-appointments`)
      .set('Authorization', 'Bearer t')
      .set('Idempotency-Key', 'key-123')
      .send({ appointmentIds: [APPT_ID] });

    expect(res.status).toBe(200);
    expect(res.body.data.movedCount).toBe(1);
    expect(mockMoveAppointmentsExecute).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: GROUP_ID, appointmentIds: [APPT_ID], idempotencyKey: 'key-123' }),
    );
  });

  it('forbids a CL role', async () => {
    mockJwtVerify.mockResolvedValue(clContext);
    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/move-appointments`)
      .set('Authorization', 'Bearer t')
      .send({ appointmentIds: [APPT_ID] });
    expect(res.status).toBe(403);
    expect(mockMoveAppointmentsExecute).not.toHaveBeenCalled();
  });

  it('rejects an invalid payload', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/move-appointments`)
      .set('Authorization', 'Bearer t')
      .send({ appointmentIds: [] });
    expect(res.status).toBe(400);
  });
});
