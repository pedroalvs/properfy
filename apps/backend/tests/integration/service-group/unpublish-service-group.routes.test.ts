/**
 * POST /v1/service-groups/:groupId/unpublish — HTTP contract.
 *
 * The 200 case is not ceremony: this route family has shipped 500s twice when a
 * response schema promised more fields than the use case returns, and Fastify's
 * serializer only rejects the payload at send time. Asserting the body here is
 * what proves the declared schema matches `{ id, status }`.
 *
 * Body validation runs BEFORE authentication in this app, so the 401 case must
 * still send a valid body — otherwise it comes back 400 and proves nothing.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import {
  ServiceGroupNotFoundError,
  ServiceGroupInvalidStatusError,
  GroupAlreadyAcceptedError,
} from '../../../src/modules/service-group/domain/service-group.errors';

const mockUnpublishServiceGroupExecute = vi.fn();
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
        unpublishServiceGroupUseCase: { execute: mockUnpublishServiceGroupExecute },
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

const GROUP_ID = '00000000-0000-0000-0000-000000000001';

const amContext = {
  userId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10',
  tenantId: null,
  role: 'AM',
  branchId: null,
  inspectorId: null,
};

const VALID_BODY = { reason: 'Wrong time window, fixing before re-offering' };

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

describe('POST /v1/service-groups/:groupId/unpublish', () => {
  it('should return 200 with { id, status } when AM unpublishes a PUBLISHED group', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUnpublishServiceGroupExecute.mockResolvedValueOnce({ id: GROUP_ID, status: 'DRAFT' });

    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/unpublish`)
      .set('Authorization', 'Bearer valid-token')
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: GROUP_ID, status: 'DRAFT' });
    expect(mockUnpublishServiceGroupExecute).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: GROUP_ID, reason: VALID_BODY.reason }),
    );
  });

  it('should return 400 when the reason is missing', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/unpublish`)
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(400);
    expect(mockUnpublishServiceGroupExecute).not.toHaveBeenCalled();
  });

  it('should return 400 when the reason is empty', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/unpublish`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: '' });

    expect(res.status).toBe(400);
    expect(mockUnpublishServiceGroupExecute).not.toHaveBeenCalled();
  });

  it('should return 400 for a malformed group id', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post('/v1/service-groups/not-a-uuid/unpublish')
      .set('Authorization', 'Bearer valid-token')
      .send(VALID_BODY);

    expect(res.status).toBe(400);
    expect(mockUnpublishServiceGroupExecute).not.toHaveBeenCalled();
  });

  it('should return 422 when the group is not PUBLISHED', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUnpublishServiceGroupExecute.mockRejectedValueOnce(
      new ServiceGroupInvalidStatusError('PUBLISHED', 'ACCEPTED'),
    );

    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/unpublish`)
      .set('Authorization', 'Bearer valid-token')
      .send(VALID_BODY);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SERVICE_GROUP_INVALID_STATUS');
  });

  it('should return 409 when an inspector accepted the group first', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUnpublishServiceGroupExecute.mockRejectedValueOnce(new GroupAlreadyAcceptedError());

    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/unpublish`)
      .set('Authorization', 'Bearer valid-token')
      .send(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('GROUP_ALREADY_ACCEPTED');
  });

  it('should return 404 when the group does not exist', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUnpublishServiceGroupExecute.mockRejectedValueOnce(new ServiceGroupNotFoundError());

    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/unpublish`)
      .set('Authorization', 'Bearer valid-token')
      .send(VALID_BODY);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SERVICE_GROUP_NOT_FOUND');
  });

  it('should return 401 without an auth token', async () => {
    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/unpublish`)
      .send(VALID_BODY);

    expect(res.status).toBe(401);
    expect(mockUnpublishServiceGroupExecute).not.toHaveBeenCalled();
  });
});
