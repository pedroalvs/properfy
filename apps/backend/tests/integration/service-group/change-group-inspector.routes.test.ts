import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import {
  ServiceGroupInvalidStatusError,
  ServiceGroupNotFoundError,
  InspectorIneligibleError,
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
        changeGroupInspectorUseCase: { execute: mockExecute },
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
const INSPECTOR_ID = '00000000-0000-0000-0000-000000000003';
const PATH = `/v1/service-groups/${GROUP_ID}/reassign-inspector`;
const BODY = { inspectorId: INSPECTOR_ID, reason: 'Original inspector unavailable' };

const contextFor = (role: string, tenantId: string | null = null) => ({
  userId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10',
  tenantId,
  role,
  branchId: null,
  inspectorId: null,
});

const OUTPUT = {
  id: GROUP_ID,
  status: 'ACCEPTED',
  assignedInspectorId: INSPECTOR_ID,
  previousInspectorId: '00000000-0000-0000-0000-000000000004',
  appointmentsReassigned: 3,
  appointmentsScheduled: 0,
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

describe('POST /v1/service-groups/:groupId/reassign-inspector', () => {
  it('returns the reassignment summary for an AM actor', async () => {
    mockJwtVerify.mockResolvedValueOnce(contextFor('AM'));
    mockExecute.mockResolvedValueOnce(OUTPUT);

    const res = await supertest(app.server)
      .post(PATH)
      .set('Authorization', 'Bearer valid-token')
      .send(BODY);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      assignedInspectorId: INSPECTOR_ID,
      previousInspectorId: OUTPUT.previousInspectorId,
      appointmentsReassigned: 3,
    });
  });

  it('passes an Idempotency-Key header through to the use case', async () => {
    mockJwtVerify.mockResolvedValueOnce(contextFor('OP', 'tenant-1'));
    mockExecute.mockResolvedValueOnce(OUTPUT);

    await supertest(app.server)
      .post(PATH)
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', 'key-123')
      .send(BODY);

    expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'key-123' }));
  });

  it('leaves idempotencyKey undefined when the header is absent', async () => {
    mockJwtVerify.mockResolvedValueOnce(contextFor('AM'));
    mockExecute.mockResolvedValueOnce(OUTPUT);

    await supertest(app.server).post(PATH).set('Authorization', 'Bearer valid-token').send(BODY);

    expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: undefined }));
  });

  it('requires authentication', async () => {
    const res = await supertest(app.server).post(PATH).send(BODY);
    expect(res.status).toBe(401);
  });

  it.each(['CL_ADMIN', 'INSP'])('rejects %s actors with 403', async (role) => {
    mockJwtVerify.mockResolvedValueOnce(contextFor(role, 'tenant-1'));

    const res = await supertest(app.server)
      .post(PATH)
      .set('Authorization', 'Bearer valid-token')
      .send(BODY);

    expect(res.status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('rejects a missing reason — replacing an inspector needs a rationale', async () => {
    mockJwtVerify.mockResolvedValueOnce(contextFor('AM'));

    const res = await supertest(app.server)
      .post(PATH)
      .set('Authorization', 'Bearer valid-token')
      .send({ inspectorId: INSPECTOR_ID });

    expect(res.status).toBe(400);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid inspectorId', async () => {
    mockJwtVerify.mockResolvedValueOnce(contextFor('AM'));

    const res = await supertest(app.server)
      .post(PATH)
      .set('Authorization', 'Bearer valid-token')
      .send({ inspectorId: 'not-a-uuid', reason: 'because' });

    expect(res.status).toBe(400);
  });

  it('maps a closed group to 422', async () => {
    mockJwtVerify.mockResolvedValueOnce(contextFor('AM'));
    mockExecute.mockRejectedValueOnce(
      new ServiceGroupInvalidStatusError('DRAFT, PUBLISHED or ACCEPTED', 'CANCELLED'),
    );

    const res = await supertest(app.server)
      .post(PATH)
      .set('Authorization', 'Bearer valid-token')
      .send(BODY);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SERVICE_GROUP_INVALID_STATUS');
  });

  it('maps an ineligible inspector to 422', async () => {
    mockJwtVerify.mockResolvedValueOnce(contextFor('AM'));
    mockExecute.mockRejectedValueOnce(new InspectorIneligibleError());

    const res = await supertest(app.server)
      .post(PATH)
      .set('Authorization', 'Bearer valid-token')
      .send(BODY);

    expect(res.status).toBe(422);
  });

  it('maps an unknown group to 404', async () => {
    mockJwtVerify.mockResolvedValueOnce(contextFor('AM'));
    mockExecute.mockRejectedValueOnce(new ServiceGroupNotFoundError());

    const res = await supertest(app.server)
      .post(PATH)
      .set('Authorization', 'Bearer valid-token')
      .send(BODY);

    expect(res.status).toBe(404);
  });
});
