import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockCreatePricingRuleExecute = vi.fn();
const mockListPricingRulesExecute = vi.fn();
const mockUpdatePricingRuleExecute = vi.fn();
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
    pricingRule: {
      createPricingRuleUseCase: { execute: mockCreatePricingRuleExecute },
      listPricingRulesUseCase: { execute: mockListPricingRulesExecute },
      updatePricingRuleUseCase: { execute: mockUpdatePricingRuleExecute },
      jwtService: { verify: mockJwtVerify },
    },
    inspector: { jwtService: { verify: mockJwtVerify } },
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

const TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const SERVICE_TYPE_ID = 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';
const PRICING_RULE_ID = 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55';

const amContext = { userId: 'admin-1', tenantId: null, role: 'AM', branchId: null };

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(() => { vi.clearAllMocks(); });

const fullPricingRule = {
  id: PRICING_RULE_ID,
  tenantId: TENANT_ID,
  serviceTypeId: SERVICE_TYPE_ID,
  branchId: null,
  priceAmount: 150.0,
  payoutType: 'FIXED',
  payoutValue: 100.0,
  bonusRuleJson: null,
  status: 'ACTIVE',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('POST /v1/pricing-rules', () => {
  it('should return 201 with valid payload', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockCreatePricingRuleExecute.mockResolvedValueOnce(fullPricingRule);

    const res = await supertest(app.server)
      .post('/v1/pricing-rules')
      .set('Authorization', 'Bearer valid-token')
      .send({
        tenantId: TENANT_ID,
        serviceTypeId: SERVICE_TYPE_ID,
        priceAmount: 150.0,
        payoutType: 'FIXED',
        payoutValue: 100.0,
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.priceAmount).toBe(150.0);
  });

  it('should return 422 with invalid payload (missing serviceTypeId)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post('/v1/pricing-rules')
      .set('Authorization', 'Bearer valid-token')
      .send({
        priceAmount: 150.0,
        payoutType: 'FIXED',
        payoutValue: 100.0,
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /v1/pricing-rules', () => {
  it('should return 200 with paginated response', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockListPricingRulesExecute.mockResolvedValueOnce({
      data: [fullPricingRule],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get('/v1/pricing-rules')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.data).toHaveLength(1);
  });
});

describe('PATCH /v1/pricing-rules/:pricingRuleId', () => {
  it('should return 200 on successful update', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUpdatePricingRuleExecute.mockResolvedValueOnce({
      ...fullPricingRule,
      priceAmount: 175.0,
      payoutValue: 120.0,
    });

    const res = await supertest(app.server)
      .patch(`/v1/pricing-rules/${PRICING_RULE_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .send({ priceAmount: 175.0, payoutValue: 120.0 });

    expect(res.status).toBe(200);
    expect(res.body.data.priceAmount).toBe(175.0);
  });
});
