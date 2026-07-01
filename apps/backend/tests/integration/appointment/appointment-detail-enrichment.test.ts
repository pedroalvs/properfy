import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

/**
 * T017 — Integration tests for enriched appointment detail response (FR-080).
 *
 * Verifies: contacts[] in response with primary-first ordering, PM live contact
 * data when contactId IS NOT NULL, keyRequired/keyLocation fields, and legacy
 * junction rows (contactId = null) returning snapshot data.
 */

const mockGetAppointmentExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    appointment: {
      getAppointmentUseCase: { execute: mockGetAppointmentExecute },
      jwtService: { verify: mockJwtVerify },
      tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true, settingsJson: {} }) },
    },
  }),
}));

const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000004';
const BRANCH_ID = 'b1111111-0000-4000-8000-000000000004';
const PROPERTY_ID = 'c2222222-0000-4000-8000-000000000004';
const SERVICE_TYPE_ID = 'd3333333-0000-4000-8000-000000000004';
const APPOINTMENT_ID = 'e4444444-0000-4000-8000-000000000004';
const TENANT_CONTACT_ID = 'f5555555-0000-4000-8000-000000000040';
const PM_CONTACT_ID = 'f5555555-0000-4000-8000-000000000041';
const USER_ID = 'a0000000-0000-4000-8000-000000000004';

const opContext = { userId: USER_ID, tenantId: TENANT_A, role: 'OP', branchId: null, inspectorId: null };

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
    scheduledDate: '2027-09-01',
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
    ...overrides,
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

describe('GET /v1/appointments/:id — enriched detail response (T017)', () => {
  it('200: contacts[] ordered primary-first with correct shape per junction', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    mockGetAppointmentExecute.mockResolvedValue(makeAppointmentResult({
      contacts: [
        // primary first
        { id: 'j-primary', contactId: TENANT_CONTACT_ID, role: 'RENTAL_TENANT', isPrimary: true, snapshotName: 'Alice Primary', snapshotEmail: 'alice@example.com', snapshotPhone: '+61400000001' },
        // secondary second
        { id: 'j-secondary', contactId: PM_CONTACT_ID, role: 'PROPERTY_MANAGER', isPrimary: false, snapshotName: 'Bob PM', snapshotEmail: 'bob@pm.com', snapshotPhone: '+61400000002' },
      ],
    }));

    const res = await supertest(app.server)
      .get(`/v1/appointments/${APPOINTMENT_ID}`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    const contacts = res.body.data.contacts;
    expect(contacts).toHaveLength(2);
    expect(contacts[0].isPrimary).toBe(true);
    expect(contacts[0].role).toBe('RENTAL_TENANT');
    expect(contacts[1].isPrimary).toBe(false);
    expect(contacts[1].role).toBe('PROPERTY_MANAGER');
  });

  it('200: PM junction row includes liveContact data when contactId IS NOT NULL', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    mockGetAppointmentExecute.mockResolvedValue(makeAppointmentResult({
      contacts: [
        {
          id: 'j-tenant', contactId: TENANT_CONTACT_ID, role: 'RENTAL_TENANT', isPrimary: true,
          snapshotName: 'Alice', snapshotEmail: 'alice@example.com', snapshotPhone: null,
        },
        {
          id: 'j-pm', contactId: PM_CONTACT_ID, role: 'PROPERTY_MANAGER', isPrimary: false,
          snapshotName: 'Bob PM (snapshot)', snapshotEmail: 'bobold@pm.com', snapshotPhone: '+61400000002',
          liveContact: {
            displayName: 'Bob PM (live)',
            primaryEmail: 'bobnew@pm.com',
            primaryPhone: '+61400000099',
            company: 'PM Co',
          },
        },
      ],
    }));

    const res = await supertest(app.server)
      .get(`/v1/appointments/${APPOINTMENT_ID}`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    const pmContact = res.body.data.contacts.find((c: { role: string }) => c.role === 'PROPERTY_MANAGER');
    expect(pmContact).toBeDefined();
    expect(pmContact.liveContact.displayName).toBe('Bob PM (live)');
    expect(pmContact.liveContact.primaryEmail).toBe('bobnew@pm.com');
    expect(pmContact.liveContact.company).toBe('PM Co');
  });

  it('200: keyRequired and keyLocation present in response', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    mockGetAppointmentExecute.mockResolvedValue(makeAppointmentResult({
      keyRequired: true,
      keyLocation: 'Lockbox at front door',
      contacts: [{ id: 'j1', contactId: TENANT_CONTACT_ID, role: 'RENTAL_TENANT', isPrimary: true, snapshotName: 'Alice', snapshotEmail: 'alice@example.com', snapshotPhone: null }],
    }));

    const res = await supertest(app.server)
      .get(`/v1/appointments/${APPOINTMENT_ID}`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.data.keyRequired).toBe(true);
    expect(res.body.data.keyLocation).toBe('Lockbox at front door');
  });

  it('200: legacy junction row (contactId = null) returns snapshot data without liveContact', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    mockGetAppointmentExecute.mockResolvedValue(makeAppointmentResult({
      contacts: [{
        id: 'j-legacy',
        contactId: null,
        role: 'RENTAL_TENANT',
        isPrimary: true,
        snapshotName: 'Legacy Tenant Name',
        snapshotEmail: 'legacy@example.com',
        snapshotPhone: '+61400000050',
        liveContact: null,
      }],
    }));

    const res = await supertest(app.server)
      .get(`/v1/appointments/${APPOINTMENT_ID}`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    const legacyContact = res.body.data.contacts[0];
    expect(legacyContact.contactId).toBeNull();
    expect(legacyContact.snapshotName).toBe('Legacy Tenant Name');
    expect(legacyContact.snapshotEmail).toBe('legacy@example.com');
    expect(legacyContact.snapshotPhone).toBe('+61400000050');
    expect(legacyContact.liveContact).toBeNull();
  });

  it('200: GET returns appointmentId from params, use case called with correct appointmentId', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    mockGetAppointmentExecute.mockResolvedValue(makeAppointmentResult());

    await supertest(app.server)
      .get(`/v1/appointments/${APPOINTMENT_ID}`)
      .set('Authorization', 'Bearer token');

    expect(mockGetAppointmentExecute).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: APPOINTMENT_ID }),
    );
  });
});
