import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { makeAmContext, makeOpContext, makeClAdminContext, makeClUserContext } from './helpers';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const mockJwtVerify = vi.fn();
const mockListAppointments = vi.fn();
const mockCreateAppointment = vi.fn();
const mockStatusTransition = vi.fn();
const mockCrossCheck = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: { jwtService: { verify: mockJwtVerify } },
    user: { jwtService: { verify: mockJwtVerify } },
    property: { jwtService: { verify: mockJwtVerify } },
    serviceType: { jwtService: { verify: mockJwtVerify } },
    pricingRule: { jwtService: { verify: mockJwtVerify } },
    inspector: { jwtService: { verify: mockJwtVerify } },
    appointment: {
      jwtService: { verify: mockJwtVerify },
      listAppointmentsUseCase: { execute: mockListAppointments },
      createAppointmentUseCase: { execute: mockCreateAppointment },
      executeStatusTransitionUseCase: { execute: mockStatusTransition },
      performCrossCheckUseCase: { execute: mockCrossCheck },
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
const APPOINTMENT_ID = 'c2ddfe22-2b3c-4ef9-cc7e-7cc0ce491b33';

const appointmentStub = {
  id: APPOINTMENT_ID,
  status: 'DRAFT',
  previousStatus: 'DRAFT',
  reason: null,
  inspectorId: null,
  doneCheckedByUserId: null,
  doneCheckedAt: null,
  updatedAt: new Date().toISOString(),
};

// Valid date in the future (YYYY-MM-DD)
const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const createPayload = {
  branchId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  propertyId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  serviceTypeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
  scheduledDate: futureDate,
  timeSlotStart: '09:00', timeSlotEnd: '10:00',
  contact: {
    rentalTenantName: 'John Smith',
    primaryPhone: '+61400000000',
  },
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

// ── GET /v1/appointments ──────────────────────────────────────────────────────

describe('GET /v1/appointments — RBAC', () => {
  const listStub = { data: [], total: 0, page: 1, pageSize: 20 };

  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockListAppointments.mockResolvedValue(listStub);
    const res = await supertest(app.server).get('/v1/appointments').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockListAppointments.mockResolvedValue(listStub);
    const res = await supertest(app.server).get('/v1/appointments').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('allows CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockListAppointments.mockResolvedValue(listStub);
    const res = await supertest(app.server).get('/v1/appointments').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('allows CL_USER', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockListAppointments.mockResolvedValue(listStub);
    const res = await supertest(app.server).get('/v1/appointments').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });
});

// ── POST /v1/appointments ─────────────────────────────────────────────────────

describe('POST /v1/appointments — RBAC', () => {
  const appointmentCreateStub = {
    id: APPOINTMENT_ID,
    tenantId: TENANT_ID,
    branchId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    propertyId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    serviceTypeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
    inspectorId: null,
    status: 'DRAFT',
    scheduledDate: futureDate,
    timeSlotStart: '09:00', timeSlotEnd: '10:00',
    rentalTenantConfirmationStatus: 'PENDING',
    priceAmount: 0,
    payoutAmount: 0,
    notes: null,
    reason: null,
    createdByUserId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    hasActivePortalToken: false,
  };

  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockCreateAppointment.mockResolvedValue(appointmentCreateStub);
    const res = await supertest(app.server)
      .post('/v1/appointments').set('Authorization', 'Bearer t').send(createPayload);
    expect(res.status).toBe(201);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockCreateAppointment.mockResolvedValue(appointmentCreateStub);
    const res = await supertest(app.server)
      .post('/v1/appointments').set('Authorization', 'Bearer t').send(createPayload);
    expect(res.status).toBe(201);
  });

  it('allows CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockCreateAppointment.mockResolvedValue(appointmentCreateStub);
    const res = await supertest(app.server)
      .post('/v1/appointments').set('Authorization', 'Bearer t').send(createPayload);
    expect(res.status).toBe(201);
  });

  it('denies CL_USER without create_appointments flag', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID, []));
    mockCreateAppointment.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post('/v1/appointments').set('Authorization', 'Bearer t').send(createPayload);
    expect(res.status).toBe(403);
  });
});

// ── POST /v1/appointments/:id/status-transitions (CANCELLED) ─────────────────

describe('POST /v1/appointments/:id/status-transitions — RBAC', () => {
  const payload = { targetStatus: 'CANCELLED', reason: 'Test cancellation' };

  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockStatusTransition.mockResolvedValue(appointmentStub);
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPOINTMENT_ID}/status-transitions`)
      .set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(200);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockStatusTransition.mockResolvedValue(appointmentStub);
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPOINTMENT_ID}/status-transitions`)
      .set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(200);
  });

  it('allows CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockStatusTransition.mockResolvedValue(appointmentStub);
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPOINTMENT_ID}/status-transitions`)
      .set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(200);
  });

  it('denies unauthenticated', async () => {
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPOINTMENT_ID}/status-transitions`).send(payload);
    expect(res.status).toBe(401);
  });
});

// ── POST /v1/appointments/:id/cross-check-done ────────────────────────────────

describe('POST /v1/appointments/:id/cross-check-done — RBAC', () => {
  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockCrossCheck.mockResolvedValue(appointmentStub);
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPOINTMENT_ID}/cross-check-done`)
      .set('Authorization', 'Bearer t').send({});
    expect(res.status).toBe(200);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockCrossCheck.mockResolvedValue(appointmentStub);
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPOINTMENT_ID}/cross-check-done`)
      .set('Authorization', 'Bearer t').send({});
    expect(res.status).toBe(200);
  });

  it('denies CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockCrossCheck.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPOINTMENT_ID}/cross-check-done`)
      .set('Authorization', 'Bearer t').send({});
    expect(res.status).toBe(403);
  });

  it('denies CL_USER', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockCrossCheck.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPOINTMENT_ID}/cross-check-done`)
      .set('Authorization', 'Bearer t').send({});
    expect(res.status).toBe(403);
  });
});
