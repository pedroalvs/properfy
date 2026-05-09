/**
 * QA-021-HIGH-001: PATCH /v1/contacts/:contactId with invalid body → 400 (not 500).
 * QA-021-HIGH-002: POST /v1/contacts/:contactId/deactivate → 200 with isActive=false.
 * Also covers AM cross-tenant PATCH (Pattern B: null tenantId derived from contact entity).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { ContactNotFoundError } from '../../../src/modules/contact/domain/contact.errors';

const mockUpdateContactExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      contact: {
        updateContactUseCase: { execute: mockUpdateContactExecute },
        jwtService: { verify: mockJwtVerify },
      },
    }),
}));

const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const CONTACT_ID = 'cccccccc-0000-4000-8000-000000000099';

const clAdminContext = { userId: 'cl-admin-1', tenantId: TENANT_A, role: 'CL_ADMIN', branchId: null, inspectorId: null };
const amContext = { userId: 'am-user-01', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const clUserContext = { userId: 'cl-user-1', tenantId: TENANT_A, role: 'CL_USER', branchId: null, inspectorId: null };

function makeContact(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTACT_ID,
    tenantId: TENANT_A,
    type: 'PROPERTY_MANAGER',
    displayName: 'Jane Smith',
    company: null,
    primaryEmail: 'jane@example.com',
    primaryPhone: null,
    additionalChannels: [],
    notes: null,
    isActive: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-04-23T00:00:00.000Z'),
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
  // Fastify-zod schema validation runs before the auth preHandler, so a request
  // that fails body/params validation never consumes its queued JWT mock value.
  // mockClear keeps that queue alive and pollutes subsequent tests — reset it.
  mockJwtVerify.mockReset();
  mockUpdateContactExecute.mockReset();
});

// ---------------------------------------------------------------------------
// QA-021-HIGH-001 — PATCH invalid body returns 400 not 500
// ---------------------------------------------------------------------------

describe('QA-021-HIGH-001 — PATCH /v1/contacts/:contactId invalid body → 400', () => {
  it('invalid displayName type returns 400 VALIDATION_ERROR (not 500)', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);

    const res = await supertest(app.server)
      .patch(`/v1/contacts/${CONTACT_ID}`)
      .set('Authorization', 'Bearer token')
      .send({ displayName: 123 })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockUpdateContactExecute).not.toHaveBeenCalled();
  });

  it('empty body {} is valid (no required fields to patch)', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    mockUpdateContactExecute.mockResolvedValueOnce(makeContact({ isActive: true }));

    await supertest(app.server)
      .patch(`/v1/contacts/${CONTACT_ID}`)
      .set('Authorization', 'Bearer token')
      .send({})
      .expect(200);
  });
});

// ---------------------------------------------------------------------------
// AM Pattern B — PATCH with null tenantId derives from entity
// ---------------------------------------------------------------------------

describe('AM cross-tenant PATCH (Pattern B) — PATCH /v1/contacts/:contactId', () => {
  it('AM with null tenantId can update contact (derives tenantId from contact entity)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUpdateContactExecute.mockResolvedValueOnce(makeContact({ displayName: 'Updated Name', isActive: true }));

    const res = await supertest(app.server)
      .patch(`/v1/contacts/${CONTACT_ID}`)
      .set('Authorization', 'Bearer token')
      .send({ displayName: 'Updated Name' })
      .expect(200);

    expect(res.body.data.displayName).toBe('Updated Name');
    expect(mockUpdateContactExecute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: null }),
    );
  });
});

// ---------------------------------------------------------------------------
// QA-021-HIGH-002 — POST /v1/contacts/:contactId/deactivate
// ---------------------------------------------------------------------------

describe('QA-021-HIGH-002 — POST /v1/contacts/:contactId/deactivate', () => {
  it('CL_ADMIN can deactivate — returns 200 with isActive=false', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    mockUpdateContactExecute.mockResolvedValueOnce(makeContact());

    const res = await supertest(app.server)
      .post(`/v1/contacts/${CONTACT_ID}/deactivate`)
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(res.body.data.isActive).toBe(false);
    expect(mockUpdateContactExecute).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
  });

  it('AM can deactivate — null tenantId, use case called with null', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUpdateContactExecute.mockResolvedValueOnce(makeContact());

    await supertest(app.server)
      .post(`/v1/contacts/${CONTACT_ID}/deactivate`)
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(mockUpdateContactExecute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: null, data: { isActive: false } }),
    );
  });

  it('CL_USER receives 403 — cannot deactivate contacts', async () => {
    mockJwtVerify.mockResolvedValueOnce(clUserContext);

    const res = await supertest(app.server)
      .post(`/v1/contacts/${CONTACT_ID}/deactivate`)
      .set('Authorization', 'Bearer token')
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockUpdateContactExecute).not.toHaveBeenCalled();
  });

  it('returns 404 when contact not found', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    mockUpdateContactExecute.mockRejectedValueOnce(new ContactNotFoundError());

    const res = await supertest(app.server)
      .post(`/v1/contacts/${CONTACT_ID}/deactivate`)
      .set('Authorization', 'Bearer token')
      .expect(404);

    expect(res.body.error).toBeDefined();
  });

  it('double-deactivate is idempotent — returns 200', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    mockUpdateContactExecute.mockResolvedValueOnce(makeContact());

    await supertest(app.server)
      .post(`/v1/contacts/${CONTACT_ID}/deactivate`)
      .set('Authorization', 'Bearer token')
      .expect(200);
  });

  it('empty body with Content-Type: application/json returns 200 (not 500)', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    mockUpdateContactExecute.mockResolvedValueOnce(makeContact());

    await supertest(app.server)
      .post(`/v1/contacts/${CONTACT_ID}/deactivate`)
      .set('Authorization', 'Bearer token')
      .set('Content-Type', 'application/json')
      .expect(200);
  });
});
