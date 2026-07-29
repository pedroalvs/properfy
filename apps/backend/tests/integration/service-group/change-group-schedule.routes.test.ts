import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import {
  ServiceGroupInvalidStatusError,
  ServiceGroupNotFoundError,
  ServiceGroupDateInPastError,
} from '../../../src/modules/service-group/domain/service-group.errors';

const mockExecute = vi.fn();
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
      serviceGroup: {
        changeGroupScheduleUseCase: { execute: mockExecute },
        jwtService: { verify: mockJwtVerify },
      },
      marketplace: { jwtService: { verify: mockJwtVerify } },
      rentalTenantPortal: { jwtService: { verify: mockJwtVerify } },
      inspectorExecution: { jwtService: { verify: mockJwtVerify } },
      billing: { jwtService: { verify: mockJwtVerify } },
      report: { jwtService: { verify: mockJwtVerify } },
      notification: { jwtService: { verify: mockJwtVerify } },
      serviceRegion: { jwtService: { verify: mockJwtVerify } },
      contact: { jwtService: { verify: mockJwtVerify } },
      appointmentTimeSlot: { jwtService: { verify: mockJwtVerify } },
      dashboard: { jwtService: { verify: mockJwtVerify } },
    } as any),
}));

const GROUP_ID = '00000000-0000-0000-0000-000000000002';
const PATH = `/v1/service-groups/${GROUP_ID}/schedule`;
const BODY = { scheduledDate: '2030-06-15', confirmationStrategy: 'NOTIFY_ONLY' };

const contextFor = (role: string, tenantId: string | null = null) => ({
  userId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10',
  tenantId,
  role,
  branchId: null,
  inspectorId: null,
});

const OUTPUT = {
  id: GROUP_ID,
  status: 'PUBLISHED',
  scheduledDate: '2030-06-15',
  timeWindow: '09:00-17:00',
  applied: {
    total: 3,
    dateChanged: 3,
    slotClamped: 0,
    failed: 0,
    confirmationsHandled: 2,
    confirmationStrategy: 'NOTIFY_ONLY',
  },
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
});

describe('POST /v1/service-groups/:groupId/schedule', () => {
  it('returns the applied counts for an AM actor', async () => {
    mockJwtVerify.mockResolvedValueOnce(contextFor('AM'));
    mockExecute.mockResolvedValueOnce(OUTPUT);

    const res = await supertest(app.server).post(PATH).set('Authorization', 'Bearer valid-token').send(BODY);

    expect(res.status).toBe(200);
    expect(res.body.data.applied).toMatchObject({ dateChanged: 3, confirmationStrategy: 'NOTIFY_ONLY' });
  });

  it('forwards a time-window-only change without a date', async () => {
    mockJwtVerify.mockResolvedValueOnce(contextFor('AM'));
    mockExecute.mockResolvedValueOnce(OUTPUT);

    await supertest(app.server)
      .post(PATH)
      .set('Authorization', 'Bearer valid-token')
      .send({ timeWindow: '08:00-12:00', confirmationStrategy: 'RESEND' });

    const call = mockExecute.mock.calls[0]![0];
    expect(call).toMatchObject({ timeWindow: '08:00-12:00', confirmationStrategy: 'RESEND' });
    expect(call).not.toHaveProperty('scheduledDate');
  });

  it('passes an Idempotency-Key header through', async () => {
    mockJwtVerify.mockResolvedValueOnce(contextFor('OP', 'tenant-1'));
    mockExecute.mockResolvedValueOnce(OUTPUT);

    await supertest(app.server)
      .post(PATH)
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', 'key-123')
      .send(BODY);

    expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'key-123' }));
  });

  it('requires authentication', async () => {
    const res = await supertest(app.server).post(PATH).send(BODY);
    expect(res.status).toBe(401);
  });

  it.each(['CL_ADMIN', 'INSP'])('rejects %s actors with 403', async (role) => {
    mockJwtVerify.mockResolvedValueOnce(contextFor(role, 'tenant-1'));

    const res = await supertest(app.server).post(PATH).set('Authorization', 'Bearer valid-token').send(BODY);

    expect(res.status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('rejects a body with neither a date nor a window', async () => {
    mockJwtVerify.mockResolvedValueOnce(contextFor('AM'));

    const res = await supertest(app.server)
      .post(PATH)
      .set('Authorization', 'Bearer valid-token')
      .send({ confirmationStrategy: 'RESEND' });

    expect(res.status).toBe(400);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('rejects a missing confirmationStrategy — the operator must choose', async () => {
    mockJwtVerify.mockResolvedValueOnce(contextFor('AM'));

    const res = await supertest(app.server)
      .post(PATH)
      .set('Authorization', 'Bearer valid-token')
      .send({ scheduledDate: '2030-06-15' });

    expect(res.status).toBe(400);
  });

  it('rejects an unknown confirmationStrategy', async () => {
    mockJwtVerify.mockResolvedValueOnce(contextFor('AM'));

    const res = await supertest(app.server)
      .post(PATH)
      .set('Authorization', 'Bearer valid-token')
      .send({ scheduledDate: '2030-06-15', confirmationStrategy: 'IGNORE' });

    expect(res.status).toBe(400);
  });

  it('maps a closed group to 422', async () => {
    mockJwtVerify.mockResolvedValueOnce(contextFor('AM'));
    mockExecute.mockRejectedValueOnce(new ServiceGroupInvalidStatusError('DRAFT, PUBLISHED or ACCEPTED', 'CANCELLED'));

    const res = await supertest(app.server).post(PATH).set('Authorization', 'Bearer valid-token').send(BODY);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SERVICE_GROUP_INVALID_STATUS');
  });

  it('maps a past date to 422', async () => {
    mockJwtVerify.mockResolvedValueOnce(contextFor('AM'));
    mockExecute.mockRejectedValueOnce(new ServiceGroupDateInPastError());

    const res = await supertest(app.server).post(PATH).set('Authorization', 'Bearer valid-token').send(BODY);

    expect(res.status).toBe(422);
  });

  it('maps an unknown group to 404', async () => {
    mockJwtVerify.mockResolvedValueOnce(contextFor('AM'));
    mockExecute.mockRejectedValueOnce(new ServiceGroupNotFoundError());

    const res = await supertest(app.server).post(PATH).set('Authorization', 'Bearer valid-token').send(BODY);

    expect(res.status).toBe(404);
  });
});
