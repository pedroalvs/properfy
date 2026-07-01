/**
 * QA-005-HIGH-002: POST /v1/service-groups/:id/reject and /republish return 500.
 *
 * Root cause: both handlers declared response: { 200: successResponseSchema(serviceGroupResponseSchema) }
 * but the use cases return only { id: string; status: string }. Fastify's fast-json-stringify
 * serializer rejects the incomplete object → 500.
 *
 * Fix: align both route response schemas to the minimal use-case output:
 *   successResponseSchema(z.object({ id: z.string().uuid(), status: z.string() }))
 *
 * This test verifies reject and republish return 200 with the correct body (not 500).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { ServiceGroupNotFoundError } from '../../../src/modules/service-group/domain/service-group.errors';

const mockRejectServiceGroupExecute = vi.fn();
const mockRepublishServiceGroupExecute = vi.fn();
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
        rejectServiceGroupUseCase: { execute: mockRejectServiceGroupExecute },
        republishServiceGroupUseCase: { execute: mockRepublishServiceGroupExecute },
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

const amContext = {
  userId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10',
  tenantId: null,
  role: 'AM',
  branchId: null,
  inspectorId: null,
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

describe('POST /v1/service-groups/:groupId/reject — QA-005-HIGH-002', () => {
  it('returns 200 with { id, status } instead of 500 (schema mismatch fix)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockRejectServiceGroupExecute.mockResolvedValueOnce({ id: GROUP_ID, status: 'REJECTED' });

    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/reject`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'Duplicate group, rejecting' });

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(GROUP_ID);
    expect(res.body.data.status).toBe('REJECTED');
  });

  it('returns 404 when the group does not exist', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockRejectServiceGroupExecute.mockRejectedValueOnce(new ServiceGroupNotFoundError());

    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/reject`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'Rejecting' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SERVICE_GROUP_NOT_FOUND');
  });

  it('returns 401 without auth token', async () => {
    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/reject`)
      .send({ reason: 'Rejecting' });

    expect(res.status).toBe(401);
  });
});

describe('POST /v1/service-groups/:groupId/republish — QA-005-HIGH-002', () => {
  it('returns 200 with { id, status } instead of 500 (schema mismatch fix)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockRepublishServiceGroupExecute.mockResolvedValueOnce({ id: GROUP_ID, status: 'DRAFT' });

    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/republish`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'Client requested republish' });

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(GROUP_ID);
    expect(res.body.data.status).toBe('DRAFT');
  });

  it('returns 404 when the group does not exist', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockRepublishServiceGroupExecute.mockRejectedValueOnce(new ServiceGroupNotFoundError());

    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/republish`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'Republishing' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SERVICE_GROUP_NOT_FOUND');
  });

  it('returns 401 without auth token', async () => {
    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/republish`)
      .send({});

    expect(res.status).toBe(401);
  });
});
