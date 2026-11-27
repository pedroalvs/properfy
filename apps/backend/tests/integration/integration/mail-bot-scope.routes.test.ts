/**
 * Mail Bot - AutoLabs integration: the inbound API key (scope `bot:mail`) gets
 * read-only access to the three existing GET routes, WITHOUT breaking human JWT
 * access. Matrix per route:
 *   - X-API-Key with bot:mail  → 200 (machine principal, role OP, cross-tenant)
 *   - X-API-Key with bot:fy     → 403 (wrong scope, requireScopeIfMachine)
 *   - Authorization: Bearer …   → 200 (human JWT, scope gate is a no-op)
 *   - X-API-Key invalid/revoked → 401 (api-key middleware, no JWT fallback)
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockListAppointments = vi.fn();
const mockListContacts = vi.fn();
const mockGetContact = vi.fn();
const mockJwtVerify = vi.fn();
const mockFindByHash = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => {
    const apiKeyRepo = { findByHash: mockFindByHash, touchLastUsed: vi.fn(async () => {}) };
    return createMockContainer({
      appointment: {
        listAppointmentsUseCase: { execute: mockListAppointments },
        jwtService: { verify: mockJwtVerify },
        apiKeyRepo,
      },
      contact: {
        listContactsUseCase: { execute: mockListContacts },
        getContactUseCase: { execute: mockGetContact },
        jwtService: { verify: mockJwtVerify },
        apiKeyRepo,
      },
    });
  },
}));

function key(scopes: string[], overrides: Record<string, unknown> = {}) {
  return {
    id: 'k-1',
    name: 'mail',
    keyHash: 'unused',
    prefix: 'pfy_test',
    role: 'OP',
    scopes,
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: new Date(),
    createdById: 'am-1',
    createdAt: new Date(),
    ...overrides,
  };
}

const amContext = { userId: 'admin-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

const CONTACT_ID = 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a00';
const contactEntity = {
  id: CONTACT_ID,
  tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
  type: 'PROPERTY_MANAGER',
  displayName: 'John Smith',
  company: null,
  primaryEmail: 'john@test.com',
  primaryPhone: null,
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
  mockListAppointments.mockResolvedValue({ data: [], total: 0 });
  mockListContacts.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });
  mockGetContact.mockResolvedValue({
    contact: contactEntity,
    appointments: { data: [], total: 0, page: 1, pageSize: 20 },
  });
  mockJwtVerify.mockResolvedValue(amContext);
});

describe('GET /v1/appointments — Mail Bot scope', () => {
  it('200 for a bot:mail key, acting as a cross-tenant OP machine principal', async () => {
    mockFindByHash.mockResolvedValue(key(['bot:mail']));
    const res = await supertest(app.server).get('/v1/appointments?search=Smith').set('X-API-Key', 'pfy_mail');
    expect(res.status).toBe(200);
    expect(mockListAppointments).toHaveBeenCalledWith(
      expect.objectContaining({ actor: expect.objectContaining({ role: 'OP', userId: 'api-key:k-1' }) }),
    );
  });

  it('403 for a bot:fy key (wrong scope)', async () => {
    mockFindByHash.mockResolvedValue(key(['bot:fy']));
    const res = await supertest(app.server).get('/v1/appointments').set('X-API-Key', 'pfy_fy');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_FORBIDDEN_SCOPE');
    expect(mockListAppointments).not.toHaveBeenCalled();
  });

  it('200 for a human JWT (the scope gate is a no-op)', async () => {
    const res = await supertest(app.server).get('/v1/appointments').set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
    expect(mockFindByHash).not.toHaveBeenCalled();
  });

  it('401 for an invalid/revoked key with no JWT fallback', async () => {
    mockFindByHash.mockResolvedValue(null);
    const res = await supertest(app.server).get('/v1/appointments').set('X-API-Key', 'pfy_bad');
    expect(res.status).toBe(401);
    expect(mockListAppointments).not.toHaveBeenCalled();
  });
});

describe('GET /v1/contacts — Mail Bot scope', () => {
  it('200 for a bot:mail key', async () => {
    mockFindByHash.mockResolvedValue(key(['bot:mail']));
    const res = await supertest(app.server).get('/v1/contacts?search=Smith').set('X-API-Key', 'pfy_mail');
    expect(res.status).toBe(200);
    expect(mockListContacts).toHaveBeenCalledWith(
      expect.objectContaining({ actor: { role: 'OP', tenantId: null } }),
    );
  });

  it('403 for a bot:fy key', async () => {
    mockFindByHash.mockResolvedValue(key(['bot:fy']));
    const res = await supertest(app.server).get('/v1/contacts').set('X-API-Key', 'pfy_fy');
    expect(res.status).toBe(403);
    expect(mockListContacts).not.toHaveBeenCalled();
  });

  it('200 for a human JWT', async () => {
    const res = await supertest(app.server).get('/v1/contacts').set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
  });
});

describe('GET /v1/contacts/:id?includeAppointments=true — Mail Bot scope', () => {
  it('200 for a bot:mail key and includes appointments', async () => {
    mockFindByHash.mockResolvedValue(key(['bot:mail']));
    const res = await supertest(app.server)
      .get(`/v1/contacts/${CONTACT_ID}?includeAppointments=true`)
      .set('X-API-Key', 'pfy_mail');
    expect(res.status).toBe(200);
    expect(res.body.data.appointments).toBeDefined();
    expect(mockGetContact).toHaveBeenCalledWith(
      CONTACT_ID,
      null,
      expect.objectContaining({ includeAppointments: true, actor: { role: 'OP', tenantId: null } }),
    );
  });

  it('403 for a bot:fy key', async () => {
    mockFindByHash.mockResolvedValue(key(['bot:fy']));
    const res = await supertest(app.server)
      .get(`/v1/contacts/${CONTACT_ID}?includeAppointments=true`)
      .set('X-API-Key', 'pfy_fy');
    expect(res.status).toBe(403);
    expect(mockGetContact).not.toHaveBeenCalled();
  });
});
