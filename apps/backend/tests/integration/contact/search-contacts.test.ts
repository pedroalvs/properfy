import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

/**
 * T030 — Search / autocomplete integration tests (US4 + SC-005 / NFR-001).
 *
 * These tests exercise the search query parameter on GET /v1/contacts (which
 * delegates to ListContactsUseCase). The performance case (SC-005) is covered
 * in the real-DB suite at tests/integration/db/contact-search-performance.integration.test.ts
 * because it requires Testcontainers + 500-row seed + wall-clock assertion.
 *
 * All cases here use the mock-container pattern (same as other route integration
 * tests) for speed and isolation.
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
const clAdminA = { userId: 'cl-admin-a', tenantId: TENANT_A, role: 'CL_ADMIN', branchId: null, inspectorId: null };
const clAdminB = { userId: 'cl-admin-b', tenantId: TENANT_B, role: 'CL_ADMIN', branchId: null, inspectorId: null };

let _idSeq = 0;
function uuid(): string {
  _idSeq += 1;
  const hex = _idSeq.toString(16).padStart(4, '0');
  return `cccccccc-0000-4000-8000-00000000${hex}`;
}

function makeContact(_label: string, name: string, email: string | null = null, phone: string | null = null) {
  return {
    id: uuid(),
    tenantId: TENANT_A,
    type: 'TENANT',
    displayName: name,
    company: null,
    primaryEmail: email,
    primaryPhone: phone,
    additionalChannels: [],
    notes: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeListItem(label: string, name: string, email: string | null = null, phone: string | null = null) {
  return { contact: makeContact(label, name, email, phone), propertyCount: 0, primaryInPropertyCount: 0 };
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

describe('GET /v1/contacts?search= — search-contacts (T030)', () => {
  it('search by partial name returns matching contacts', async () => {
    mockJwtVerify.mockResolvedValue(clAdminA);
    const smith = makeListItem('s1', 'John Smith', 'john@smith.com');
    mockListContactsExecute.mockResolvedValue({ data: [smith], total: 1, page: 1, pageSize: 20 });

    const res = await supertest(app.server)
      .get('/v1/contacts?search=smith')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.data[0].displayName).toBe('John Smith');
    expect(mockListContactsExecute).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'smith' }),
    );
  });

  it('search by email fragment returns matching contacts', async () => {
    mockJwtVerify.mockResolvedValue(clAdminA);
    const contact = makeListItem('e1', 'Jane Email', 'jane@domain.com');
    mockListContactsExecute.mockResolvedValue({ data: [contact], total: 1, page: 1, pageSize: 20 });

    const res = await supertest(app.server)
      .get('/v1/contacts?search=domain.com')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(mockListContactsExecute).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'domain.com' }),
    );
  });

  it('search by phone fragment returns matching contacts', async () => {
    mockJwtVerify.mockResolvedValue(clAdminA);
    const contact = makeListItem('p1', 'Phone Guy', null, '+61412345678');
    mockListContactsExecute.mockResolvedValue({ data: [contact], total: 1, page: 1, pageSize: 20 });

    const res = await supertest(app.server)
      .get('/v1/contacts?search=0412')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(mockListContactsExecute).toHaveBeenCalledWith(
      expect.objectContaining({ search: '0412' }),
    );
  });

  it('type filter narrows results when combined with search', async () => {
    mockJwtVerify.mockResolvedValue(clAdminA);
    mockListContactsExecute.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });

    const res = await supertest(app.server)
      .get('/v1/contacts?search=smith&type=PROPERTY_MANAGER')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(mockListContactsExecute).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'smith', type: 'PROPERTY_MANAGER' }),
    );
  });

  it('search returns empty when no match found', async () => {
    mockJwtVerify.mockResolvedValue(clAdminA);
    mockListContactsExecute.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });

    const res = await supertest(app.server)
      .get('/v1/contacts?search=zzznomatch')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('tenant isolation: CL_ADMIN sees only own tenant contacts (search scoped to tenantId)', async () => {
    mockJwtVerify.mockResolvedValue(clAdminA);
    mockListContactsExecute.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });

    await supertest(app.server)
      .get('/v1/contacts?search=smith')
      .set('Authorization', 'Bearer token');

    // Must be scoped to TENANT_A, not TENANT_B
    expect(mockListContactsExecute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
    );
    expect(mockListContactsExecute).not.toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_B }),
    );
  });

  it('AM cross-tenant: AM can search within a specified tenant via tenantId query param', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    const contact = makeListItem('xb1', 'Tenant B Contact', 'xb@b.com');
    mockListContactsExecute.mockResolvedValue({ data: [contact], total: 1, page: 1, pageSize: 20 });

    const res = await supertest(app.server)
      .get(`/v1/contacts?search=tenant&tenantId=${TENANT_B}`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(mockListContactsExecute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_B, search: 'tenant' }),
    );
  });
});

/**
 * Performance case SC-005 / NFR-001:
 *
 * The 500-contact seed + real-DB wall-clock assertion lives in:
 *   tests/integration/db/contact-search-performance.integration.test.ts
 *
 * That file runs only when `pnpm test:integration:db` is invoked (Docker required).
 * The target is < 500 ms response time for a trigram search over 500 contacts,
 * representing a 2.5x margin over the production p95 target of 200 ms.
 */
