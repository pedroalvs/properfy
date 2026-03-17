import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockGetMarketplaceOffersExecute = vi.fn();
const mockAcceptOfferExecute = vi.fn();
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
    serviceGroup: { jwtService: { verify: mockJwtVerify } },
    marketplace: {
      getMarketplaceOffersUseCase: { execute: mockGetMarketplaceOffersExecute },
      acceptOfferUseCase: { execute: mockAcceptOfferExecute },
      jwtService: { verify: mockJwtVerify },
    },
    tenantPortal: { jwtService: { verify: mockJwtVerify } },
    inspectorExecution: { jwtService: { verify: mockJwtVerify } },
    billing: { jwtService: { verify: mockJwtVerify } },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
    dashboard: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const inspContext = {
  userId: 'user-1',
  tenantId: null,
  role: 'INSP',
  branchId: null,
  inspectorId: 'insp-1',
};

const GROUP_ID = '00000000-0000-0000-0000-000000000001';

const fullOffer = {
  id: GROUP_ID,
  tenantId: '00000000-0000-0000-0000-000000000010',
  serviceTypeId: '00000000-0000-0000-0000-000000000020',
  status: 'PUBLISHED',
  groupSize: 5,
  offeredCount: 1,
  confirmedCount: 0,
  scheduledDate: '2026-04-01',
  timeWindow: '08:00-12:00',
  priorityMode: 'STANDARD',
  priorityExpiresAt: null,
  assignedInspectorId: null,
  publishedAt: new Date().toISOString(),
  assignedAt: null,
  createdByUserId: '00000000-0000-0000-0000-000000000030',
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

describe('GET /v1/marketplace/offers', () => {
  it('should return 200 with paginated marketplace offers', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockGetMarketplaceOffersExecute.mockResolvedValueOnce({
      data: [fullOffer],
      total: 1,
    });

    const res = await supertest(app.server)
      .get('/v1/marketplace/offers?page=1&pageSize=10')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(GROUP_ID);
    expect(res.body.pagination).toEqual({
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .get('/v1/marketplace/offers?page=1&pageSize=10');

    expect(res.status).toBe(401);
  });

  it('should pass inspectorId from authContext, not userId', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockGetMarketplaceOffersExecute.mockResolvedValueOnce({
      data: [fullOffer],
      total: 1,
    });

    await supertest(app.server)
      .get('/v1/marketplace/offers?page=1&pageSize=10')
      .set('Authorization', 'Bearer valid-token');

    expect(mockGetMarketplaceOffersExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        inspectorId: 'insp-1', // from authContext.inspectorId, NOT userId
      }),
    );
  });
});

describe('POST /v1/marketplace/offers/:groupId/accept', () => {
  it('should return 200 with accepted offer', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockAcceptOfferExecute.mockResolvedValueOnce(fullOffer);

    const res = await supertest(app.server)
      .post(`/v1/marketplace/offers/${GROUP_ID}/accept`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(fullOffer);
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .post(`/v1/marketplace/offers/${GROUP_ID}/accept`);

    expect(res.status).toBe(401);
  });

  it('should pass groupId and inspectorId from authContext, not userId', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockAcceptOfferExecute.mockResolvedValueOnce(fullOffer);

    await supertest(app.server)
      .post(`/v1/marketplace/offers/${GROUP_ID}/accept`)
      .set('Authorization', 'Bearer valid-token');

    expect(mockAcceptOfferExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: GROUP_ID,
        inspectorId: 'insp-1', // from authContext.inspectorId, NOT userId
      }),
    );
  });
});
