/**
 * QA-005-MEDIUM-001: PATCH /v1/service-groups/:id succeeds even when status=ACCEPTED.
 *
 * Root cause: UpdateServiceGroupUseCase has no guard against mutations on ACCEPTED groups.
 * The existing guard only blocks draft-only fields on non-DRAFT groups, but allows
 * general fields (name, description, etc.) to be mutated on ACCEPTED groups.
 *
 * Fix: add an immutability guard at the top of execute() that throws
 * ServiceGroupInvalidStatusError when the group is ACCEPTED.
 *
 * This test verifies:
 * 1. PATCH on an ACCEPTED group returns 422 with SERVICE_GROUP_INVALID_STATUS
 * 2. PATCH on a DRAFT group still returns 200 (regression guard)
 * 3. PATCH without auth returns 401
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import {
  ServiceGroupInvalidStatusError,
  ServiceGroupNotFoundError,
} from '../../../src/modules/service-group/domain/service-group.errors';

const mockUpdateServiceGroupExecute = vi.fn();
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
        updateServiceGroupUseCase: { execute: mockUpdateServiceGroupExecute },
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

const draftOutput = {
  id: GROUP_ID,
  tenantId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  serviceTypeId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
  status: 'DRAFT',
  groupSize: 5,
  offeredCount: 0,
  confirmedCount: 0,
  scheduledDate: new Date('2026-06-01'),
  timeWindow: '09:00-12:00',
  name: 'Updated name',
  regionName: null,
  description: null,
  assignedInspectorId: null,
  serviceRegionId: null,
  publishedAt: null,
  assignedAt: null,
  createdByUserId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10',
  createdAt: new Date(),
  updatedAt: new Date(),
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

describe('PATCH /v1/service-groups/:groupId — QA-005-MEDIUM-001 ACCEPTED immutability guard', () => {
  it('should return 422 with SERVICE_GROUP_INVALID_STATUS when patching an ACCEPTED group', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUpdateServiceGroupExecute.mockRejectedValueOnce(
      new ServiceGroupInvalidStatusError('DRAFT or PUBLISHED', 'ACCEPTED'),
    );

    const res = await supertest(app.server)
      .patch(`/v1/service-groups/${GROUP_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Attempt to mutate accepted group' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SERVICE_GROUP_INVALID_STATUS');
  });

  it('should return 200 when patching a DRAFT group (regression guard)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUpdateServiceGroupExecute.mockResolvedValueOnce(draftOutput);

    const res = await supertest(app.server)
      .patch(`/v1/service-groups/${GROUP_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Updated name' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DRAFT');
  });

  it('should return 401 without an auth token', async () => {
    const res = await supertest(app.server)
      .patch(`/v1/service-groups/${GROUP_ID}`)
      .send({ name: 'No auth attempt' });

    expect(res.status).toBe(401);
  });
});
