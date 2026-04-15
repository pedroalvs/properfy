import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockListInspectorsExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockAuditLog = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auditService: { log: mockAuditLog } as any,
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: { jwtService: { verify: mockJwtVerify } },
    user: { jwtService: { verify: mockJwtVerify } },
    property: { jwtService: { verify: mockJwtVerify } },
    serviceType: { jwtService: { verify: mockJwtVerify } },
    pricingRule: { jwtService: { verify: mockJwtVerify } },
    inspector: {
      listInspectorsUseCase: { execute: mockListInspectorsExecute },
      jwtService: { verify: mockJwtVerify },
    },
    appointment: { jwtService: { verify: mockJwtVerify } },
    audit: { jwtService: { verify: mockJwtVerify } },
    serviceGroup: { jwtService: { verify: mockJwtVerify } },
    marketplace: { jwtService: { verify: mockJwtVerify } },
    tenantPortal: { jwtService: { verify: mockJwtVerify } },
    inspectorExecution: { jwtService: { verify: mockJwtVerify } },
    billing: { jwtService: { verify: mockJwtVerify } },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const opContext = { userId: 'op-1', tenantId: 'tenant-1', role: 'OP', branchId: null, inspectorId: null };

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(() => { vi.clearAllMocks(); });

const now = new Date().toISOString();

const eligibleInspector = {
  id: 'f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
  name: 'Eligible Inspector',
  email: 'eligible@inspect.com',
  phone: null,
  status: 'ACTIVE',
  regionIds: [],
  serviceTypesJson: [],
  createdAt: now,
  updatedAt: now,
};

const unblockedInspector = {
  id: 'f2eebc99-9c0b-4ef8-bb6d-6bb9bd380a02',
  name: 'Unblocked Inspector',
  email: 'unblocked@inspect.com',
  phone: null,
  status: 'ACTIVE',
  regionIds: [],
  serviceTypesJson: [],
  createdAt: now,
  updatedAt: now,
};

describe('GET /v1/inspectors — blocked-clients OP tenant scoping', () => {
  it('should return only inspectors NOT blocked from the OP tenant', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockListInspectorsExecute.mockResolvedValueOnce({
      data: [eligibleInspector],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get('/v1/inspectors')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Eligible Inspector');
  });

  it('should include inspector with empty blockedClients (eligible for all)', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockListInspectorsExecute.mockResolvedValueOnce({
      data: [eligibleInspector, unblockedInspector],
      total: 2,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get('/v1/inspectors')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('should return empty list when all inspectors are blocked from OP tenant', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockListInspectorsExecute.mockResolvedValueOnce({
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get('/v1/inspectors')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });
});
