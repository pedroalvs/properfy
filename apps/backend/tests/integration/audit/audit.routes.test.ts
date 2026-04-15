import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockListAuditLogsExecute = vi.fn();
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
    audit: {
      listAuditLogsUseCase: { execute: mockListAuditLogsExecute },
      jwtService: { verify: mockJwtVerify },
    },
    serviceGroup: { jwtService: { verify: mockJwtVerify } },
    marketplace: { jwtService: { verify: mockJwtVerify } },
    tenantPortal: { jwtService: { verify: mockJwtVerify } },
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

const fullAuditLog = {
  id: '00000000-0000-0000-0000-000000000001',
  tenantId: '00000000-0000-0000-0000-000000000010',
  actorType: 'USER',
  actorId: 'admin-1',
  actorName: 'Admin User',
  entityType: 'APPOINTMENT',
  entityId: '00000000-0000-0000-0000-000000000020',
  action: 'STATUS_TRANSITION',
  reason: null,
  beforeJson: null,
  afterJson: null,
  requestId: 'req-123',
  ipAddress: '127.0.0.1',
  metadataJson: null,
  createdAt: new Date().toISOString(),
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

describe('GET /v1/audit-logs', () => {
  it('should return 200 with paginated audit logs', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockListAuditLogsExecute.mockResolvedValueOnce({
      data: [fullAuditLog],
      total: 1,
    });

    const res = await supertest(app.server)
      .get('/v1/audit-logs?page=1&pageSize=10')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([fullAuditLog]);
    expect(res.body.pagination).toEqual({
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .get('/v1/audit-logs?page=1&pageSize=10');

    expect(res.status).toBe(401);
  });

  it('should pass query params correctly to use case', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockListAuditLogsExecute.mockResolvedValueOnce({
      data: [fullAuditLog],
      total: 1,
    });

    await supertest(app.server)
      .get('/v1/audit-logs?page=1&pageSize=10&entityType=APPOINTMENT&action=STATUS_TRANSITION')
      .set('Authorization', 'Bearer valid-token');

    expect(mockListAuditLogsExecute).toHaveBeenCalledWith({
      filters: { entityType: 'APPOINTMENT', action: 'STATUS_TRANSITION', includeArchived: false },
      pagination: { page: 1, pageSize: 10, sortBy: undefined, sortOrder: 'desc' },
      actor: amContext,
    });
  });
});
