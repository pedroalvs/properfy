import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockCreateAppointmentExecute = vi.fn();
const mockGetAppointmentExecute = vi.fn();
const mockListAppointmentsExecute = vi.fn();
const mockUpdateAppointmentExecute = vi.fn();
const mockExecuteStatusTransitionExecute = vi.fn();
const mockPerformCrossCheckExecute = vi.fn();
const mockForceManualConfirmationExecute = vi.fn();
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
    appointment: {
      createAppointmentUseCase: { execute: mockCreateAppointmentExecute },
      getAppointmentUseCase: { execute: mockGetAppointmentExecute },
      listAppointmentsUseCase: { execute: mockListAppointmentsExecute },
      updateAppointmentUseCase: { execute: mockUpdateAppointmentExecute },
      executeStatusTransitionUseCase: { execute: mockExecuteStatusTransitionExecute },
      performCrossCheckUseCase: { execute: mockPerformCrossCheckExecute },
      forceManualConfirmationUseCase: { execute: mockForceManualConfirmationExecute },
      reopenForRescheduleUseCase: { execute: vi.fn() },
      deleteAppointmentUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify },
      tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true, settingsJson: {} }) },
    },
    audit: { jwtService: { verify: mockJwtVerify } },
    serviceGroup: { jwtService: { verify: mockJwtVerify } },
    marketplace: { jwtService: { verify: mockJwtVerify } },
    rentalTenantPortal: { jwtService: { verify: mockJwtVerify } },
    inspectorExecution: { jwtService: { verify: mockJwtVerify } },
    billing: { jwtService: { verify: mockJwtVerify } },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const BRANCH_ID = 'b1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b22';
const PROPERTY_ID = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';
const SERVICE_TYPE_ID = 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';
const APPOINTMENT_ID = 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55';
const USER_ID = 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a66';

const amContext = { userId: 'admin-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const clAdminContext = { userId: USER_ID, tenantId: TENANT_ID, role: 'CL_ADMIN', branchId: null, inspectorId: null };

const appointmentResult = {
  id: APPOINTMENT_ID,
  tenantId: TENANT_ID,
  branchId: BRANCH_ID,
  propertyId: PROPERTY_ID,
  serviceTypeId: SERVICE_TYPE_ID,
  inspectorId: null,
  serviceGroupId: null,
  status: 'DRAFT',
  scheduledDate: '2026-04-01',
  timeSlot: '09:00-10:00',
  keyRequired: false,
  meetingLocation: null,
  keyLocation: null,
  rentalTenantConfirmationStatus: 'PENDING',
  priceAmount: 150,
  payoutAmount: 100,
  pricingRuleSnapshotJson: {},
  notes: null,
  customFieldsJson: null,
  reason: null,
  createdByUserId: USER_ID,
  doneMarkedByUserId: null,
    doneCheckedByUserId: null,
  doneCheckedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  contact: {
    id: 'contact-uuid-1111-1111-1111-111111111111',
    appointmentId: APPOINTMENT_ID,
    rentalTenantName: 'John Doe',
    primaryEmail: 'john@example.com',
    secondaryEmail: null,
    primaryPhone: null,
    secondaryPhone: null,
  },
  restrictions: [],
  hasActivePortalToken: false,
};

const statusTransitionResult = {
  id: APPOINTMENT_ID,
  status: 'AWAITING_INSPECTOR',
  previousStatus: 'DRAFT',
  reason: null,
  inspectorId: null,
  doneMarkedByUserId: null,
    doneCheckedByUserId: null,
  doneCheckedAt: null,
  updatedAt: new Date().toISOString(),
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

const validCreatePayload = {
  branchId: BRANCH_ID,
  propertyId: PROPERTY_ID,
  serviceTypeId: SERVICE_TYPE_ID,
  scheduledDate: '2027-01-15',
  timeSlot: '09:00-10:00',
  contact: {
    rentalTenantName: 'John Doe',
    primaryEmail: 'john@example.com',
  },
  keyRequired: false,
};

describe('POST /v1/appointments', () => {
  it('should return 201 with valid payload', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    mockCreateAppointmentExecute.mockResolvedValueOnce(appointmentResult);

    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer valid-token')
      .send(validCreatePayload);

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id', APPOINTMENT_ID);
    expect(res.body.data.status).toBe('DRAFT');
  });

  it('should return 400 with invalid payload (missing branchId)', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);

    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer valid-token')
      .send({
        propertyId: PROPERTY_ID,
        serviceTypeId: SERVICE_TYPE_ID,
        scheduledDate: '2026-04-01',
        timeSlot: '09:00-10:00',
        contact: { rentalTenantName: 'John Doe' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .post('/v1/appointments')
      .send(validCreatePayload);

    expect(res.status).toBe(401);
  });
});

describe('GET /v1/appointments', () => {
  it('should return 200 with paginated results', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    // The real ListAppointmentsUseCase does NOT include hasActivePortalToken in list items.
    // This mock intentionally omits the field to verify the schema default (z.boolean().default(false))
    // fills it in during Fastify serialization. If the default is ever removed, this test will catch
    // the 500 ResponseValidationError that QA found.
    const { hasActivePortalToken: _omit, ...listItemResult } = appointmentResult;
    mockListAppointmentsExecute.mockResolvedValueOnce({
      data: [listItemResult],
      total: 1,
    });

    const res = await supertest(app.server)
      .get('/v1/appointments')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(APPOINTMENT_ID);
    // Schema default must supply hasActivePortalToken:false when the use case omits the field.
    expect(res.body.data[0].hasActivePortalToken).toBe(false);
  });

  it('should return 400 with invalid query params (invalid status)', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);

    const res = await supertest(app.server)
      .get('/v1/appointments?status=INVALID_STATUS')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /v1/appointments/:appointmentId', () => {
  it('should return 200 with appointment details', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    mockGetAppointmentExecute.mockResolvedValueOnce(appointmentResult);

    const res = await supertest(app.server)
      .get(`/v1/appointments/${APPOINTMENT_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(APPOINTMENT_ID);
    expect(res.body.data.status).toBe('DRAFT');
  });

  it('should return 400 with invalid UUID', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);

    const res = await supertest(app.server)
      .get('/v1/appointments/not-a-uuid')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /v1/appointments/:appointmentId', () => {
  it('should return 200 with updated data', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    mockUpdateAppointmentExecute.mockResolvedValueOnce({
      ...appointmentResult,
      notes: 'Updated notes',
    });

    const res = await supertest(app.server)
      .patch(`/v1/appointments/${APPOINTMENT_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .send({ notes: 'Updated notes' });

    expect(res.status).toBe(200);
    expect(res.body.data.notes).toBe('Updated notes');
  });

  it('should return 400 with invalid payload (timeSlot wrong format)', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);

    const res = await supertest(app.server)
      .patch(`/v1/appointments/${APPOINTMENT_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .send({ timeSlot: 'not-a-valid-timeslot' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts observation in the body and serializes it in the response', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    mockUpdateAppointmentExecute.mockResolvedValueOnce({
      ...appointmentResult,
      observation: 'Gate code is 4321',
    });

    const res = await supertest(app.server)
      .patch(`/v1/appointments/${APPOINTMENT_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .send({ observation: 'Gate code is 4321' });

    expect(res.status).toBe(200);
    expect(res.body.data.observation).toBe('Gate code is 4321');
    expect(mockUpdateAppointmentExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ observation: 'Gate code is 4321' }),
      }),
    );
  });
});

describe('POST /v1/appointments/:appointmentId/status-transitions', () => {
  it('should return 200 with transition result', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    mockExecuteStatusTransitionExecute.mockResolvedValueOnce(statusTransitionResult);

    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPOINTMENT_ID}/status-transitions`)
      .set('Authorization', 'Bearer valid-token')
      .send({ targetStatus: 'AWAITING_INSPECTOR' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('AWAITING_INSPECTOR');
    expect(res.body.data.previousStatus).toBe('DRAFT');
  });

  it('should return 400 with invalid targetStatus', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);

    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPOINTMENT_ID}/status-transitions`)
      .set('Authorization', 'Bearer valid-token')
      .send({ targetStatus: 'INVALID_STATUS' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 with missing body', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);

    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPOINTMENT_ID}/status-transitions`)
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /v1/appointments/:appointmentId/cross-check-done', () => {
  it('should return 200 with cross-check result', async () => {
    mockJwtVerify.mockReset();
    mockJwtVerify.mockResolvedValue(amContext);
    mockPerformCrossCheckExecute.mockResolvedValueOnce({
      id: APPOINTMENT_ID,
      status: 'DONE',
      previousStatus: 'DONE',
      reason: null,
      inspectorId: '11111111-1111-4111-8111-111111111111',
      doneCheckedByUserId: '22222222-2222-4222-8222-222222222222',
      doneCheckedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPOINTMENT_ID}/cross-check-done`)
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DONE');
    expect(res.body.data.doneCheckedByUserId).toBe('22222222-2222-4222-8222-222222222222');
    expect(mockPerformCrossCheckExecute).toHaveBeenCalledWith({
      appointmentId: APPOINTMENT_ID,
      actor: amContext,
    });
  });
});

describe('POST /v1/appointments/:appointmentId/force-confirmation', () => {
  it('should return 200 with confirmation result', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockForceManualConfirmationExecute.mockResolvedValueOnce({
      id: APPOINTMENT_ID,
      rentalTenantConfirmationStatus: 'CONFIRMED',
    });

    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPOINTMENT_ID}/force-confirmation`)
      .set('Authorization', 'Bearer valid-token')
      .send({ rentalTenantConfirmationStatus: 'CONFIRMED', reason: 'Operator confirmed manually' });

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(APPOINTMENT_ID);
    expect(res.body.data.rentalTenantConfirmationStatus).toBe('CONFIRMED');
  });

  it('should return 400 with missing reason', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPOINTMENT_ID}/force-confirmation`)
      .set('Authorization', 'Bearer valid-token')
      .send({ rentalTenantConfirmationStatus: 'CONFIRMED' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 with invalid rentalTenantConfirmationStatus (not CONFIRMED)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPOINTMENT_ID}/force-confirmation`)
      .set('Authorization', 'Bearer valid-token')
      .send({ rentalTenantConfirmationStatus: 'PENDING', reason: 'Some reason' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// `GET /v1/appointment-contacts/:contactId` endpoint removed alongside the
// AppointmentContactsListTab UI — the legacy tenant-wide contacts board it
// served was retired with the 023 contacts unification. Tests removed.
