import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import {
  ContactEmailAlreadyExistsError,
  ContactPhoneAlreadyExistsError,
} from '../../../src/modules/contact/domain/contact.errors';

const mockCreateContactExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockAuditLog = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auditService: { log: mockAuditLog } as any,
    contact: {
      createContactUseCase: { execute: mockCreateContactExecute },
      jwtService: { verify: mockJwtVerify },
    },
  }),
}));

const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const TENANT_B = 'bbbbbbbb-0000-4000-8000-000000000002';

const amContext = { userId: 'admin-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const opContext = { userId: 'op-1', tenantId: TENANT_A, role: 'OP', branchId: null, inspectorId: null };
// Cross-tenant OP per DEC-003 (tenantId=null in JWT). The new contract
// allows AM/OP with null JWT tenantId to specify a target tenant via body.tenantId.
const opCrossTenantContext = { userId: 'op-cross-1', tenantId: null, role: 'OP', branchId: null, inspectorId: null };
const clAdminContext = { userId: 'cl-admin-1', tenantId: TENANT_A, role: 'CL_ADMIN', branchId: null, inspectorId: null };
const clUserContext = { userId: 'cl-user-1', tenantId: TENANT_A, role: 'CL_USER', branchId: null, inspectorId: null };
const inspContext = { userId: 'insp-1', tenantId: TENANT_A, role: 'INSP', branchId: null, inspectorId: 'insp-1' };

function makeContact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a00',
    tenantId: TENANT_A,
    type: 'TENANT',
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
  mockCreateContactExecute.mockReset();
});

describe('POST /v1/contacts — create-contact', () => {
  it('happy path: CL_ADMIN creates a contact with email', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockCreateContactExecute.mockResolvedValue(makeContact());

    const res = await supertest(app.server)
      .post('/v1/contacts')
      .set('Authorization', 'Bearer token')
      .send({ type: 'TENANT', displayName: 'Alice Smith', primaryEmail: 'alice@example.com' });

    expect(res.status).toBe(201);
    expect(res.body.data.displayName).toBe('Alice Smith');
    expect(mockCreateContactExecute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A, type: 'TENANT', displayName: 'Alice Smith' }),
    );
  });

  it('happy path: AM creates a contact specifying tenantId in body', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockCreateContactExecute.mockResolvedValue(makeContact({ tenantId: TENANT_B }));

    const res = await supertest(app.server)
      .post('/v1/contacts')
      .set('Authorization', 'Bearer token')
      .send({ tenantId: TENANT_B, type: 'BROKER', displayName: 'Bob Jones', primaryPhone: '+61400000001' });

    expect(res.status).toBe(201);
    expect(mockCreateContactExecute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_B }),
    );
  });

  it('happy path: OP creates a contact scoped to own tenant', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    mockCreateContactExecute.mockResolvedValue(makeContact());

    const res = await supertest(app.server)
      .post('/v1/contacts')
      .set('Authorization', 'Bearer token')
      .send({ type: 'PROPERTY_MANAGER', displayName: 'PM One', primaryEmail: 'pm@agency.com' });

    expect(res.status).toBe(201);
    expect(mockCreateContactExecute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
    );
  });

  it('forbidden: CL_USER cannot create a contact (standalone page)', async () => {
    mockJwtVerify.mockResolvedValue(clUserContext);

    const res = await supertest(app.server)
      .post('/v1/contacts')
      .set('Authorization', 'Bearer token')
      .send({ type: 'TENANT', displayName: 'Jane', primaryEmail: 'jane@test.com' });

    expect(res.status).toBe(403);
    expect(mockCreateContactExecute).not.toHaveBeenCalled();
  });

  it('forbidden: INSP cannot create a contact', async () => {
    mockJwtVerify.mockResolvedValue(inspContext);

    const res = await supertest(app.server)
      .post('/v1/contacts')
      .set('Authorization', 'Bearer token')
      .send({ type: 'TENANT', displayName: 'X', primaryEmail: 'x@test.com' });

    expect(res.status).toBe(403);
  });

  it('400: missing all channels (no primaryEmail, no primaryPhone)', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);

    const res = await supertest(app.server)
      .post('/v1/contacts')
      .set('Authorization', 'Bearer token')
      .send({ type: 'TENANT', displayName: 'No Channels' });

    expect(res.status).toBe(400);
  });

  it('409: duplicate email in same tenant returns conflict', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockCreateContactExecute.mockRejectedValue(new ContactEmailAlreadyExistsError());

    const res = await supertest(app.server)
      .post('/v1/contacts')
      .set('Authorization', 'Bearer token')
      .send({ type: 'TENANT', displayName: 'Duplicate', primaryEmail: 'dupe@example.com' });

    expect(res.status).toBe(409);
  });

  it('409: duplicate phone in same tenant returns conflict', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext);
    mockCreateContactExecute.mockRejectedValue(new ContactPhoneAlreadyExistsError());

    const res = await supertest(app.server)
      .post('/v1/contacts')
      .set('Authorization', 'Bearer token')
      .send({ type: 'TENANT', displayName: 'Duplicate Phone', primaryPhone: '+61400000099' });

    expect(res.status).toBe(409);
  });

  it('201: same email in different tenant is allowed (tenant isolation)', async () => {
    // AM creates for TENANT_B — same email as TENANT_A contact is not a conflict
    mockJwtVerify.mockResolvedValue(amContext);
    mockCreateContactExecute.mockResolvedValue(makeContact({ tenantId: TENANT_B }));

    const res = await supertest(app.server)
      .post('/v1/contacts')
      .set('Authorization', 'Bearer token')
      .send({ tenantId: TENANT_B, type: 'TENANT', displayName: 'Cross Tenant', primaryEmail: 'alice@example.com' });

    expect(res.status).toBe(201);
  });

  // Constitution v1.3.0 (op_role_rollback): AM and OP are both cross-tenant
  // operational roles. OP tokens may carry `tenant_id = null` and resolve
  // the target tenant from `body.tenantId` exactly like AM.
  it('OP cross-tenant create: body.tenantId selects the target tenant', async () => {
    mockJwtVerify.mockResolvedValue(opCrossTenantContext);
    mockCreateContactExecute.mockResolvedValue(makeContact({ tenantId: TENANT_B }));

    const res = await supertest(app.server)
      .post('/v1/contacts')
      .set('Authorization', 'Bearer token')
      .send({ tenantId: TENANT_B, type: 'TENANT', displayName: 'Op Cross-Tenant', primaryEmail: 'op-cross@example.com' });

    expect(res.status).toBe(201);
    expect(mockCreateContactExecute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_B }),
    );
  });

  // Defense in depth: CL_ADMIN must not be able to cross tenant via body.tenantId.
  // The route ignores parsed.tenantId for CL roles and uses JWT tenantId.
  it('CL_ADMIN with body.tenantId ≠ JWT → ignored, contact created under JWT tenant', async () => {
    mockJwtVerify.mockResolvedValue(clAdminContext); // tenantId = TENANT_A
    mockCreateContactExecute.mockResolvedValue(makeContact({ tenantId: TENANT_A }));

    const res = await supertest(app.server)
      .post('/v1/contacts')
      .set('Authorization', 'Bearer token')
      .send({ tenantId: TENANT_B, type: 'TENANT', displayName: 'Should Not Cross', primaryEmail: 'hack@example.com' });

    expect(res.status).toBe(201);
    expect(mockCreateContactExecute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
    );
    expect(mockCreateContactExecute).not.toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_B }),
    );
  });
});
