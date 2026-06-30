import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { ValidationError } from '../../../src/shared/domain/errors';

/**
 * T014 — Integration tests for appointment creation via contacts[] array (021 junction pattern).
 *
 * Each case verifies that the route correctly wires the input to the use case
 * and returns the expected HTTP status. Domain logic (snapshot, registry writes)
 * is covered by unit tests; here we verify the route contract.
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
const APPOINTMENT_ID = 'e4444444-0000-4000-8000-000000000001';
const CONTACT_A_ID = 'f5555555-0000-4000-8000-000000000010';
const CONTACT_B_ID = 'f5555555-0000-4000-8000-000000000011';
const OTHER_TENANT_CONTACT_ID = 'f5555555-0000-4000-8000-000000000099';
const USER_ID = 'a0000000-0000-4000-8000-000000000001';

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
    scheduledDate: '2027-06-01',
    timeSlot: '09:00-10:00',
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
    ...overrides,
  };
}

const basePayload = {
  branchId: BRANCH_ID,
  propertyId: PROPERTY_ID,
  serviceTypeId: SERVICE_TYPE_ID,
  scheduledDate: '2027-06-01',
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

describe('POST /v1/appointments — contacts[] array path (T014)', () => {
  it('201: single contactId → use case receives contactId + isPrimary, response includes junction', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockCreateAppointmentExecute.mockResolvedValue(makeAppointmentResult({
      contacts: [{
        id: 'junction-1', contactId: CONTACT_A_ID, role: 'RENTAL_TENANT', isPrimary: true,
        snapshotName: 'Alice', snapshotEmail: 'alice@example.com', snapshotPhone: null,
      }],
    }));

    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .send({ ...basePayload, contacts: [{ contactId: CONTACT_A_ID, role: 'RENTAL_TENANT', isPrimary: true }] });

    expect(res.status).toBe(201);
    expect(res.body.data.contacts[0].contactId).toBe(CONTACT_A_ID);
    expect(res.body.data.contacts[0].isPrimary).toBe(true);
    expect(mockCreateAppointmentExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        contacts: expect.arrayContaining([
          expect.objectContaining({ contactId: CONTACT_A_ID, isPrimary: true }),
        ]),
      }),
    );
  });

  it('201: inline contact → use case receives inline payload, response includes junction', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockCreateAppointmentExecute.mockResolvedValue(makeAppointmentResult({
      contacts: [{
        id: 'junction-2', contactId: 'new-registry-id-00000000001', role: 'RENTAL_TENANT', isPrimary: true,
        snapshotName: 'Bob Inline', snapshotEmail: 'bob@inline.com', snapshotPhone: null,
      }],
    }));

    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .send({
        ...basePayload,
        contacts: [{
          inline: { type: 'RENTAL_TENANT', displayName: 'Bob Inline', primaryEmail: 'bob@inline.com' },
          role: 'RENTAL_TENANT',
          isPrimary: true,
        }],
      });

    expect(res.status).toBe(201);
    expect(mockCreateAppointmentExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        contacts: expect.arrayContaining([
          expect.objectContaining({ inline: expect.objectContaining({ displayName: 'Bob Inline' }) }),
        ]),
      }),
    );
  });

  it('201: two contacts (1 primary, 1 secondary) → both junction rows in response', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockCreateAppointmentExecute.mockResolvedValue(makeAppointmentResult({
      contacts: [
        { id: 'j1', contactId: CONTACT_A_ID, role: 'RENTAL_TENANT', isPrimary: true, snapshotName: 'Alice', snapshotEmail: 'a@example.com', snapshotPhone: null },
        { id: 'j2', contactId: CONTACT_B_ID, role: 'PROPERTY_MANAGER', isPrimary: false, snapshotName: 'Bob', snapshotEmail: 'b@pm.com', snapshotPhone: null },
      ],
    }));

    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .send({
        ...basePayload,
        contacts: [
          { contactId: CONTACT_A_ID, role: 'RENTAL_TENANT', isPrimary: true },
          { contactId: CONTACT_B_ID, role: 'PROPERTY_MANAGER', isPrimary: false },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.contacts).toHaveLength(2);
    const primaryRow = res.body.data.contacts.find((c: { isPrimary: boolean }) => c.isPrimary);
    expect(primaryRow.contactId).toBe(CONTACT_A_ID);
  });

  it('400: no primary in contacts[] → rejected', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockCreateAppointmentExecute.mockRejectedValue(
      new ValidationError('APPOINTMENT_MISSING_PRIMARY_CONTACT', 'Exactly one primary contact required'),
    );

    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .send({
        ...basePayload,
        contacts: [{ contactId: CONTACT_A_ID, role: 'RENTAL_TENANT', isPrimary: false }],
      });

    expect(res.status).toBe(400);
  });

  it('400: two primaries → rejected', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockCreateAppointmentExecute.mockRejectedValue(
      new ValidationError('APPOINTMENT_MULTIPLE_PRIMARY_CONTACTS', 'Only one primary contact is allowed'),
    );

    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .send({
        ...basePayload,
        contacts: [
          { contactId: CONTACT_A_ID, role: 'RENTAL_TENANT', isPrimary: true },
          { contactId: CONTACT_B_ID, role: 'RENTAL_TENANT', isPrimary: true },
        ],
      });

    expect(res.status).toBe(400);
  });

  it('400: contactId from different tenant → APPOINTMENT_CONTACT_NOT_FOUND', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockCreateAppointmentExecute.mockRejectedValue(
      new ValidationError('APPOINTMENT_CONTACT_NOT_FOUND', 'Contact not found in this tenant'),
    );

    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .send({
        ...basePayload,
        contacts: [{ contactId: OTHER_TENANT_CONTACT_ID, role: 'RENTAL_TENANT', isPrimary: true }],
      });

    expect(res.status).toBe(400);
    expect(mockCreateAppointmentExecute).toHaveBeenCalledOnce();
  });

  it('400: inactive contact → APPOINTMENT_CONTACT_INACTIVE', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockCreateAppointmentExecute.mockRejectedValue(
      new ValidationError('APPOINTMENT_CONTACT_INACTIVE', 'Contact is not active'),
    );

    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .send({
        ...basePayload,
        contacts: [{ contactId: CONTACT_A_ID, role: 'RENTAL_TENANT', isPrimary: true }],
      });

    expect(res.status).toBe(400);
    expect(mockCreateAppointmentExecute).toHaveBeenCalledOnce();
  });
});
