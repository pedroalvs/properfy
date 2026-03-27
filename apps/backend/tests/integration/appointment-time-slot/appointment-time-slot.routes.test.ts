import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/main/server';
import { createMockContainer } from '../../helpers/mock-container';

const mockListAppointmentTimeSlotsExecute = vi.fn();
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
    marketplace: { jwtService: { verify: mockJwtVerify } },
    tenantPortal: { jwtService: { verify: mockJwtVerify } },
    inspectorExecution: { jwtService: { verify: mockJwtVerify } },
    billing: { jwtService: { verify: mockJwtVerify } },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
    dashboard: { jwtService: { verify: mockJwtVerify } },
    appointmentTimeSlot: {
      listAppointmentTimeSlotsUseCase: { execute: mockListAppointmentTimeSlotsExecute },
      jwtService: { verify: mockJwtVerify },
    },
  }),
}));

const TENANT_ID = '8d39f531-0dd5-4a4f-af33-c470a1432cad';
const amContext = { userId: 'admin-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(() => { vi.clearAllMocks(); });

describe('GET /v1/time-slots', () => {
  it('should accept includeInactive query and return slots for AM with tenantId', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockListAppointmentTimeSlotsExecute.mockResolvedValueOnce([
      {
        id: '0a56b81f-ecce-4cbb-af97-35d9001295b0',
        tenantId: TENANT_ID,
        branchId: null,
        label: 'Morning',
        startTime: '09:00',
        endTime: '12:00',
        sortOrder: 0,
        isActive: true,
        createdAt: new Date('2026-03-27T00:00:00.000Z'),
        updatedAt: new Date('2026-03-27T00:00:00.000Z'),
      },
    ]);

    const res = await supertest(app.server)
      .get(`/v1/time-slots?includeInactive=true&tenantId=${TENANT_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(mockListAppointmentTimeSlotsExecute).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      includeInactive: true,
      actor: amContext,
    });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].label).toBe('Morning');
  });
});
