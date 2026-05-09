import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockCreateContactExecute = vi.fn();
const mockUpdateContactExecute = vi.fn();
const mockGetContactExecute = vi.fn();
const mockListContactsExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    contact: {
      createContactUseCase: { execute: mockCreateContactExecute },
      updateContactUseCase: { execute: mockUpdateContactExecute },
      getContactUseCase: { execute: mockGetContactExecute },
      listContactsUseCase: { execute: mockListContactsExecute },
      jwtService: { verify: mockJwtVerify },
    },
  }),
}));

const CONTACT_ID = 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a00';
const TENANT_ID = 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01';

const amContext = { userId: 'admin-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const opContext = { userId: 'op-1', tenantId: TENANT_ID, role: 'OP', branchId: null, inspectorId: null };
const clAdminContext = { userId: 'cl-admin-1', tenantId: TENANT_ID, role: 'CL_ADMIN', branchId: null, inspectorId: null };
const clUserContext = { userId: 'cl-user-1', tenantId: TENANT_ID, role: 'CL_USER', branchId: null, inspectorId: null };
const inspContext = { userId: 'insp-1', tenantId: TENANT_ID, role: 'INSP', branchId: null, inspectorId: 'insp-1' };

const fullContact = {
  id: CONTACT_ID,
  tenantId: TENANT_ID,
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
  // Reset queues for per-file spies so a Fastify-zod-validation-failure path
  // doesn't carry a queued JWT mock value into a later test (Fastify validates
  // body/params/query before the auth preHandler runs).
  mockJwtVerify.mockReset();
  mockCreateContactExecute.mockReset();
  mockUpdateContactExecute.mockReset();
  mockGetContactExecute.mockReset();
  mockListContactsExecute.mockReset();
});

describe('POST /v1/contacts', () => {
  it('should create a contact as CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockCreateContactExecute.mockResolvedValue(fullContact);

    const res = await supertest(app.server)
      .post('/v1/contacts')
      .set('Authorization', 'Bearer test-token')
      .send({
        type: 'PROPERTY_MANAGER',
        displayName: 'John Smith',
        primaryEmail: 'john@smithrealty.com',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.displayName).toBe('John Smith');
    expect(mockCreateContactExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        type: 'PROPERTY_MANAGER',
        displayName: 'John Smith',
      }),
    );
  });

  it('should create as AM with specified tenantId', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockCreateContactExecute.mockResolvedValue(fullContact);

    const res = await supertest(app.server)
      .post('/v1/contacts')
      .set('Authorization', 'Bearer test-token')
      .send({
        tenantId: TENANT_ID,
        type: 'TENANT',
        displayName: 'Jane Doe',
        primaryPhone: '+61400000000',
      });

    expect(res.status).toBe(201);
    expect(mockCreateContactExecute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID }),
    );
  });

  it('should reject CL_USER with 403', async () => {
    mockJwtVerify.mockResolvedValue(clUserContext);

    const res = await supertest(app.server)
      .post('/v1/contacts')
      .set('Authorization', 'Bearer test-token')
      .send({
        type: 'TENANT',
        displayName: 'Jane',
        primaryEmail: 'jane@test.com',
      });

    expect(res.status).toBe(403);
    expect(mockCreateContactExecute).not.toHaveBeenCalled();
  });

  it('should reject INSP with 403', async () => {
    mockJwtVerify.mockResolvedValue(inspContext);

    const res = await supertest(app.server)
      .post('/v1/contacts')
      .set('Authorization', 'Bearer test-token')
      .send({
        type: 'TENANT',
        displayName: 'Jane',
        primaryEmail: 'jane@test.com',
      });

    expect(res.status).toBe(403);
  });

  it('should fail with 400 when missing all channels', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);

    const res = await supertest(app.server)
      .post('/v1/contacts')
      .set('Authorization', 'Bearer test-token')
      .send({
        type: 'TENANT',
        displayName: 'No Channels',
      });

    expect(res.status).toBe(400);
  });

  it('should create as OP scoped to own tenant', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    mockCreateContactExecute.mockResolvedValue(fullContact);

    const res = await supertest(app.server)
      .post('/v1/contacts')
      .set('Authorization', 'Bearer test-token')
      .send({
        type: 'BROKER',
        displayName: 'Op Contact',
        primaryEmail: 'op@test.com',
      });

    expect(res.status).toBe(201);
    expect(mockCreateContactExecute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID }),
    );
  });

  it('FR-105a regression: OP cannot escape its tenant via body.tenantId override', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    mockCreateContactExecute.mockResolvedValue(fullContact);

    const FOREIGN_TENANT = 'ffffffff-0000-4000-8000-000000000abc';

    const res = await supertest(app.server)
      .post('/v1/contacts')
      .set('Authorization', 'Bearer test-token')
      .send({
        // Even though OP explicitly tries to create against another tenant,
        // the route MUST scope to the JWT tenantId (TENANT_ID).
        tenantId: FOREIGN_TENANT,
        type: 'BROKER',
        displayName: 'Op Smuggler',
        primaryEmail: 'smuggle@test.com',
      });

    expect(res.status).toBe(201);
    expect(mockCreateContactExecute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID }),
    );
  });
});

describe('PATCH /v1/contacts/:contactId', () => {
  it('should update a contact as CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockUpdateContactExecute.mockResolvedValue({ ...fullContact, displayName: 'Updated Name' });

    const res = await supertest(app.server)
      .patch(`/v1/contacts/${CONTACT_ID}`)
      .set('Authorization', 'Bearer test-token')
      .send({ displayName: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(mockUpdateContactExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: CONTACT_ID,
        tenantId: TENANT_ID,
        data: expect.objectContaining({ displayName: 'Updated Name' }),
      }),
    );
  });

  it('should deactivate a contact', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockUpdateContactExecute.mockResolvedValue({ ...fullContact, isActive: false });

    const res = await supertest(app.server)
      .patch(`/v1/contacts/${CONTACT_ID}`)
      .set('Authorization', 'Bearer test-token')
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(mockUpdateContactExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isActive: false }),
      }),
    );
  });

  it('should return 404 when contact not found', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockUpdateContactExecute.mockResolvedValue(null);

    const res = await supertest(app.server)
      .patch(`/v1/contacts/${CONTACT_ID}`)
      .set('Authorization', 'Bearer test-token')
      .send({ displayName: 'Ghost' });

    expect(res.status).toBe(404);
  });
});

describe('GET /v1/contacts', () => {
  it('should list contacts with pagination and propertyCount per item', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockListContactsExecute.mockResolvedValue({
      data: [{ contact: fullContact, propertyCount: 3 }],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get('/v1/contacts')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].propertyCount).toBe(3);
    expect(res.body.pagination.total).toBe(1);
  });

  it('should allow CL_USER read access', async () => {
    mockJwtVerify.mockResolvedValue(clUserContext);
    mockListContactsExecute.mockResolvedValue({
      data: [{ contact: fullContact, propertyCount: 0 }],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get('/v1/contacts')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
  });

  it('should filter by type', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockListContactsExecute.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });

    const res = await supertest(app.server)
      .get('/v1/contacts?type=PROPERTY_MANAGER')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(mockListContactsExecute).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PROPERTY_MANAGER' }),
    );
  });

  it('should filter by isActive', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockListContactsExecute.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });

    const res = await supertest(app.server)
      .get('/v1/contacts?isActive=false')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(mockListContactsExecute).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );
  });

  it('should search by query', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockListContactsExecute.mockResolvedValue({
      data: [{ contact: fullContact, propertyCount: 1 }],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get('/v1/contacts?search=smith')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(mockListContactsExecute).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'smith' }),
    );
  });
});

describe('GET /v1/contacts/:contactId', () => {
  const APPT_ID = 'aaaaaaaa-1111-4000-8000-000000000010';
  const PROPERTY_ID = 'bbbbbbbb-1111-4000-8000-000000000020';

  it('should return contact detail', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockGetContactExecute.mockResolvedValue({ contact: fullContact });

    const res = await supertest(app.server)
      .get(`/v1/contacts/${CONTACT_ID}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.data.displayName).toBe('John Smith');
  });

  it('should include appointments with pagination + per-item isPrimary/propertyId/propertyCode when requested', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockGetContactExecute.mockResolvedValue({
      contact: fullContact,
      appointments: {
        data: [{
          appointmentId: APPT_ID,
          appointmentNumber: 1001,
          status: 'SCHEDULED',
          scheduledDate: new Date('2026-06-01T10:00:00.000Z'),
          role: 'PROPERTY_MANAGER',
          isPrimary: true,
          propertyId: PROPERTY_ID,
          propertyCode: 'P-001',
        }],
        total: 1,
        page: 1,
        pageSize: 20,
      },
    });

    const res = await supertest(app.server)
      .get(`/v1/contacts/${CONTACT_ID}?includeAppointments=true`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.data.appointments.pagination.total).toBe(1);
    expect(res.body.data.appointments.pagination.page).toBe(1);
    expect(res.body.data.appointments.data[0].isPrimary).toBe(true);
    expect(res.body.data.appointments.data[0].propertyCode).toBe('P-001');
  });

  it('should include properties paginated when includeProperties=true', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockGetContactExecute.mockResolvedValue({
      contact: fullContact,
      properties: {
        data: [{
          propertyId: PROPERTY_ID,
          propertyCode: 'P-001',
          street: '1 Example St',
          suburb: 'Bondi',
          postcode: '2026',
          state: 'NSW',
          appointmentCount: 4,
          isPrimaryInActiveAppointment: true,
        }],
        total: 1,
        page: 1,
        pageSize: 5,
      },
    });

    const res = await supertest(app.server)
      .get(`/v1/contacts/${CONTACT_ID}?includeProperties=true&propertiesPageSize=5`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.data.properties.pagination.pageSize).toBe(5);
    expect(res.body.data.properties.data[0].propertyCode).toBe('P-001');
    expect(mockGetContactExecute).toHaveBeenCalledWith(
      CONTACT_ID,
      TENANT_ID,
      expect.objectContaining({
        includeProperties: true,
        propertiesPagination: expect.objectContaining({ pageSize: 5 }),
      }),
    );
  });

  it('should return 400 when propertiesPageSize exceeds the max(100) cap', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    const res = await supertest(app.server)
      .get(`/v1/contacts/${CONTACT_ID}?includeProperties=true&propertiesPageSize=500`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(400);
    expect(mockGetContactExecute).not.toHaveBeenCalled();
  });

  it('should return 404 for cross-tenant read as CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    const { ContactNotFoundError } = await import('../../../src/modules/contact/domain/contact.errors');
    mockGetContactExecute.mockRejectedValue(new ContactNotFoundError());

    const res = await supertest(app.server)
      .get(`/v1/contacts/${CONTACT_ID}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(404);
  });
});
