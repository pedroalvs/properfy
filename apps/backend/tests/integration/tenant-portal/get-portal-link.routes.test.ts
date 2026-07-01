/**
 * C3 — GET /v1/appointments/:appointmentId/portal-link route contract test.
 *
 * Verifies the HTTP layer for the "Copy Portal Link" endpoint:
 *   - 200 with { portalUrl, expiresAt } on happy path
 *   - 404 NO_ACTIVE_PORTAL_TOKEN when appointment has no active confirmation cycle
 *   - 409 PORTAL_TOKEN_NOT_DECRYPTABLE when token exists but rawTokenEncrypted is null
 *   - 403 FORBIDDEN when actor is CL_ADMIN or INSP (use case rejects the role)
 *   - 404 APPOINTMENT_NOT_FOUND when OP queries a cross-tenant appointment (tenant scope hides resource)
 *
 * Uses mock-container + supertest (consistent with all other route integration tests in this project).
 * The service-layer atomicity contracts are tested in C1 and C2 against a real DB.
 *
 * Note: the route guard `if (!container.getPortalLinkUseCase)` is bypassed by always
 * supplying the mock — this tests the feature's live code path.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { AppointmentNotFoundError } from '../../../src/modules/appointment/domain/appointment.errors';
import { NoActivePortalTokenError } from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal.errors';
import { PortalTokenNotDecryptableError } from '../../../src/modules/appointment/domain/confirmation-cycle.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const mockGetPortalLinkExecute = vi.fn();
const mockJwtVerify = vi.fn();

const APPOINTMENT_ID = 'a0000000-0000-4000-8000-000000000001';
const TOKEN_ID = 'b0000000-0000-4000-8000-000000000002';
const PORTAL_URL = 'https://portal.properfy.com/rental-tenant-portal/raw-token-abc';
const EXPIRES_AT = '2026-08-01T00:00:00.000Z';

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: { jwtService: { verify: mockJwtVerify } },
    user: { jwtService: { verify: mockJwtVerify } },
    property: { jwtService: { verify: mockJwtVerify } },
    serviceType: { jwtService: { verify: mockJwtVerify } },
    pricingRule: { jwtService: { verify: mockJwtVerify } },
    inspector: { jwtService: { verify: mockJwtVerify } },
    appointment: {
      jwtService: { verify: mockJwtVerify },
      tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true, settingsJson: {} }) },
      getPortalLinkUseCase: { execute: mockGetPortalLinkExecute },
    },
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

const AM_ACTOR = { userId: 'user-am', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const OP_ACTOR = { userId: 'user-op', tenantId: 'tenant-1', role: 'OP', branchId: null, inspectorId: null };
const CL_ADMIN_ACTOR = { userId: 'user-cl', tenantId: 'tenant-1', role: 'CL_ADMIN', branchId: null, inspectorId: null };
const INSP_ACTOR = { userId: 'user-insp', tenantId: null, role: 'INSP', branchId: null, inspectorId: 'insp-1' };

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });
beforeEach(() => { vi.clearAllMocks(); });

describe('GET /v1/appointments/:appointmentId/portal-link', () => {
  describe('200 — happy path', () => {
    it('returns portalUrl and expiresAt for AM actor', async () => {
      mockJwtVerify.mockResolvedValueOnce(AM_ACTOR);
      mockGetPortalLinkExecute.mockResolvedValueOnce({ portalUrl: PORTAL_URL, expiresAt: EXPIRES_AT });

      const res = await supertest(app.server)
        .get(`/v1/appointments/${APPOINTMENT_ID}/portal-link`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.portalUrl).toBe(PORTAL_URL);
      expect(res.body.data.expiresAt).toBe(EXPIRES_AT);
      expect(mockGetPortalLinkExecute).toHaveBeenCalledWith(
        expect.objectContaining({ appointmentId: APPOINTMENT_ID }),
      );
    });

    it('returns portalUrl and expiresAt for OP actor', async () => {
      mockJwtVerify.mockResolvedValueOnce(OP_ACTOR);
      mockGetPortalLinkExecute.mockResolvedValueOnce({ portalUrl: PORTAL_URL, expiresAt: EXPIRES_AT });

      const res = await supertest(app.server)
        .get(`/v1/appointments/${APPOINTMENT_ID}/portal-link`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.portalUrl).toContain('/rental-tenant-portal/');
    });
  });

  describe('404 — no active portal token', () => {
    it('returns 404 NO_ACTIVE_PORTAL_TOKEN when appointment has no active cycle', async () => {
      mockJwtVerify.mockResolvedValueOnce(AM_ACTOR);
      mockGetPortalLinkExecute.mockRejectedValueOnce(new NoActivePortalTokenError());

      const res = await supertest(app.server)
        .get(`/v1/appointments/${APPOINTMENT_ID}/portal-link`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NO_ACTIVE_PORTAL_TOKEN');
    });
  });

  describe('404 — appointment not found', () => {
    it('returns 404 APPOINTMENT_NOT_FOUND for missing appointment', async () => {
      mockJwtVerify.mockResolvedValueOnce(AM_ACTOR);
      mockGetPortalLinkExecute.mockRejectedValueOnce(new AppointmentNotFoundError());

      const res = await supertest(app.server)
        .get(`/v1/appointments/${APPOINTMENT_ID}/portal-link`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('APPOINTMENT_NOT_FOUND');
    });

    it('returns 404 (not 403) when OP queries a cross-tenant appointment', async () => {
      // OP has tenantId='tenant-1'; the appointment belongs to 'tenant-2'.
      // The repository finds nothing (tenant scope) → AppointmentNotFoundError (404).
      // This is intentional: we do not leak resource existence to cross-tenant actors.
      mockJwtVerify.mockResolvedValueOnce(OP_ACTOR);
      mockGetPortalLinkExecute.mockRejectedValueOnce(new AppointmentNotFoundError());

      const res = await supertest(app.server)
        .get(`/v1/appointments/${APPOINTMENT_ID}/portal-link`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('APPOINTMENT_NOT_FOUND');
    });
  });

  describe('409 — token not decryptable', () => {
    it('returns 409 PORTAL_TOKEN_NOT_DECRYPTABLE when rawTokenEncrypted is null', async () => {
      mockJwtVerify.mockResolvedValueOnce(AM_ACTOR);
      mockGetPortalLinkExecute.mockRejectedValueOnce(new PortalTokenNotDecryptableError());

      const res = await supertest(app.server)
        .get(`/v1/appointments/${APPOINTMENT_ID}/portal-link`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PORTAL_TOKEN_NOT_DECRYPTABLE');
    });
  });

  describe('403 — unauthorized roles', () => {
    it('returns 403 for CL_ADMIN actor', async () => {
      mockJwtVerify.mockResolvedValueOnce(CL_ADMIN_ACTOR);
      mockGetPortalLinkExecute.mockRejectedValueOnce(
        new ForbiddenError('FORBIDDEN', 'Role not permitted for this action'),
      );

      const res = await supertest(app.server)
        .get(`/v1/appointments/${APPOINTMENT_ID}/portal-link`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(403);
    });

    it('returns 403 for INSP actor', async () => {
      mockJwtVerify.mockResolvedValueOnce(INSP_ACTOR);
      mockGetPortalLinkExecute.mockRejectedValueOnce(
        new ForbiddenError('FORBIDDEN', 'Role not permitted for this action'),
      );

      const res = await supertest(app.server)
        .get(`/v1/appointments/${APPOINTMENT_ID}/portal-link`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(403);
    });

    it('returns 401 without auth token', async () => {
      const res = await supertest(app.server)
        .get(`/v1/appointments/${APPOINTMENT_ID}/portal-link`);

      expect(res.status).toBe(401);
    });
  });

  describe('400 — invalid params', () => {
    it('returns 400 for non-UUID appointmentId', async () => {
      mockJwtVerify.mockResolvedValueOnce(AM_ACTOR);

      const res = await supertest(app.server)
        .get('/v1/appointments/not-a-uuid/portal-link')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(400);
    });
  });
});
