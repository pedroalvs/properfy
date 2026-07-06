import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockGetInspectorScheduleExecute = vi.fn();
const mockGetInspectorScheduleMonthExecute = vi.fn();
const mockGetAppointmentDetailExecute = vi.fn();
const mockStartInspectionExecute = vi.fn();
const mockFinishInspectionExecute = vi.fn();
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
    rentalTenantPortal: { jwtService: { verify: mockJwtVerify } },
    inspectorExecution: {
      getInspectorScheduleUseCase: {
        execute: mockGetInspectorScheduleExecute,
        executeMonth: mockGetInspectorScheduleMonthExecute,
      },
      getAppointmentDetailUseCase: { execute: mockGetAppointmentDetailExecute },
      startInspectionUseCase: { execute: mockStartInspectionExecute },
      finishInspectionUseCase: { execute: mockFinishInspectionExecute },
      saveExecutionProgressUseCase: { execute: vi.fn() },
      reopenExecutionUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify },
    },
    billing: { jwtService: { verify: mockJwtVerify } },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const APPOINTMENT_ID = 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55';

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

describe('GET /v1/inspector/schedule', () => {
  it('should return 200 with schedule data', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    const scheduleResult = {
      date: '2026-03-16',
      appointments: [
        {
          id: APPOINTMENT_ID,
          status: 'SCHEDULED',
          scheduledDate: '2026-03-16',
          timeSlotStart: '09:00', timeSlotEnd: '10:00',
          serviceTypeId: 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
          propertyId: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
          rentalTenantConfirmationStatus: 'CONFIRMED',
          keyRequired: false,
          meetingLocation: null,
          executionStatus: 'NOT_STARTED',
        },
      ],
    };
    mockGetInspectorScheduleExecute.mockResolvedValueOnce(scheduleResult);

    const res = await supertest(app.server)
      .get('/v1/inspector/schedule')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    // UX-baseline cleanup: response wrapped in `{ data: { date, appointments } }`.
    expect(res.body.data.date).toBe('2026-03-16');
    expect(res.body.data.appointments).toHaveLength(1);
    expect(res.body.data.appointments[0].scheduledDate).toBe('2026-03-16');
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .get('/v1/inspector/schedule');

    expect(res.status).toBe(401);
  });
});

describe('GET /v1/inspector/schedule/month', () => {
  it('should return 200 with the monthly schedule payload', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockGetInspectorScheduleMonthExecute.mockResolvedValueOnce({
      today: '2026-03-21',
      from: '2026-03-21',
      to: '2026-04-20',
      days: [{ date: '2026-03-21', count: 1, hasUrgent: false }],
      appointments: [
        {
          id: APPOINTMENT_ID,
          appointmentCode: 'INS-0001',
          status: 'SCHEDULED',
          scheduledDate: '2026-03-21',
          timeSlotStart: '09:00',
          timeSlotEnd: '10:00',
          serviceTypeId: 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
          propertyId: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
          propertyAddress: '123 Main St',
          suburb: 'Sydney',
          serviceTypeName: 'Routine Inspection',
          flowType: 'ROUTINE',
          rentalTenantConfirmationStatus: 'CONFIRMED',
          keyRequired: false,
          meetingLocation: null,
          executionStatus: 'NOT_STARTED',
          agencyName: 'Test Agency',
        },
      ],
      overdueAppointments: [],
    });

    const res = await supertest(app.server)
      .get('/v1/inspector/schedule/month')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.today).toBe('2026-03-21');
    expect(res.body.data.days).toHaveLength(1);
    expect(res.body.data.appointments[0].propertyAddress).toBe('123 Main St');
    expect(mockGetInspectorScheduleMonthExecute).toHaveBeenCalledWith(
      expect.objectContaining({ actor: expect.objectContaining({ role: 'INSP' }) }),
    );
  });

  it('should reject query parameters because the window is fixed by the backend', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);

    const res = await supertest(app.server)
      .get('/v1/inspector/schedule/month?from=2026-03-21')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(400);
  });
});

describe('GET /v1/inspector/appointments/:appointmentId', () => {
  it('should return 200 with appointment detail', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    const detailResult = {
      id: APPOINTMENT_ID,
      propertyId: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      serviceTypeId: 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
      status: 'SCHEDULED',
      scheduledDate: '2026-03-16',
      timeSlotStart: '09:00', timeSlotEnd: '10:00',
      serviceTypeName: 'Routine Inspection',
      flowType: 'ROUTINE',
      propertyAddress: '123 Main St',
      suburb: 'Sydney',
      propertyLatitude: -33.8688,
      propertyLongitude: 151.2093,
      keyRequired: false,
      meetingLocation: null,
      keyLocation: null,
      rentalTenantConfirmationStatus: 'CONFIRMED',
      rentalTenantConfirmation: 'CONFIRMED',
      rentalTenantName: 'John Smith',
      rentalTenantPhone: '+61400000000',
      rentalTenantEmail: 'john@example.com',
      notes: null,
      observation: null,
      restrictionsSummary: null,
      contact: null,
      restrictions: [],
      execution: null,
    };
    mockGetAppointmentDetailExecute.mockResolvedValueOnce(detailResult);

    const res = await supertest(app.server)
      .get(`/v1/inspector/appointments/${APPOINTMENT_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(APPOINTMENT_ID);
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .get(`/v1/inspector/appointments/${APPOINTMENT_ID}`);

    expect(res.status).toBe(401);
  });
});

describe('POST /v1/inspector/appointments/:appointmentId/start', () => {
  it('should return 201 with execution data', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    const startResult = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99',
      appointmentId: APPOINTMENT_ID,
      inspectorId: 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a66',
      startedAt: '2026-03-16T10:00:00.000Z',
      finishedAt: null,
      resumedAt: null,
      startLatitude: -33.8688,
      startLongitude: 151.2093,
      finishLatitude: null,
      finishLongitude: null,
      geolocationDistanceMeters: 120,
      checklistJson: null,
      notes: null,
      observation: null,
      createdAt: '2026-03-16T10:00:00.000Z',
      updatedAt: '2026-03-16T10:00:00.000Z',
    };
    mockStartInspectionExecute.mockResolvedValueOnce(startResult);

    const res = await supertest(app.server)
      .post(`/v1/inspector/appointments/${APPOINTMENT_ID}/start`)
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', 'idem-key-1')
      .send({ latitude: -33.8688, longitude: 151.2093 });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.startLatitude).toBe(-33.8688);
  });

  it('should return 400 without Idempotency-Key header', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);

    const res = await supertest(app.server)
      .post(`/v1/inspector/appointments/${APPOINTMENT_ID}/start`)
      .set('Authorization', 'Bearer valid-token')
      .send({ latitude: -33.8688, longitude: 151.2093 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_MISSING');
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .post(`/v1/inspector/appointments/${APPOINTMENT_ID}/start`)
      .send({ latitude: -33.8688, longitude: 151.2093 });

    expect(res.status).toBe(401);
  });

  it('should return 400 with invalid body (latitude > 90)', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);

    const res = await supertest(app.server)
      .post(`/v1/inspector/appointments/${APPOINTMENT_ID}/start`)
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', 'idem-key-2')
      .send({ latitude: 100, longitude: 151.2093 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /v1/inspector/appointments/:appointmentId/finish', () => {
  it('should return 200 with finish data', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    const finishResult = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99',
      appointmentId: APPOINTMENT_ID,
      inspectorId: 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a66',
      startedAt: '2026-03-16T10:00:00.000Z',
      finishedAt: '2026-03-16T11:00:00.000Z',
      resumedAt: null,
      startLatitude: -33.8688,
      startLongitude: 151.2093,
      finishLatitude: -33.8688,
      finishLongitude: 151.2093,
      geolocationDistanceMeters: 50,
      checklistJson: null,
      notes: null,
      observation: null,
      createdAt: '2026-03-16T10:00:00.000Z',
      updatedAt: '2026-03-16T11:00:00.000Z',
    };
    mockFinishInspectionExecute.mockResolvedValueOnce(finishResult);

    const res = await supertest(app.server)
      .post(`/v1/inspector/appointments/${APPOINTMENT_ID}/finish`)
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', 'idem-key-3')
      .send({ latitude: -33.8688, longitude: 151.2093 });

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.finishedAt).toBe('2026-03-16T11:00:00.000Z');
  });

  it('should return 400 without Idempotency-Key header', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);

    const res = await supertest(app.server)
      .post(`/v1/inspector/appointments/${APPOINTMENT_ID}/finish`)
      .set('Authorization', 'Bearer valid-token')
      .send({ latitude: -33.8688, longitude: 151.2093 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_MISSING');
  });
});

