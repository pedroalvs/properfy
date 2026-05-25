import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockGetMarketplaceOfferDetailExecute = vi.fn();
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
      getMarketplaceOfferDetailUseCase: { execute: mockGetMarketplaceOfferDetailExecute },
      getMarketplaceOffersUseCase: { execute: vi.fn() },
      acceptOfferUseCase: { execute: vi.fn() },
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

const GROUP_ID = '00000000-0000-0000-0000-000000000002';

const mockOfferDetail = {
  groupId: GROUP_ID,
  tenantId: 'tenant-1',
  tenantName: 'Properfy Realty',
  serviceTypeName: 'Routine Inspection',
  groupSize: 2,
  scheduledDate: new Date('2026-06-01'),
  timeWindow: '08:00-13:00',
  priorityMode: 'STANDARD',
  priorityExpiresAt: null,
  suburbs: ['Bondi', 'Manly'],
  payoutEstimate: 300,
  appointmentCount: 2,
  centroid: null,
  addresses: ['123 Ocean St, Bondi NSW', '45 Beach Rd, Manly NSW'],
  keyRequired: false,
  notes: null,
  appointments: [
    {
      id: '00000000-0000-0000-0000-000000000011',
      appointmentNumber: 1001,
      suburb: 'Bondi NSW',
      keyRequired: false,
      notes: null,
      payoutAmount: 150,
    },
    {
      id: '00000000-0000-0000-0000-000000000012',
      appointmentNumber: 1002,
      suburb: 'Manly NSW',
      keyRequired: false,
      notes: null,
      payoutAmount: 150,
    },
  ],
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

describe('GET /v1/marketplace/offers/:groupId (detail — suburb rename)', () => {
  it('should return appointments[].suburb in "Suburb STATE" format and no address field', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockGetMarketplaceOfferDetailExecute.mockResolvedValueOnce(mockOfferDetail);

    const res = await supertest(app.server)
      .get(`/v1/marketplace/offers/${GROUP_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    const appointments = res.body.data?.appointments as Array<Record<string, unknown>>;
    expect(appointments).toBeDefined();
    expect(appointments.length).toBeGreaterThan(0);

    const first = appointments[0];
    expect(first).toHaveProperty('suburb');
    expect(typeof first['suburb']).toBe('string');
    expect(first['suburb']).toMatch(/^[A-Z][a-z]+ [A-Z]{2,3}$/);
    expect(first).not.toHaveProperty('address');
  });

  it('should include centroid field (null when not resolved)', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockGetMarketplaceOfferDetailExecute.mockResolvedValueOnce(mockOfferDetail);

    const res = await supertest(app.server)
      .get(`/v1/marketplace/offers/${GROUP_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('centroid');
  });
});
