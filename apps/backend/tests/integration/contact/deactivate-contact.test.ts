import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import {
  ContactNotFoundError,
} from '../../../src/modules/contact/domain/contact.errors';

/**
 * T029 — Deactivate contact integration tests.
 *
 * The API surface for deactivation is PATCH /v1/contacts/:contactId with
 * { isActive: false }. Listing behaviour (deactivated contacts excluded by
 * default; visible with isActive=false) is verified via the list use case mock.
 */

const mockUpdateContactExecute = vi.fn();
const mockListContactsExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    contact: {
      updateContactUseCase: { execute: mockUpdateContactExecute },
      listContactsUseCase: { execute: mockListContactsExecute },
      jwtService: { verify: mockJwtVerify },
    },
  }),
}));

const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const CONTACT_ID = 'cccccccc-0000-4000-8000-000000000099';

const clAdminContext = { userId: 'cl-admin-1', tenantId: TENANT_A, role: 'CL_ADMIN', branchId: null, inspectorId: null };
const clUserContext = { userId: 'cl-user-1', tenantId: TENANT_A, role: 'CL_USER', branchId: null, inspectorId: null };

function makeContact(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTACT_ID,
    tenantId: TENANT_A,
    type: 'TENANT',
    displayName: 'Deactivation Target',
    company: null,
    primaryEmail: 'deact@example.com',
    primaryPhone: null,
    additionalChannels: [],
    notes: null,
    isActive: false,
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
  mockListContactsExecute.mockReset();
});

describe('Deactivate contact — T029', () => {
  it('success: PATCH isActive=false deactivates an active contact', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockUpdateContactExecute.mockResolvedValue(makeContact());

    const res = await supertest(app.server)
      .patch(`/v1/contacts/${CONTACT_ID}`)
      .set('Authorization', 'Bearer token')
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it('404: deactivating a contact not found in tenant returns 404', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockUpdateContactExecute.mockRejectedValue(new ContactNotFoundError());

    const res = await supertest(app.server)
      .patch(`/v1/contacts/${CONTACT_ID}`)
      .set('Authorization', 'Bearer token')
      .send({ isActive: false });

    expect(res.status).toBe(404);
  });

  it('403: CL_USER cannot deactivate a contact', async () => {
    mockJwtVerify.mockResolvedValue(clUserContext);

    const res = await supertest(app.server)
      .patch(`/v1/contacts/${CONTACT_ID}`)
      .set('Authorization', 'Bearer token')
      .send({ isActive: false });

    expect(res.status).toBe(403);
  });

  it('list: deactivated contact excluded from default list (isActive not specified → use case defaults to true)', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    // Active-only list returns empty (deactivated contact not included)
    mockListContactsExecute.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });

    const res = await supertest(app.server)
      .get('/v1/contacts')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    // The route passes isActive=undefined when not specified; ListContactsUseCase defaults to true internally.
    // Verify the use case was called (with isActive undefined — the default handling is in the use case layer).
    expect(mockListContactsExecute).toHaveBeenCalled();
  });

  it('list: deactivated contact visible with isActive=false filter', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockListContactsExecute.mockResolvedValue({
      data: [{ contact: makeContact({ isActive: false }), propertyCount: 0, primaryInPropertyCount: 0 }],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get('/v1/contacts?isActive=false')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].isActive).toBe(false);
    expect(mockListContactsExecute).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );
  });
});
