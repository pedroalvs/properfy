import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { ValidationError } from '../../../src/shared/domain/errors';

/**
 * T016 — Integration tests for contact replacement via PATCH /v1/appointments/:id.
 *
 * Verifies: full contacts[] replacement (old junctions deleted, new snapshots saved),
 * empty contacts[] is rejected, and omitting contacts key leaves existing contacts untouched.
 */

const mockUpdateAppointmentExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    appointment: {
      updateAppointmentUseCase: { execute: mockUpdateAppointmentExecute },
      jwtService: { verify: mockJwtVerify },
      tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true, settingsJson: {} }) },
    },
  }),
}));

const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000003';
const BRANCH_ID = 'b1111111-0000-4000-8000-000000000003';
const PROPERTY_ID = 'c2222222-0000-4000-8000-000000000003';
const SERVICE_TYPE_ID = 'd3333333-0000-4000-8000-000000000003';
const APPOINTMENT_ID = 'e4444444-0000-4000-8000-000000000003';
const CONTACT_NEW_ID = 'f5555555-0000-4000-8000-000000000030';
const USER_ID = 'a0000000-0000-4000-8000-000000000003';

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
    scheduledDate: '2027-08-01',
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

describe('PATCH /v1/appointments/:id — contacts[] replacement (T016)', () => {
  it('200: contacts[] present → old junctions replaced, new junction in response', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    mockUpdateAppointmentExecute.mockResolvedValue(makeAppointmentResult({
      contacts: [{
        id: 'new-junction-1',
        contactId: CONTACT_NEW_ID,
        role: 'RENTAL_TENANT',
        isPrimary: true,
        snapshotName: 'New Contact',
        snapshotEmail: 'new@example.com',
        snapshotPhone: null,
      }],
    }));

    const res = await supertest(app.server)
      .patch(`/v1/appointments/${APPOINTMENT_ID}`)
      .set('Authorization', 'Bearer token')
      .send({
        contacts: [{ contactId: CONTACT_NEW_ID, role: 'RENTAL_TENANT', isPrimary: true }],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.contacts[0].contactId).toBe(CONTACT_NEW_ID);
    expect(mockUpdateAppointmentExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contacts: expect.arrayContaining([
            expect.objectContaining({ contactId: CONTACT_NEW_ID }),
          ]),
        }),
      }),
    );
  });

  it('400: contacts: [] (empty array) → APPOINTMENT_CONTACTS_REQUIRED', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    mockUpdateAppointmentExecute.mockRejectedValue(
      new ValidationError('APPOINTMENT_CONTACTS_REQUIRED', 'Contacts array must not be empty'),
    );

    const res = await supertest(app.server)
      .patch(`/v1/appointments/${APPOINTMENT_ID}`)
      .set('Authorization', 'Bearer token')
      .send({ contacts: [] });

    expect(res.status).toBe(400);
  });

  it('200: contacts key absent → existing contacts untouched (use case not given contacts field)', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    mockUpdateAppointmentExecute.mockResolvedValue(makeAppointmentResult({
      contacts: [{
        id: 'existing-junction-1',
        contactId: 'f5555555-0000-4000-8000-000000000099',
        role: 'RENTAL_TENANT',
        isPrimary: true,
        snapshotName: 'Existing Contact',
        snapshotEmail: 'existing@example.com',
        snapshotPhone: null,
      }],
    }));

    const res = await supertest(app.server)
      .patch(`/v1/appointments/${APPOINTMENT_ID}`)
      .set('Authorization', 'Bearer token')
      .send({ notes: 'Updated notes only' });

    expect(res.status).toBe(200);
    const callArgs = mockUpdateAppointmentExecute.mock.calls[0][0];
    expect(callArgs.data.contacts).toBeUndefined();
    // Existing contacts returned unchanged from use case
    expect(res.body.data.contacts[0].snapshotName).toBe('Existing Contact');
  });

  it('200: inline contact replacement → use case receives inline payload', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    mockUpdateAppointmentExecute.mockResolvedValue(makeAppointmentResult({
      contacts: [{
        id: 'new-junction-inline',
        contactId: 'new-inline-registry-id-uuid001',
        role: 'RENTAL_TENANT',
        isPrimary: true,
        snapshotName: 'Inline Replacement',
        snapshotEmail: 'inline.replacement@example.com',
        snapshotPhone: null,
      }],
    }));

    const res = await supertest(app.server)
      .patch(`/v1/appointments/${APPOINTMENT_ID}`)
      .set('Authorization', 'Bearer token')
      .send({
        contacts: [{
          inline: { type: 'RENTAL_TENANT', displayName: 'Inline Replacement', primaryEmail: 'inline.replacement@example.com' },
          role: 'RENTAL_TENANT',
          isPrimary: true,
        }],
      });

    expect(res.status).toBe(200);
    expect(mockUpdateAppointmentExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contacts: expect.arrayContaining([
            expect.objectContaining({ inline: expect.objectContaining({ displayName: 'Inline Replacement' }) }),
          ]),
        }),
      }),
    );
  });
});
