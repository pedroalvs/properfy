import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

/**
 * T031 — List contacts integration tests (US6).
 *
 * Tests pagination, type filter, isActive filter, tenant scoping (CL_ADMIN
 * vs AM) and empty result handling.
 */

const mockListContactsExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    contact: {
      listContactsUseCase: { execute: mockListContactsExecute },
      jwtService: { verify: mockJwtVerify },
    },
  }),
}));

const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const TENANT_B = 'bbbbbbbb-0000-4000-8000-000000000002';

const amContext = { userId: 'admin-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const clAdminContext = { userId: 'cl-admin-1', tenantId: TENANT_A, role: 'CL_ADMIN', branchId: null, inspectorId: null };
const clUserContext = { userId: 'cl-user-1', tenantId: TENANT_A, role: 'CL_USER', branchId: null, inspectorId: null };

let _idSeq = 0;
function uuid(): string {
  _idSeq += 1;
  const hex = _idSeq.toString(16).padStart(4, '0');
  return `cccccccc-0000-4000-8000-00000000${hex}`;
}

function makeContact(label: string, type = 'TENANT', isActive = true) {
  return {
    id: uuid(),
    tenantId: TENANT_A,
    type,
    displayName: `Contact ${label}`,
    company: null,
    primaryEmail: `${label}@example.com`,
    primaryPhone: null,
    additionalChannels: [],
    notes: null,
    isActive,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeListItem(
  label: string,
  type = 'TENANT',
  isActive = true,
  propertyCount = 0,
  primaryInPropertyCount = 0,
) {
  return { contact: makeContact(label, type, isActive), propertyCount, primaryInPropertyCount };
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
  mockListContactsExecute.mockReset();
});

describe('GET /v1/contacts — list-contacts (T031)', () => {
  it('returns paginated list with correct metadata + propertyCount', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockListContactsExecute.mockResolvedValue({
      data: [makeListItem('c1', 'TENANT', true, 2), makeListItem('c2', 'TENANT', true, 0)],
      total: 2,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get('/v1/contacts')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].propertyCount).toBe(2);
    expect(res.body.data[1].propertyCount).toBe(0);
    expect(res.body.pagination).toMatchObject({ total: 2, page: 1, pageSize: 20 });
  });

  it('filters by type=PROPERTY_MANAGER', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockListContactsExecute.mockResolvedValue({
      data: [makeListItem('pm-1', 'PROPERTY_MANAGER', true, 1)],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get('/v1/contacts?type=PROPERTY_MANAGER')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(mockListContactsExecute).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PROPERTY_MANAGER' }),
    );
  });

  it('filters by isActive=false to show deactivated contacts', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockListContactsExecute.mockResolvedValue({
      data: [makeListItem('c-inactive', 'TENANT', false, 0)],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get('/v1/contacts?isActive=false')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(mockListContactsExecute).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );
    expect(res.body.data[0].isActive).toBe(false);
  });

  it('tenant scoping: CL_ADMIN lists only own tenant contacts', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockListContactsExecute.mockResolvedValue({
      data: [makeListItem('c1')],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    await supertest(app.server).get('/v1/contacts').set('Authorization', 'Bearer token');

    expect(mockListContactsExecute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
    );
  });

  it('AM can specify a tenantId filter via query param', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockListContactsExecute.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });

    await supertest(app.server)
      .get(`/v1/contacts?tenantId=${TENANT_B}`)
      .set('Authorization', 'Bearer token');

    expect(mockListContactsExecute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_B }),
    );
  });

  it('returns empty data array and total=0 when no contacts exist', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockListContactsExecute.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });

    const res = await supertest(app.server)
      .get('/v1/contacts')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });

  it('CL_USER is allowed to read list (read-only access)', async () => {
    mockJwtVerify.mockResolvedValue(clUserContext);
    mockListContactsExecute.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });

    const res = await supertest(app.server)
      .get('/v1/contacts')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
  });
});
