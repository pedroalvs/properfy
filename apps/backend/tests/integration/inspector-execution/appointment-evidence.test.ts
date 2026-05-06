import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { makeAmContext, makeOpContext, makeClAdminContext, makeClUserContext } from '../../helpers/rbac-test-helpers';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const mockListAppointmentAssetsExecute = vi.fn();
const mockGetAppointmentAssetDownloadUrlExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockAuditLog = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auditService: { log: mockAuditLog } as any,
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: { jwtService: { verify: mockJwtVerify } },
    user: { jwtService: { verify: mockJwtVerify } },
    property: { jwtService: { verify: mockJwtVerify } },
    serviceType: { jwtService: { verify: mockJwtVerify } },
    pricingRule: { jwtService: { verify: mockJwtVerify } },
    inspector: { jwtService: { verify: mockJwtVerify } },
    appointment: { jwtService: { verify: mockJwtVerify } },
    audit: { jwtService: { verify: mockJwtVerify } },
    serviceGroup: { jwtService: { verify: mockJwtVerify } },
    marketplace: { jwtService: { verify: mockJwtVerify } },
    tenantPortal: { jwtService: { verify: mockJwtVerify } },
    inspectorExecution: {
      listAppointmentAssetsUseCase: { execute: mockListAppointmentAssetsExecute },
      getAppointmentAssetDownloadUrlUseCase: { execute: mockGetAppointmentAssetDownloadUrlExecute },
      jwtService: { verify: mockJwtVerify },
    },
    billing: { jwtService: { verify: mockJwtVerify } },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const APPOINTMENT_ID = 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55';
const ASSET_ID = 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a77';
const TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const ASSET_STUB = {
  id: ASSET_ID,
  storageKey: `execution/${APPOINTMENT_ID}/photo-${ASSET_ID}.jpg`,
  mimeType: 'image/jpeg',
  sizeBytes: 204800,
  kind: 'PHOTO',
  status: 'UPLOADED',
  originalFilename: 'foto_sala.jpg',
  createdAt: new Date().toISOString(),
};

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

describe('GET /v1/appointments/:appointmentId/assets', () => {
  it('returns 200 with asset list including originalFilename for AM', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    mockListAppointmentAssetsExecute.mockResolvedValueOnce([ASSET_STUB]);

    const res = await supertest(app.server)
      .get(`/v1/appointments/${APPOINTMENT_ID}/assets`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0]).toHaveProperty('originalFilename', 'foto_sala.jpg');
    expect(res.body.data[0]).toHaveProperty('mimeType', 'image/jpeg');
    expect(res.body.data[0]).toHaveProperty('sizeBytes', 204800);
    expect(res.body.data[0]).toHaveProperty('createdAt');
  });

  it('returns 200 for OP', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeOpContext());
    mockListAppointmentAssetsExecute.mockResolvedValueOnce([ASSET_STUB]);

    const res = await supertest(app.server)
      .get(`/v1/appointments/${APPOINTMENT_ID}/assets`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
  });

  it('returns 403 for CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeClAdminContext(TENANT_ID));
    mockListAppointmentAssetsExecute.mockRejectedValueOnce(
      new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions'),
    );

    const res = await supertest(app.server)
      .get(`/v1/appointments/${APPOINTMENT_ID}/assets`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(403);
  });

  it('returns 403 for CL_USER', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeClUserContext(TENANT_ID, []));
    mockListAppointmentAssetsExecute.mockRejectedValueOnce(
      new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions'),
    );

    const res = await supertest(app.server)
      .get(`/v1/appointments/${APPOINTMENT_ID}/assets`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server)
      .get(`/v1/appointments/${APPOINTMENT_ID}/assets`);

    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid appointmentId', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());

    const res = await supertest(app.server)
      .get('/v1/appointments/not-a-uuid/assets')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(400);
  });
});

describe('GET /v1/appointments/:appointmentId/assets/:assetId/download', () => {
  it('returns 200 with downloadUrl for AM', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    mockGetAppointmentAssetDownloadUrlExecute.mockResolvedValueOnce({
      downloadUrl: 'https://supabase.example/signed-download',
      fileName: 'foto_sala.jpg',
      mimeType: 'image/jpeg',
    });

    const res = await supertest(app.server)
      .get(`/v1/appointments/${APPOINTMENT_ID}/assets/${ASSET_ID}/download`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('downloadUrl');
  });

  it('returns 200 with downloadUrl for OP', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeOpContext());
    mockGetAppointmentAssetDownloadUrlExecute.mockResolvedValueOnce({
      downloadUrl: 'https://supabase.example/signed-download',
      fileName: 'foto_sala.jpg',
      mimeType: 'image/jpeg',
    });

    const res = await supertest(app.server)
      .get(`/v1/appointments/${APPOINTMENT_ID}/assets/${ASSET_ID}/download`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
  });

  it('returns 403 for CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeClAdminContext(TENANT_ID));
    mockGetAppointmentAssetDownloadUrlExecute.mockRejectedValueOnce(
      new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions'),
    );

    const res = await supertest(app.server)
      .get(`/v1/appointments/${APPOINTMENT_ID}/assets/${ASSET_ID}/download`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server)
      .get(`/v1/appointments/${APPOINTMENT_ID}/assets/${ASSET_ID}/download`);

    expect(res.status).toBe(401);
  });
});
