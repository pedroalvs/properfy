import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { ContactNotFoundError } from '../../../src/modules/contact/domain/contact.errors';

/**
 * T032 — Get contact detail integration tests (US5).
 *
 * Tests: success path, not-found (cross-tenant returns 404 not 403),
 * includeAppointments=true returns linked appointments.
 */

const mockGetContactExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    contact: {
      getContactUseCase: { execute: mockGetContactExecute },
      jwtService: { verify: mockJwtVerify },
    },
  }),
}));

const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const CONTACT_ID = 'cccccccc-0000-4000-8000-000000000001';
const APPT_ID = 'eeeeeeee-0000-4000-8000-000000000001';

const clAdminContext = { userId: 'cl-admin-1', tenantId: TENANT_A, role: 'CL_ADMIN', branchId: null, inspectorId: null };
const clUserContext = { userId: 'cl-user-1', tenantId: TENANT_A, role: 'CL_USER', branchId: null, inspectorId: null };

const fullContact = {
  id: CONTACT_ID,
  tenantId: TENANT_A,
  type: 'PROPERTY_MANAGER',
  displayName: 'John Smith',
  company: 'Smith Realty',
  primaryEmail: 'john@smithrealty.com',
  primaryPhone: '+61412345678',
  additionalChannels: [],
  notes: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });
beforeEach(() => {
  vi.clearAllMocks();
  mockJwtVerify.mockReset();
  mockGetContactExecute.mockReset();
});

describe('GET /v1/contacts/:contactId — get-contact (T032)', () => {
  it('success: returns contact detail for CL_ADMIN in own tenant', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockGetContactExecute.mockResolvedValue({ contact: fullContact });

    const res = await supertest(app.server)
      .get(`/v1/contacts/${CONTACT_ID}`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.data.displayName).toBe('John Smith');
    expect(res.body.data.type).toBe('PROPERTY_MANAGER');
  });

  it('404: cross-tenant access returns 404 (not 403) for CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockGetContactExecute.mockRejectedValue(new ContactNotFoundError());

    const res = await supertest(app.server)
      .get(`/v1/contacts/${CONTACT_ID}`)
      .set('Authorization', 'Bearer token');

    // Spec requirement: return 404 not 403 for cross-tenant access
    expect(res.status).toBe(404);
  });

  it('success with includeAppointments=true: returns linked appointments paginated', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockGetContactExecute.mockResolvedValue({
      contact: fullContact,
      appointments: {
        data: [{
          appointmentId: APPT_ID,
          appointmentNumber: 1001,
          status: 'SCHEDULED',
          scheduledDate: new Date('2026-06-01'),
          role: 'PROPERTY_MANAGER',
          isPrimary: true,
          propertyId: 'dddddddd-0000-4000-8000-000000000001',
          propertyCode: 'P-001',
        }],
        total: 1,
        page: 1,
        pageSize: 20,
      },
    });

    const res = await supertest(app.server)
      .get(`/v1/contacts/${CONTACT_ID}?includeAppointments=true`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.data.appointments).toBeDefined();
    expect(res.body.data.appointments.pagination.total).toBe(1);
    expect(res.body.data.appointments.data[0].appointmentId).toBe(APPT_ID);
    expect(res.body.data.appointments.data[0].propertyCode).toBe('P-001');
    expect(mockGetContactExecute).toHaveBeenCalledWith(
      CONTACT_ID,
      TENANT_A,
      expect.objectContaining({ includeAppointments: true }),
    );
  });

  it('CL_USER can read contact detail (read-only access)', async () => {
    mockJwtVerify.mockResolvedValue(clUserContext);
    mockGetContactExecute.mockResolvedValue({ contact: fullContact });

    const res = await supertest(app.server)
      .get(`/v1/contacts/${CONTACT_ID}`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
  });
});
