import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockGetInspectorScheduleExecute = vi.fn();
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
    rentalTenantPortal: { jwtService: { verify: mockJwtVerify } },
    inspectorExecution: {
      getInspectorScheduleUseCase: { execute: mockGetInspectorScheduleExecute },
      jwtService: { verify: mockJwtVerify },
    },
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

const doneAppointment = {
  id: '00000000-0000-0000-0000-000000000001',
  appointmentCode: 'INS-0001',
  status: 'DONE',
  scheduledDate: '2026-04-01',
  timeSlotStart: '08:00', timeSlotEnd: '12:00',
  serviceTypeId: '00000000-0000-0000-0000-000000000099',
  propertyId: '00000000-0000-0000-0000-000000000088',
  rentalTenantConfirmationStatus: 'CONFIRMED',
  keyRequired: false,
  meetingLocation: null,
  executionStatus: 'FINISHED',
  agencyName: 'Test Agency',
  propertyAddress: '1 Test St',
  suburb: 'Suburb',
  serviceTypeName: 'Routine Inspection',
  flowType: 'ROUTINE',
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

describe('GET /v1/inspector/schedule — range mode (history)', () => {
  it('returns 200 paginated DONE appointments in range mode', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockGetInspectorScheduleExecute.mockResolvedValueOnce({
      data: [doneAppointment],
      total: 1,
      page: 1,
      pageSize: 50,
    });

    const res = await supertest(app.server)
      .get('/v1/inspector/schedule?from=2025-11-01&to=2026-04-30&status=DONE')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('DONE');
    expect(res.body.data[0]).toMatchObject({
      propertyAddress: '1 Test St',
      suburb: 'Suburb',
      serviceTypeName: 'Routine Inspection',
      flowType: 'ROUTINE',
    });
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBe(1);
  });

  it('passes from/to/status/page/pageSize to use case in range mode', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockGetInspectorScheduleExecute.mockResolvedValueOnce({ data: [], total: 0, page: 1, pageSize: 50 });

    await supertest(app.server)
      .get('/v1/inspector/schedule?from=2025-11-01&to=2026-04-30&status=DONE&page=2&pageSize=20')
      .set('Authorization', 'Bearer valid-token');

    expect(mockGetInspectorScheduleExecute).toHaveBeenCalledWith(
      expect.objectContaining({ from: '2025-11-01', to: '2026-04-30', status: 'DONE', page: 2, pageSize: 20 }),
    );
  });

  it('returns 400 when date and from/to are combined', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);

    const res = await supertest(app.server)
      .get('/v1/inspector/schedule?date=2026-04-01&from=2025-11-01&to=2026-04-30')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(400);
  });

  it('single-day mode still works (date param)', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockGetInspectorScheduleExecute.mockResolvedValueOnce({
      date: '2026-04-12',
      appointments: [],
    });

    const res = await supertest(app.server)
      .get('/v1/inspector/schedule?date=2026-04-12')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.date).toBe('2026-04-12');
  });
});
