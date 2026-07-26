import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockCreateServiceGroupExecute = vi.fn();
const mockGetServiceGroupExecute = vi.fn();
const mockListServiceGroupsExecute = vi.fn();
const mockPublishServiceGroupExecute = vi.fn();
const mockAssignInspectorManuallyExecute = vi.fn();
const mockCancelServiceGroupExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
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
      createServiceGroupUseCase: { execute: mockCreateServiceGroupExecute },
      getServiceGroupUseCase: { execute: mockGetServiceGroupExecute },
      listServiceGroupsUseCase: { execute: mockListServiceGroupsExecute },
      publishServiceGroupUseCase: { execute: mockPublishServiceGroupExecute },
      assignInspectorManuallyUseCase: { execute: mockAssignInspectorManuallyExecute },
      cancelServiceGroupUseCase: { execute: mockCancelServiceGroupExecute },
      jwtService: { verify: mockJwtVerify },
    },
    marketplace: { jwtService: { verify: mockJwtVerify } },
    rentalTenantPortal: { jwtService: { verify: mockJwtVerify } },
    inspectorExecution: { jwtService: { verify: mockJwtVerify } },
    billing: { jwtService: { verify: mockJwtVerify } },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
    dashboard: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const amContext = {
  userId: 'admin-1',
  tenantId: null,
  role: 'AM',
  branchId: null,
  inspectorId: null,
};

const GROUP_ID = '00000000-0000-0000-0000-000000000001';
const INSPECTOR_ID = '00000000-0000-0000-0000-000000000030';

const fullServiceGroup = {
  id: GROUP_ID,
  tenantId: '00000000-0000-0000-0000-000000000010',
  serviceTypeId: '00000000-0000-0000-0000-000000000020',
  status: 'DRAFT',
  groupSize: 5,
  offeredCount: 0,
  confirmedCount: 0,
  scheduledDate: '2026-04-01',
  timeWindow: '08:00-12:00',
  assignedInspectorId: null,
  publishedAt: null,
  assignedAt: null,
  createdByUserId: '00000000-0000-0000-0000-000000000040',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
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

// ---- POST /v1/service-groups ----

describe('POST /v1/service-groups', () => {
  const validPayload = {
    appointmentIds: [
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000102',
      '00000000-0000-0000-0000-000000000103',
      '00000000-0000-0000-0000-000000000104',
      '00000000-0000-0000-0000-000000000105',
    ],
    serviceTypeId: '00000000-0000-0000-0000-000000000020',
    scheduledDate: '2026-04-01',
    timeWindow: '08:00-12:00',
    serviceRegionId: '00000000-0000-0000-0000-000000000060',
  };

  it('should return 201 with valid payload', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockCreateServiceGroupExecute.mockResolvedValueOnce(fullServiceGroup);

    const res = await supertest(app.server)
      .post('/v1/service-groups')
      .set('Authorization', 'Bearer valid-token')
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id', GROUP_ID);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.groupSize).toBe(5);
    expect(mockCreateServiceGroupExecute).toHaveBeenCalledWith({
      ...validPayload,
      actor: amContext,
    });
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .post('/v1/service-groups')
      .send(validPayload);

    expect(res.status).toBe(401);
  });
});

// ---- GET /v1/service-groups ----

describe('GET /v1/service-groups', () => {
  it('should return 200 with paginated response', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockListServiceGroupsExecute.mockResolvedValueOnce({
      data: [fullServiceGroup],
      total: 1,
    });

    const res = await supertest(app.server)
      .get('/v1/service-groups?page=1&pageSize=10')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toEqual({
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .get('/v1/service-groups?page=1&pageSize=10');

    expect(res.status).toBe(401);
  });
});

// ---- GET /v1/service-groups/:groupId ----

describe('GET /v1/service-groups/:groupId', () => {
  it('should return 200 with valid group', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGetServiceGroupExecute.mockResolvedValueOnce(fullServiceGroup);

    const res = await supertest(app.server)
      .get(`/v1/service-groups/${GROUP_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(GROUP_ID);
    expect(res.body.data.scheduledDate).toBe('2026-04-01');
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .get(`/v1/service-groups/${GROUP_ID}`);

    expect(res.status).toBe(401);
  });
});

// ---- POST /v1/service-groups/:groupId/publish ----

describe('POST /v1/service-groups/:groupId/publish', () => {
  it('should return 200 on successful publish', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const publishedGroup = { ...fullServiceGroup, status: 'PUBLISHED', publishedAt: new Date().toISOString() };
    mockPublishServiceGroupExecute.mockResolvedValueOnce(publishedGroup);

    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/publish`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PUBLISHED');
    expect(res.body.data.publishedAt).toBeTruthy();
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/publish`);

    expect(res.status).toBe(401);
  });
});

// ---- POST /v1/service-groups/:groupId/assign ----

describe('POST /v1/service-groups/:groupId/assign', () => {
  it('should return 200 on successful assignment', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    // The use case returns a narrowed AssignInspectorManuallyOutput, not the
    // full group — the response schema must accept exactly this shape.
    mockAssignInspectorManuallyExecute.mockResolvedValueOnce({
      id: GROUP_ID,
      status: 'ACCEPTED',
      assignedInspectorId: INSPECTOR_ID,
      appointmentsScheduled: 3,
    });

    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/assign`)
      .set('Authorization', 'Bearer valid-token')
      .send({ inspectorId: INSPECTOR_ID });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: GROUP_ID,
      status: 'ACCEPTED',
      assignedInspectorId: INSPECTOR_ID,
      appointmentsScheduled: 3,
    });
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/assign`)
      .send({ inspectorId: INSPECTOR_ID });

    expect(res.status).toBe(401);
  });
});

// ---- POST /v1/service-groups/:groupId/cancel ----

describe('POST /v1/service-groups/:groupId/cancel', () => {
  it('should return 200 on successful cancellation', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const cancelledGroup = { ...fullServiceGroup, status: 'CANCELLED' };
    mockCancelServiceGroupExecute.mockResolvedValueOnce(cancelledGroup);

    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/cancel`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'Client requested cancellation' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .post(`/v1/service-groups/${GROUP_ID}/cancel`)
      .send({ reason: 'Client requested cancellation' });

    expect(res.status).toBe(401);
  });
});
