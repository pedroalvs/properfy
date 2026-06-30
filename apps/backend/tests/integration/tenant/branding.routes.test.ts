import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { makeAmContext, makeClAdminContext } from '../../helpers/rbac-test-helpers';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const mockGenerateLogoUploadUrlExecute = vi.fn();
const mockConfirmLogoUploadExecute = vi.fn();
const mockUpdateTenantExecute = vi.fn();
const mockGetTenantExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockAuditLog = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auditService: { log: mockAuditLog } as any,
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: {
      generateLogoUploadUrlUseCase: { execute: mockGenerateLogoUploadUrlExecute },
      confirmLogoUploadUseCase: { execute: mockConfirmLogoUploadExecute },
      updateTenantUseCase: { execute: mockUpdateTenantExecute },
      getTenantUseCase: { execute: mockGetTenantExecute },
      jwtService: { verify: mockJwtVerify },
    },
    user: { jwtService: { verify: mockJwtVerify } },
    property: { jwtService: { verify: mockJwtVerify } },
    serviceType: { jwtService: { verify: mockJwtVerify } },
    pricingRule: { jwtService: { verify: mockJwtVerify } },
    inspector: { jwtService: { verify: mockJwtVerify } },
    appointment: { jwtService: { verify: mockJwtVerify } },
    audit: { jwtService: { verify: mockJwtVerify } },
    serviceGroup: { jwtService: { verify: mockJwtVerify } },
    marketplace: { jwtService: { verify: mockJwtVerify } },
    rentalTenantPortal: { jwtService: { verify: mockJwtVerify } },
    inspectorExecution: { jwtService: { verify: mockJwtVerify } },
    billing: { jwtService: { verify: mockJwtVerify } },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /v1/tenants/:tenantId/branding/presign', () => {
  it('returns 200 with uploadUrl and storageKey for AM', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    mockGenerateLogoUploadUrlExecute.mockResolvedValueOnce({
      uploadUrl: 'https://supabase.example/signed-upload',
      storageKey: `tenants/${TENANT_ID}/branding/logo.png`,
    });

    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/branding/logo/presign`)
      .set('Authorization', 'Bearer token')
      .send({ contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('uploadUrl');
    expect(res.body.data).toHaveProperty('storageKey');
  });

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/branding/logo/presign`)
      .send({ contentType: 'image/png' });

    expect(res.status).toBe(401);
  });

  it('returns 403 for CL_ADMIN of a different tenant', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeClAdminContext('other-tenant-id-0000000000000000'));
    mockGenerateLogoUploadUrlExecute.mockRejectedValueOnce(
      new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions'),
    );

    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/branding/logo/presign`)
      .set('Authorization', 'Bearer token')
      .send({ contentType: 'image/png' });

    expect(res.status).toBe(403);
  });
});

describe('POST /v1/tenants/:tenantId/branding/confirm', () => {
  it('returns 200 on successful confirm for AM', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    mockConfirmLogoUploadExecute.mockResolvedValueOnce({
      logoUrl: 'https://public.supabase.example/tenant-branding/logo.png',
    });

    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/branding/logo/confirm`)
      .set('Authorization', 'Bearer token')
      .send({ storageKey: `tenants/${TENANT_ID}/branding/logo.png` });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('logoUrl');
  });

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/branding/logo/confirm`)
      .send({ storageKey: `tenants/${TENANT_ID}/branding/logo.png` });

    expect(res.status).toBe(401);
  });
});

describe('PATCH /v1/tenants/:tenantId — immutable settings hardening', () => {
  it('returns 400 when AM tries to set settings.logoUrl via generic PATCH', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    const { ValidationError } = await import('../../../src/shared/domain/errors');
    mockUpdateTenantExecute.mockRejectedValueOnce(
      new ValidationError('settings.logoUrl cannot be set via this endpoint. Use the logo upload flow.', []),
    );

    const res = await supertest(app.server)
      .patch(`/v1/tenants/${TENANT_ID}`)
      .set('Authorization', 'Bearer token')
      .send({ settings: { logoUrl: 'https://evil.example/logo.png' } });

    expect(res.status).toBe(400);
  });

  it('returns 400 when AM tries to set settings.logoStorageKey via generic PATCH', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    const { ValidationError } = await import('../../../src/shared/domain/errors');
    mockUpdateTenantExecute.mockRejectedValueOnce(
      new ValidationError('settings.logoStorageKey cannot be set via this endpoint. Use the logo upload flow.', []),
    );

    const res = await supertest(app.server)
      .patch(`/v1/tenants/${TENANT_ID}`)
      .set('Authorization', 'Bearer token')
      .send({ settings: { logoStorageKey: 'tenants/x/branding/logo.png' } });

    expect(res.status).toBe(400);
  });

  it('allows AM to update non-immutable settings via generic PATCH', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    mockUpdateTenantExecute.mockResolvedValueOnce({
      id: TENANT_ID,
      name: 'Acme',
      legalName: 'Acme Pty Ltd',
      status: 'ACTIVE',
      timezone: 'Australia/Sydney',
      currency: 'AUD',
      appointmentCodePrefix: null,
      settingsJson: { timezone: 'Australia/Sydney' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await supertest(app.server)
      .patch(`/v1/tenants/${TENANT_ID}`)
      .set('Authorization', 'Bearer token')
      .send({ settings: { timezone: 'Australia/Sydney' } });

    expect(res.status).toBe(200);
  });
});
