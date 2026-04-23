/**
 * T031, T034 — RBAC integration tests for CL_USER permission flag enforcement.
 *
 * Tests all 7 CL_USER permission flags:
 *   create_appointments, cancel_appointments, reject_appointments,
 *   create_properties, reschedule_appointments, force_confirmation, export_reports
 *
 * For each flag: enabled → action succeeds (use case resolves), disabled → 403
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { makeClUserContext } from '../../helpers/rbac-test-helpers';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const mockJwtVerify = vi.fn();
const mockCreateAppointment = vi.fn();
const mockStatusTransition = vi.fn();
const mockForceConfirmation = vi.fn();
const mockCreateProperty = vi.fn();
const mockUpdateProperty = vi.fn();
const mockUpdateAppointment = vi.fn();
const mockRequestReport = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: { jwtService: { verify: mockJwtVerify } },
    user: { jwtService: { verify: mockJwtVerify } },
    property: {
      jwtService: { verify: mockJwtVerify },
      createPropertyUseCase: { execute: mockCreateProperty },
      updatePropertyUseCase: { execute: mockUpdateProperty },
      listPropertiesUseCase: { execute: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 }) },
    },
    serviceType: { jwtService: { verify: mockJwtVerify } },
    pricingRule: { jwtService: { verify: mockJwtVerify } },
    inspector: { jwtService: { verify: mockJwtVerify } },
    appointment: {
      jwtService: { verify: mockJwtVerify },
      createAppointmentUseCase: { execute: mockCreateAppointment },
      executeStatusTransitionUseCase: { execute: mockStatusTransition },
      forceManualConfirmationUseCase: { execute: mockForceConfirmation },
      updateAppointmentUseCase: { execute: mockUpdateAppointment },
      listAppointmentsUseCase: { execute: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 }) },
    },
    audit: { jwtService: { verify: mockJwtVerify } },
    serviceGroup: { jwtService: { verify: mockJwtVerify } },
    marketplace: { jwtService: { verify: mockJwtVerify } },
    tenantPortal: { jwtService: { verify: mockJwtVerify } },
    inspectorExecution: { jwtService: { verify: mockJwtVerify } },
    billing: { jwtService: { verify: mockJwtVerify } },
    report: {
      jwtService: { verify: mockJwtVerify },
      requestReportUseCase: { execute: mockRequestReport },
      listReportsUseCase: { execute: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 }) },
    },
    notification: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const PROPERTY_ID = 'b1ccef11-1a2b-4ef8-bb6d-6bb9bd380a22';
const APPT_ID = 'c2ddfe22-2b3c-4ef9-cc7e-7cc0ce491b33';
const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const apptStub = {
  id: APPT_ID,
  tenantId: TENANT_ID,
  branchId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  propertyId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  serviceTypeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
  inspectorId: null,
  status: 'DRAFT',
  scheduledDate: futureDate,
  timeSlot: '09:00-10:00',
  tenantConfirmationStatus: 'PENDING',
  priceAmount: 0,
  payoutAmount: 0,
  notes: null,
  reason: null,
  createdByUserId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const propertyStub = {
  id: PROPERTY_ID,
  tenantId: TENANT_ID,
  branchId: null,
  propertyCode: 'PROP-001',
  type: 'RESIDENTIAL',
  street: '1 Main St',
  addressLine2: null,
  suburb: 'Sydney',
  postcode: '2000',
  state: 'NSW',
  country: 'AU',
  geocodingStatus: 'PENDING',
  notes: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const createApptPayload = {
  branchId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  propertyId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  serviceTypeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
  scheduledDate: futureDate,
  timeSlot: '09:00-10:00',
  contact: { tenantName: 'John Smith', primaryPhone: '+61400000000' },
};

const createPropPayload = {
  propertyCode: 'PROP-002',
  type: 'RESIDENTIAL',
  street: '2 Test St',
  suburb: 'Melbourne',
  postcode: '3000',
  state: 'VIC',
  country: 'AU',
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

// ── Flag: create_appointments ─────────────────────────────────────────────────

describe('CL_USER flag: create_appointments', () => {
  it('with flag → 201 (appointment created)', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID, ['create_appointments']));
    mockCreateAppointment.mockResolvedValue(apptStub);
    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer t')
      .send(createApptPayload);
    expect(res.status).toBe(201);
  });

  it('without flag → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID, []));
    mockCreateAppointment.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'CL_USER does not have create_appointments permission'));
    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer t')
      .send(createApptPayload);
    expect(res.status).toBe(403);
  });
});

// ── Flag: cancel_appointments ─────────────────────────────────────────────────

describe('CL_USER flag: cancel_appointments', () => {
  const payload = { targetStatus: 'CANCELLED', reason: 'Test cancellation' };
  const cancelledStub = { id: APPT_ID, status: 'CANCELLED', previousStatus: 'DRAFT', reason: payload.reason, inspectorId: null, doneCheckedByUserId: null, doneCheckedAt: null, updatedAt: new Date().toISOString() };

  it('with flag → 200 (transition executed)', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID, ['cancel_appointments']));
    mockStatusTransition.mockResolvedValue(cancelledStub);
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPT_ID}/status-transitions`)
      .set('Authorization', 'Bearer t')
      .send(payload);
    expect(res.status).toBe(200);
  });

  it('without flag → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID, []));
    mockStatusTransition.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'CL_USER does not have cancel_appointments permission'));
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPT_ID}/status-transitions`)
      .set('Authorization', 'Bearer t')
      .send(payload);
    expect(res.status).toBe(403);
  });
});

// ── Flag: create_properties ───────────────────────────────────────────────────

describe('CL_USER flag: create_properties', () => {
  it('with flag → 201 (property created)', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID, ['create_properties']));
    mockCreateProperty.mockResolvedValue(propertyStub);
    const res = await supertest(app.server)
      .post('/v1/properties')
      .set('Authorization', 'Bearer t')
      .send(createPropPayload);
    expect(res.status).toBe(201);
  });

  it('without flag → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID, []));
    mockCreateProperty.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'CL_USER does not have create_properties permission'));
    const res = await supertest(app.server)
      .post('/v1/properties')
      .set('Authorization', 'Bearer t')
      .send(createPropPayload);
    expect(res.status).toBe(403);
  });
});

// ── Flag: create_properties (also governs update) ─────────────────────────────

describe('CL_USER flag: create_properties (also governs property.update)', () => {
  it('with flag → 200 (property updated)', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID, ['create_properties']));
    mockUpdateProperty.mockResolvedValue(propertyStub);
    const res = await supertest(app.server)
      .patch(`/v1/properties/${PROPERTY_ID}`)
      .set('Authorization', 'Bearer t')
      .send({ notes: 'updated note' });
    expect(res.status).toBe(200);
  });

  it('without flag → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID, []));
    mockUpdateProperty.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'CL_USER does not have create_properties permission'));
    const res = await supertest(app.server)
      .patch(`/v1/properties/${PROPERTY_ID}`)
      .set('Authorization', 'Bearer t')
      .send({ notes: 'updated note' });
    expect(res.status).toBe(403);
  });
});

// ── Flag: force_confirmation ──────────────────────────────────────────────────

describe('CL_USER flag: force_confirmation', () => {
  const confirmedStub = { id: APPT_ID, tenantConfirmationStatus: 'CONFIRMED' };
  const forceConfirmPayload = { tenantConfirmationStatus: 'CONFIRMED' as const, reason: 'Manual override by operator' };

  it('with flag → 200 (force confirmation executed)', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID, ['force_confirmation']));
    mockForceConfirmation.mockResolvedValue(confirmedStub);
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPT_ID}/force-confirmation`)
      .set('Authorization', 'Bearer t')
      .send(forceConfirmPayload);
    expect(res.status).toBe(200);
  });

  it('without flag → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID, []));
    mockForceConfirmation.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'CL_USER does not have force_confirmation permission'));
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPT_ID}/force-confirmation`)
      .set('Authorization', 'Bearer t')
      .send(forceConfirmPayload);
    expect(res.status).toBe(403);
  });
});

// ── Flag: reject_appointments ─────────────────────────────────────────────────

describe('CL_USER flag: reject_appointments', () => {
  const payload = { targetStatus: 'REJECTED', reason: 'Impossible to execute' };
  const rejectedStub = { id: APPT_ID, status: 'REJECTED', previousStatus: 'DRAFT', reason: payload.reason, inspectorId: null, doneCheckedByUserId: null, doneCheckedAt: null, updatedAt: new Date().toISOString() };

  it('with flag → 200 (transition executed)', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID, ['reject_appointments']));
    mockStatusTransition.mockResolvedValue(rejectedStub);
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPT_ID}/status-transitions`)
      .set('Authorization', 'Bearer t')
      .send(payload);
    expect(res.status).toBe(200);
  });

  it('without flag → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID, []));
    mockStatusTransition.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'CL_USER does not have reject_appointments permission'));
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPT_ID}/status-transitions`)
      .set('Authorization', 'Bearer t')
      .send(payload);
    expect(res.status).toBe(403);
  });
});

// ── Flag: reschedule_appointments ─────────────────────────────────────────────

describe('CL_USER flag: reschedule_appointments', () => {
  const reschedulePayload = { scheduledDate: futureDate, timeSlot: '10:00-11:00' };

  it('with flag → 200 (appointment rescheduled)', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID, ['reschedule_appointments']));
    mockUpdateAppointment.mockResolvedValue({ ...apptStub, scheduledDate: futureDate, timeSlot: '10:00-11:00' });
    const res = await supertest(app.server)
      .patch(`/v1/appointments/${APPT_ID}`)
      .set('Authorization', 'Bearer t')
      .send(reschedulePayload);
    expect(res.status).toBe(200);
  });

  it('without flag → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID, []));
    mockUpdateAppointment.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'CL_USER does not have reschedule_appointments permission'));
    const res = await supertest(app.server)
      .patch(`/v1/appointments/${APPT_ID}`)
      .set('Authorization', 'Bearer t')
      .send(reschedulePayload);
    expect(res.status).toBe(403);
  });
});

// ── Flag: export_reports ──────────────────────────────────────────────────────

describe('CL_USER flag: export_reports', () => {
  const today = new Date().toISOString().slice(0, 10);
  const reportPayload = {
    reportType: 'INSPECTIONS_SCHEDULED',
    filters: { fromDate: today, toDate: today },
    format: 'XLSX',
  };
  const reportStub = {
    reportId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a77',
    status: 'PENDING',
    reportType: 'INSPECTIONS_SCHEDULED',
    createdAt: new Date().toISOString(),
  };

  it('with flag → 202 (report requested)', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID, ['export_reports']));
    mockRequestReport.mockResolvedValue(reportStub);
    const res = await supertest(app.server)
      .post('/v1/reports')
      .set('Authorization', 'Bearer t')
      .send(reportPayload);
    expect(res.status).toBe(202);
  });

  it('without flag → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID, []));
    mockRequestReport.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'CL_USER does not have export_reports permission'));
    const res = await supertest(app.server)
      .post('/v1/reports')
      .set('Authorization', 'Bearer t')
      .send(reportPayload);
    expect(res.status).toBe(403);
  });
});
