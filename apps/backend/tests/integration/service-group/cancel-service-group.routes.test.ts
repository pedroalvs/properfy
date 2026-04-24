/**
 * QA-005-HIGH-001: POST /v1/service-groups/:id/cancel returns 500.
 *
 * Root cause: the cancel route declared response: { 200: successResponseSchema(serviceGroupResponseSchema) }
 * but CancelServiceGroupUseCase returns only { id: string; status: string }. Fastify's fast-json-stringify
 * serializer rejects the incomplete object → 500.
 *
 * Fix: align the cancel route response schema to match the use-case output:
 *   successResponseSchema(z.object({ id: z.string().uuid(), status: z.string() }))
 *
 * This test verifies:
 * 1. AM can cancel a DRAFT group → returns 200 with { id, status: 'CANCELLED' } (not 500)
 * 2. Cancel a non-existent group → returns 404 SERVICE_GROUP_NOT_FOUND
 * 3. Cancel without auth → returns 401
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { ServiceGroupNotFoundError } from '../../../src/modules/service-group/domain/service-group.errors';

const mockCancelServiceGroupExecute = vi.fn();
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
        cancelServiceGroupUseCase: { execute: mockCancelServiceGroupExecute },
        jwtService: { verify: mockJwtVerify },
      },
      marketplace: { jwtService: { verify: mockJwtVerify } },
      tenantPortal: { jwtService: { verify: mockJwtVerify } },
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

/** Minimal output that CancelServiceGroupUseCase actually returns */
const cancelledOutput = {
  id: GROUP_ID,
  status: 'CANCELLED',
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

describe('POST /v1/service-groups/:groupId/cancel — QA-005-HIGH-001', () => {
  it('should return 200 with { id, status } when AM cancels a DRAFT group', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockCancelServiceGroupExecute.mockResolvedValueOnce(cancelledOutput);

    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/cancel`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'Client requested cancellation' });

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(GROUP_ID);
    expect(res.body.data.status).toBe('CANCELLED');
  });

  it('should return 404 when the group does not exist', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockCancelServiceGroupExecute.mockRejectedValueOnce(new ServiceGroupNotFoundError());

    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/cancel`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'Client requested cancellation' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SERVICE_GROUP_NOT_FOUND');
  });

  it('should return 401 without an auth token', async () => {
    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/cancel`)
      .send({ reason: 'Client requested cancellation' });

    expect(res.status).toBe(401);
  });
});
