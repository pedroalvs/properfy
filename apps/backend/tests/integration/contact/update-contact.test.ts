import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import {
  ContactNotFoundError,
  ContactEmailAlreadyExistsError,
} from '../../../src/modules/contact/domain/contact.errors';

const mockUpdateContactExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    contact: {
      updateContactUseCase: { execute: mockUpdateContactExecute },
      jwtService: { verify: mockJwtVerify },
    },
  }),
}));

const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const CONTACT_ID = 'cccccccc-0000-4000-8000-000000000001';

const clAdminContext = { userId: 'cl-admin-1', tenantId: TENANT_A, role: 'CL_ADMIN', branchId: null, inspectorId: null };
const opContext = { userId: 'op-1', tenantId: TENANT_A, role: 'OP', branchId: null, inspectorId: null };
const clUserContext = { userId: 'cl-user-1', tenantId: TENANT_A, role: 'CL_USER', branchId: null, inspectorId: null };

function makeContact(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTACT_ID,
    tenantId: TENANT_A,
    type: 'RENTAL_TENANT',
    displayName: 'Alice Smith',
    company: null,
    primaryEmail: 'alice@example.com',
    primaryPhone: null,
    additionalChannels: [],
    notes: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
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
beforeEach(() => {
  vi.clearAllMocks();
  mockJwtVerify.mockReset();
  mockUpdateContactExecute.mockReset();
});

describe('PATCH /v1/contacts/:contactId — update-contact', () => {
  it('happy path: CL_ADMIN updates display name', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockUpdateContactExecute.mockResolvedValue(makeContact({ displayName: 'Alice Updated' }));

    const res = await supertest(app.server)
      .patch(`/v1/contacts/${CONTACT_ID}`)
      .set('Authorization', 'Bearer token')
      .send({ displayName: 'Alice Updated' });

    expect(res.status).toBe(200);
    expect(res.body.data.displayName).toBe('Alice Updated');
    expect(mockUpdateContactExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: CONTACT_ID,
        tenantId: TENANT_A,
        data: expect.objectContaining({ displayName: 'Alice Updated' }),
      }),
    );
  });

  it('happy path: OP can update a contact', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    mockUpdateContactExecute.mockResolvedValue(makeContact({ displayName: 'OP Updated' }));

    const res = await supertest(app.server)
      .patch(`/v1/contacts/${CONTACT_ID}`)
      .set('Authorization', 'Bearer token')
      .send({ displayName: 'OP Updated' });

    expect(res.status).toBe(200);
  });

  it('404: contact not found in own tenant returns 404', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockUpdateContactExecute.mockRejectedValue(new ContactNotFoundError());

    const res = await supertest(app.server)
      .patch(`/v1/contacts/${CONTACT_ID}`)
      .set('Authorization', 'Bearer token')
      .send({ displayName: 'Ghost' });

    expect(res.status).toBe(404);
  });

  it('409: changing email to conflicting value returns 409', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockUpdateContactExecute.mockRejectedValue(new ContactEmailAlreadyExistsError());

    const res = await supertest(app.server)
      .patch(`/v1/contacts/${CONTACT_ID}`)
      .set('Authorization', 'Bearer token')
      .send({ primaryEmail: 'taken@example.com' });

    expect(res.status).toBe(409);
  });

  it('deactivation: setting isActive=false returns 200 with isActive false', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockUpdateContactExecute.mockResolvedValue(makeContact({ isActive: false }));

    const res = await supertest(app.server)
      .patch(`/v1/contacts/${CONTACT_ID}`)
      .set('Authorization', 'Bearer token')
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
    expect(mockUpdateContactExecute).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isActive: false }) }),
    );
  });

  it('reactivation: setting isActive=true returns 200 with isActive true', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockUpdateContactExecute.mockResolvedValue(makeContact({ isActive: true }));

    const res = await supertest(app.server)
      .patch(`/v1/contacts/${CONTACT_ID}`)
      .set('Authorization', 'Bearer token')
      .send({ isActive: true });

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(true);
  });

  it('403: CL_USER cannot update a contact', async () => {
    mockJwtVerify.mockResolvedValue(clUserContext);

    const res = await supertest(app.server)
      .patch(`/v1/contacts/${CONTACT_ID}`)
      .set('Authorization', 'Bearer token')
      .send({ displayName: 'Unauthorized' });

    expect(res.status).toBe(403);
    expect(mockUpdateContactExecute).not.toHaveBeenCalled();
  });
});

describe('PATCH /v1/contacts/:contactId — AU phone validation and E.164 normalization', () => {
  it('normalizes masked local primaryPhone to E.164 before reaching the use case', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockUpdateContactExecute.mockResolvedValue(makeContact({ primaryPhone: '+61412345678' }));

    const res = await supertest(app.server)
      .patch(`/v1/contacts/${CONTACT_ID}`)
      .set('Authorization', 'Bearer token')
      .send({ primaryPhone: '0412 345 678' });

    expect(res.status).toBe(200);
    expect(mockUpdateContactExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ primaryPhone: '+61412345678' }),
      }),
    );
  });

  it('rejects invalid primaryPhone with 400 (legacy values must be corrected on edit)', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);

    const res = await supertest(app.server)
      .patch(`/v1/contacts/${CONTACT_ID}`)
      .set('Authorization', 'Bearer token')
      .send({ primaryPhone: '12345' });

    expect(res.status).toBe(400);
    expect(mockUpdateContactExecute).not.toHaveBeenCalled();
  });
});
