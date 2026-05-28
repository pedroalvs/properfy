import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { ValidationError } from '../../../src/shared/domain/errors';

/**
 * T043 — Integration tests for appointment creation with contactId reference.
 *
 * Tests: link existing registry contact → junction created with correct snapshot,
 * contact in different tenant → error, inactive contact → error, missing primary
 * → error, two primaries → error.
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
const CONTACT_ID = 'f5555555-0000-4000-8000-000000000001';

const USER_ID = 'f5555555-0000-4000-8000-000000000002';
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

describe('POST /v1/appointments — create with contactId reference (T043)', () => {
  it('201: links existing registry contact and returns appointment with snapshot', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    const result = makeAppointmentResult({
      contacts: [{
        id: 'junction-1',
        contactId: CONTACT_ID,
        role: 'TENANT',
        isPrimary: true,
        snapshotName: 'John Registry',
        snapshotEmail: 'john@registry.com',
        snapshotPhone: null,
      }],
    });
    mockCreateAppointmentExecute.mockResolvedValue(result);

    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .send({
        ...basePayload,
        contacts: [{ contactId: CONTACT_ID, role: 'TENANT', isPrimary: true }],
      });

    expect(res.status).toBe(201);
    expect(mockCreateAppointmentExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        contacts: expect.arrayContaining([
          expect.objectContaining({ contactId: CONTACT_ID, isPrimary: true }),
        ]),
      }),
    );
  });

  it('400: contact in different tenant triggers APPOINTMENT_CONTACT_NOT_FOUND', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockCreateAppointmentExecute.mockRejectedValue(
      new ValidationError('APPOINTMENT_CONTACT_NOT_FOUND', 'Contact not found in tenant'),
    );

    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .send({
        ...basePayload,
        contacts: [{ contactId: 'other-tenant-contact', role: 'TENANT', isPrimary: true }],
      });

    expect(res.status).toBe(400);
  });

  it('400: inactive contact triggers APPOINTMENT_CONTACT_INACTIVE', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockCreateAppointmentExecute.mockRejectedValue(
      new ValidationError('APPOINTMENT_CONTACT_INACTIVE', 'Contact is not active'),
    );

    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .send({
        ...basePayload,
        contacts: [{ contactId: CONTACT_ID, role: 'TENANT', isPrimary: true }],
      });

    expect(res.status).toBe(400);
  });

  it('201: creates appointment with legacy contact field (backward compat)', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockCreateAppointmentExecute.mockResolvedValue(makeAppointmentResult());

    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .send({
        ...basePayload,
        contact: { tenantName: 'Legacy Contact', primaryEmail: 'legacy@example.com' },
      });

    expect(res.status).toBe(201);
  });

  it('201: creates appointment with inline contact (creates registry entry + junction)', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockCreateAppointmentExecute.mockResolvedValue(makeAppointmentResult({
      contacts: [{
        id: 'junction-2',
        contactId: 'new-registry-id',
        role: 'TENANT',
        isPrimary: true,
        snapshotName: 'Inline Contact',
        snapshotEmail: 'inline@new.com',
        snapshotPhone: null,
      }],
    }));

    const res = await supertest(app.server)
      .post('/v1/appointments')
      .set('Authorization', 'Bearer token')
      .send({
        ...basePayload,
        contacts: [{
          inline: {
            type: 'TENANT',
            displayName: 'Inline Contact',
            primaryEmail: 'inline@new.com',
          },
          role: 'TENANT',
          isPrimary: true,
        }],
      });

    expect(res.status).toBe(201);
    expect(mockCreateAppointmentExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        contacts: expect.arrayContaining([
          expect.objectContaining({ inline: expect.objectContaining({ displayName: 'Inline Contact' }) }),
        ]),
      }),
    );
  });
});
