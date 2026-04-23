import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { ValidationError } from '../../../src/shared/domain/errors';

/**
 * Integration tests for the inline contact path in appointment creation.
 * Covers idempotency (reuse existing contact by email/phone), no-channel error,
 * and multi-contact array creation.
 *
 * Complements create-appointment-with-contact.test.ts which covers the
 * basic contactId-reference and single-inline-create cases.
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
const EXISTING_CONTACT_ID = 'f5555555-0000-4000-8000-000000000010';
const USER_ID = 'a0000000-0000-4000-8000-000000000001';

const clAdminContext = {
  userId: USER_ID,
  tenantId: TENANT_A,
  role: 'CL_ADMIN',
  branchId: null,
  inspectorId: null,
};

const basePayload = {
  branchId: BRANCH_ID,
  propertyId: PROPERTY_ID,
  serviceTypeId: SERVICE_TYPE_ID,
  scheduledDate: '2027-06-01',
  timeSlot: '09:00-10:00',
  keyRequired: false,
};

function makeAppointmentResult(contactOverrides: Record<string, unknown>[] = []) {
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
    contacts: contactOverrides,
    restrictions: [],
  };
}

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });
beforeEach(() => { vi.clearAllMocks(); });

describe('POST /v1/appointments — inline contact idempotency (feature 021)', () => {
  it('201: inline contact with email that already exists reuses existing contact (idempotent)', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    // Simulate use case returning the existing contactId in the junction (not a new one)
    mockCreateAppointmentExecute.mockResolvedValue(makeAppointmentResult([{
      id: 'junction-1',
      contactId: EXISTING_CONTACT_ID,
      role: 'TENANT',
      isPrimary: true,
      snapshotName: 'Alice Smith',
      snapshotEmail: 'alice@example.com',
      snapshotPhone: null,
    }]));

    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .send({
        ...basePayload,
        contacts: [{
          inline: {
            type: 'TENANT',
            displayName: 'Alice Smith',
            primaryEmail: 'alice@example.com',
          },
          role: 'TENANT',
          isPrimary: true,
        }],
      });

    expect(res.status).toBe(201);
    // The inline payload must be forwarded to the use case as-is
    expect(mockCreateAppointmentExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        contacts: expect.arrayContaining([
          expect.objectContaining({
            inline: expect.objectContaining({ primaryEmail: 'alice@example.com' }),
          }),
        ]),
      }),
    );
    // Response reflects the reused contact id
    expect(res.body.data.contacts[0].contactId).toBe(EXISTING_CONTACT_ID);
  });

  it('400: inline contact with no email and no phone triggers ContactNoChannelError → 400', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockCreateAppointmentExecute.mockRejectedValue(
      new ValidationError('CONTACT_NO_CHANNEL', 'At least one of primaryEmail or primaryPhone is required'),
    );

    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .send({
        ...basePayload,
        contacts: [{
          inline: { type: 'TENANT', displayName: 'No Channel Contact' },
          role: 'TENANT',
          isPrimary: true,
        }],
      });

    expect(res.status).toBe(400);
    expect(mockCreateAppointmentExecute).toHaveBeenCalledOnce();
  });

  it('201: multiple inline contacts in one request each become junction rows', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockCreateAppointmentExecute.mockResolvedValue(makeAppointmentResult([
      {
        id: 'junction-1',
        contactId: 'cid-1',
        role: 'TENANT',
        isPrimary: true,
        snapshotName: 'Primary Tenant',
        snapshotEmail: 'primary@example.com',
        snapshotPhone: null,
      },
      {
        id: 'junction-2',
        contactId: 'cid-2',
        role: 'PROPERTY_MANAGER',
        isPrimary: false,
        snapshotName: 'Property Manager',
        snapshotEmail: 'pm@example.com',
        snapshotPhone: null,
      },
    ]));

    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .send({
        ...basePayload,
        contacts: [
          {
            inline: { type: 'TENANT', displayName: 'Primary Tenant', primaryEmail: 'primary@example.com' },
            role: 'TENANT',
            isPrimary: true,
          },
          {
            inline: { type: 'PROPERTY_MANAGER', displayName: 'Property Manager', primaryEmail: 'pm@example.com' },
            role: 'PROPERTY_MANAGER',
            isPrimary: false,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.contacts).toHaveLength(2);
    const roles = res.body.data.contacts.map((c: { role: string }) => c.role);
    expect(roles).toContain('TENANT');
    expect(roles).toContain('PROPERTY_MANAGER');
    const primaries = res.body.data.contacts.filter((c: { isPrimary: boolean }) => c.isPrimary);
    expect(primaries).toHaveLength(1);
  });

  it('400: empty contacts array returns APPOINTMENT_CONTACTS_REQUIRED error', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockCreateAppointmentExecute.mockRejectedValue(
      new ValidationError('APPOINTMENT_CONTACTS_REQUIRED', 'At least one contact is required'),
    );

    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .send({ ...basePayload, contacts: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
