import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockGetInspectorScheduleExecute = vi.fn();
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
    inspector: { jwtService: { verify: mockJwtVerify } },
    appointment: { jwtService: { verify: mockJwtVerify } },
    audit: { jwtService: { verify: mockJwtVerify } },
    serviceGroup: { jwtService: { verify: mockJwtVerify } },
    marketplace: { jwtService: { verify: mockJwtVerify } },
    tenantPortal: { jwtService: { verify: mockJwtVerify } },
    inspectorExecution: {
      getInspectorScheduleUseCase: { execute: mockGetInspectorScheduleExecute },
      jwtService: { verify: mockJwtVerify },
    },
    billing: { jwtService: { verify: mockJwtVerify } },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const inspContext = { userId: 'insp-1', tenantId: 'tenant-1', role: 'INSP', branchId: null, inspectorId: 'insp-1' };

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(() => { vi.clearAllMocks(); });

describe('GET /v1/inspector/schedule — enriched fields', () => {
  it('should include agencyName on each appointment in the schedule', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockGetInspectorScheduleExecute.mockResolvedValueOnce({
      date: '2026-04-12',
      appointments: [
        {
          id: 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
          status: 'SCHEDULED',
          scheduledDate: '2026-04-12',
          timeSlotStart: '09:00', timeSlotEnd: '10:00',
          serviceTypeId: 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
          propertyId: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
          tenantConfirmationStatus: 'CONFIRMED',
          keyRequired: false,
          meetingLocation: null,
          executionStatus: 'NOT_STARTED',
          agencyName: 'Alpha Realty',
        },
      ],
    });

    const res = await supertest(app.server)
      .get('/v1/inspector/schedule')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.appointments[0].agencyName).toBe('Alpha Realty');
  });

  it('should reflect keyRequired = true correctly', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockGetInspectorScheduleExecute.mockResolvedValueOnce({
      date: '2026-04-12',
      appointments: [
        {
          id: 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a56',
          status: 'SCHEDULED',
          scheduledDate: '2026-04-12',
          timeSlotStart: '10:00', timeSlotEnd: '11:00',
          serviceTypeId: 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
          propertyId: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a34',
          tenantConfirmationStatus: 'CONFIRMED',
          keyRequired: true,
          meetingLocation: 'Office reception',
          executionStatus: 'NOT_STARTED',
          agencyName: 'Beta Properties',
        },
      ],
    });

    const res = await supertest(app.server)
      .get('/v1/inspector/schedule')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.appointments[0].keyRequired).toBe(true);
    expect(res.body.data.appointments[0].meetingLocation).toBe('Office reception');
  });
});
