import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

/**
 * QA-006-MEDIUM-002 — Idempotency-Key on POST /v1/appointments
 *
 * Tests:
 * 1. Same Idempotency-Key on two POST requests returns the same appointment ID (cache hit).
 * 2. Two POST requests without Idempotency-Key create two separate appointments (opt-in guard).
 * 3. POST without Idempotency-Key returns 201 normally (baseline regression).
 */

const mockCreateAppointmentExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    appointment: {
      createAppointmentUseCase: { execute: mockCreateAppointmentExecute },
      jwtService: { verify: mockJwtVerify },
      tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true, settingsJson: {} }) },
    },
  }),
}));

const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const BRANCH_ID = 'b1111111-0000-4000-8000-000000000001';
const PROPERTY_ID = 'c2222222-0000-4000-8000-000000000001';
const SERVICE_TYPE_ID = 'd3333333-0000-4000-8000-000000000001';
const APPOINTMENT_ID_1 = 'e4444444-0000-4000-8000-000000000001';
const APPOINTMENT_ID_2 = 'e4444444-0000-4000-8000-000000000002';
const USER_ID = 'f5555555-0000-4000-8000-000000000002';

const clAdminContext = {
  userId: USER_ID,
  tenantId: TENANT_A,
  role: 'CL_ADMIN',
  branchId: null,
  inspectorId: null,
};

function makeAppointmentResult(id: string) {
  return {
    id,
    tenantId: TENANT_A,
    branchId: BRANCH_ID,
    propertyId: PROPERTY_ID,
    serviceTypeId: SERVICE_TYPE_ID,
    inspectorId: null,
    serviceGroupId: null,
    status: 'DRAFT',
    scheduledDate: '2027-06-01',
    timeSlotStart: '09:00', timeSlotEnd: '10:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    rentalTenantConfirmationStatus: 'PENDING',
    priceAmount: 150,
    payoutAmount: 80,
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
    contacts: [],
    restrictions: [],
    hasActivePortalToken: false,
  };
}

const basePayload = {
  branchId: BRANCH_ID,
  propertyId: PROPERTY_ID,
  serviceTypeId: SERVICE_TYPE_ID,
  scheduledDate: '2027-06-01',
  timeSlotStart: '09:00', timeSlotEnd: '10:00',
  keyRequired: false,
  contact: { rentalTenantName: 'Test Tenant', primaryEmail: 'test@example.com' },
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

describe('POST /v1/appointments — idempotency (QA-006-MEDIUM-002)', () => {
  it('201: two requests with same Idempotency-Key return the same appointment ID', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    const cachedResult = makeAppointmentResult(APPOINTMENT_ID_1);

    // First call — execute returns the appointment
    mockCreateAppointmentExecute.mockResolvedValueOnce(cachedResult);
    const res1 = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'idem-key-abc-123')
      .send(basePayload);

    expect(res1.status).toBe(201);
    expect(res1.body.data.id).toBe(APPOINTMENT_ID_1);

    // Second call — execute is called again with same idempotencyKey;
    // the use case is responsible for returning the cached result.
    // From the route layer's perspective the response must be 201 with same id.
    mockCreateAppointmentExecute.mockResolvedValueOnce(cachedResult);
    const res2 = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'idem-key-abc-123')
      .send(basePayload);

    expect(res2.status).toBe(201);
    expect(res2.body.data.id).toBe(APPOINTMENT_ID_1);

    // idempotencyKey must be forwarded to the use case on both calls
    expect(mockCreateAppointmentExecute).toHaveBeenCalledTimes(2);
    expect(mockCreateAppointmentExecute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ idempotencyKey: 'idem-key-abc-123' }),
    );
    expect(mockCreateAppointmentExecute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ idempotencyKey: 'idem-key-abc-123' }),
    );
  });

  it('201: two requests WITHOUT Idempotency-Key create two separate appointments (opt-in guard)', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockCreateAppointmentExecute
      .mockResolvedValueOnce(makeAppointmentResult(APPOINTMENT_ID_1))
      .mockResolvedValueOnce(makeAppointmentResult(APPOINTMENT_ID_2));

    const res1 = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .send(basePayload);

    const res2 = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .send(basePayload);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body.data.id).toBe(APPOINTMENT_ID_1);
    expect(res2.body.data.id).toBe(APPOINTMENT_ID_2);
    expect(res1.body.data.id).not.toBe(res2.body.data.id);

    // Both calls reached the use case; no idempotencyKey was passed
    expect(mockCreateAppointmentExecute).toHaveBeenCalledTimes(2);
    expect(mockCreateAppointmentExecute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ idempotencyKey: undefined }),
    );
    expect(mockCreateAppointmentExecute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ idempotencyKey: undefined }),
    );
  });

  it('201: POST without Idempotency-Key returns 201 normally', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockCreateAppointmentExecute.mockResolvedValue(makeAppointmentResult(APPOINTMENT_ID_1));

    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .send(basePayload);

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(APPOINTMENT_ID_1);
    expect(mockCreateAppointmentExecute).toHaveBeenCalledOnce();
  });
});
