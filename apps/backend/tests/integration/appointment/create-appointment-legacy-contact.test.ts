import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

/**
 * T015 — Integration tests for backward-compat legacy `contact:` field on POST /v1/appointments.
 *
 * Verifies that the deprecated single-contact payload still creates an appointment
 * with a junction row (contactId = null) and snapshot populated from legacy fields.
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

const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000002';
const BRANCH_ID = 'b1111111-0000-4000-8000-000000000002';
const PROPERTY_ID = 'c2222222-0000-4000-8000-000000000002';
const SERVICE_TYPE_ID = 'd3333333-0000-4000-8000-000000000002';
const APPOINTMENT_ID = 'e4444444-0000-4000-8000-000000000002';
const USER_ID = 'a0000000-0000-4000-8000-000000000002';

const clAdminContext = { userId: USER_ID, tenantId: TENANT_A, role: 'CL_ADMIN', branchId: null, inspectorId: null };

function makeAppointmentResult(overrides: Record<string, unknown> = {}) {
  return {
    id: APPOINTMENT_ID,
    tenantId: TENANT_A,
    branchId: BRANCH_ID,
    propertyId: PROPERTY_ID,
    serviceTypeId: SERVICE_TYPE_ID,
    inspectorId: null,
    serviceGroupId: null,
    status: 'DRAFT',
    scheduledDate: '2027-07-01',
    timeSlot: '09:00-10:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    tenantConfirmationStatus: 'PENDING',
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
    ...overrides,
  };
}

const basePayload = {
  branchId: BRANCH_ID,
  propertyId: PROPERTY_ID,
  serviceTypeId: SERVICE_TYPE_ID,
  scheduledDate: '2027-07-01',
  timeSlot: '09:00-10:00',
  keyRequired: false,
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

describe('POST /v1/appointments — legacy contact field backward compat (T015)', () => {
  it('201: legacy contact: object → use case receives contact, response has junction with null contactId', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockCreateAppointmentExecute.mockResolvedValue(makeAppointmentResult({
      contacts: [{
        id: 'legacy-junction-1',
        contactId: null,
        role: 'TENANT',
        isPrimary: true,
        snapshotName: 'Legacy Tenant',
        snapshotEmail: 'legacy@example.com',
        snapshotPhone: '+61400000000',
      }],
    }));

    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .send({
        ...basePayload,
        contact: {
          tenantName: 'Legacy Tenant',
          primaryEmail: 'legacy@example.com',
          primaryPhone: '+61400000000',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.contacts[0].contactId).toBeNull();
    expect(res.body.data.contacts[0].isPrimary).toBe(true);
    expect(res.body.data.contacts[0].snapshotName).toBe('Legacy Tenant');
    expect(mockCreateAppointmentExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        contact: expect.objectContaining({ tenantName: 'Legacy Tenant' }),
      }),
    );
  });

  it('201: legacy contact with only tenantName and primaryPhone (no email) → still accepted', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockCreateAppointmentExecute.mockResolvedValue(makeAppointmentResult({
      contacts: [{
        id: 'legacy-junction-2',
        contactId: null,
        role: 'TENANT',
        isPrimary: true,
        snapshotName: 'Phone Only Tenant',
        snapshotEmail: null,
        snapshotPhone: '+61411111111',
      }],
    }));

    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .send({
        ...basePayload,
        contact: {
          tenantName: 'Phone Only Tenant',
          primaryPhone: '+61411111111',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.contacts[0].snapshotPhone).toBe('+61411111111');
  });

  it('400: both contact and contacts present → mutual exclusion refine rejects', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);

    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .send({
        ...basePayload,
        contact: { tenantName: 'Legacy', primaryEmail: 'legacy@example.com' },
        contacts: [{ contactId: 'f5555555-0000-4000-8000-000000000001', role: 'TENANT', isPrimary: true }],
      });

    expect(res.status).toBe(400);
    expect(mockCreateAppointmentExecute).not.toHaveBeenCalled();
  });
});
