import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { makeAmContext } from '../../helpers/rbac-test-helpers';

const mockUpdateTenantExecute = vi.fn();
const mockUploadLogoExecute = vi.fn();
const mockDeleteLogoExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockAuditLog = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auditService: { log: mockAuditLog } as any,
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: {
      updateTenantUseCase: { execute: mockUpdateTenantExecute },
      uploadTenantLogoUseCase: { execute: mockUploadLogoExecute },
      deleteTenantLogoUseCase: { execute: mockDeleteLogoExecute },
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
const LOGO_URL = `https://cdn.example.com/tenant-branding/tenants/${TENANT_ID}/branding/logo.png`;

/** Real 1×1 transparent PNG. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

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

describe('POST /v1/tenants/:tenantId/branding/logo', () => {
  it('uploads the attached file and returns the public logo URL', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    mockUploadLogoExecute.mockResolvedValueOnce({ logoUrl: LOGO_URL });

    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/branding/logo`)
      .set('Authorization', 'Bearer token')
      .attach('file', TINY_PNG, 'logo.png');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ logoUrl: LOGO_URL });
    expect(mockUploadLogoExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        fileBuffer: expect.any(Buffer),
      }),
    );
    const { fileBuffer } = mockUploadLogoExecute.mock.calls[0]![0];
    expect(Buffer.compare(fileBuffer, TINY_PNG)).toBe(0);
  });

  it('returns 401 without a token', async () => {
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/branding/logo`)
      .attach('file', TINY_PNG, 'logo.png');

    expect(res.status).toBe(401);
    expect(mockUploadLogoExecute).not.toHaveBeenCalled();
  });

  it('returns 400 when no file part is attached', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());

    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/branding/logo`)
      .set('Authorization', 'Bearer token')
      .field('notAFile', 'value');

    expect(res.status).toBe(400);
    expect(mockUploadLogoExecute).not.toHaveBeenCalled();
  });

  it('maps a use-case validation rejection to 400', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    const { LogoFileInvalidError } = await import(
      '../../../src/modules/tenant/domain/tenant.errors'
    );
    mockUploadLogoExecute.mockRejectedValueOnce(new LogoFileInvalidError());

    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/branding/logo`)
      .set('Authorization', 'Bearer token')
      .attach('file', Buffer.from('not an image'), 'logo.png');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('LOGO_FILE_INVALID');
  });
});

describe('DELETE /v1/tenants/:tenantId/branding/logo', () => {
  it('removes the logo and returns deleted: true', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    mockDeleteLogoExecute.mockResolvedValueOnce(undefined);

    const res = await supertest(app.server)
      .delete(`/v1/tenants/${TENANT_ID}/branding/logo`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: true });
    expect(mockDeleteLogoExecute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID }),
    );
  });

  it('returns 401 without a token', async () => {
    const res = await supertest(app.server).delete(
      `/v1/tenants/${TENANT_ID}/branding/logo`,
    );
    expect(res.status).toBe(401);
  });

  it('maps a missing logo to 404', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    const { TenantLogoNotFoundError } = await import(
      '../../../src/modules/tenant/domain/tenant.errors'
    );
    mockDeleteLogoExecute.mockRejectedValueOnce(new TenantLogoNotFoundError());

    const res = await supertest(app.server)
      .delete(`/v1/tenants/${TENANT_ID}/branding/logo`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(404);
  });
});

// The old presign/confirm flow stays retired — the multipart endpoint replaced it.
describe('removed presign/confirm branding routes', () => {
  it('POST .../branding/logo/presign returns 404', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/branding/logo/presign`)
      .set('Authorization', 'Bearer token')
      .send({ contentType: 'image/png' });

    expect(res.status).toBe(404);
  });

  it('POST .../branding/logo/confirm returns 404', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/branding/logo/confirm`)
      .set('Authorization', 'Bearer token')
      .send({ storageKey: `tenants/${TENANT_ID}/branding/logo.png` });

    expect(res.status).toBe(404);
  });
});

describe('PATCH /v1/tenants/:tenantId — immutable settings hardening', () => {
  it('returns 400 when AM tries to set settings.logoUrl via generic PATCH', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    const { ValidationError } = await import('../../../src/shared/domain/errors');
    mockUpdateTenantExecute.mockRejectedValueOnce(
      new ValidationError('settings.logoUrl is not supported.', []),
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
      new ValidationError('settings.logoStorageKey is not supported.', []),
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
