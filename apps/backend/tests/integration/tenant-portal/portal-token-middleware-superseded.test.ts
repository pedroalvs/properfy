/**
 * C4 — Portal middleware returns 410 for SUPERSEDED cycle token.
 *
 * When an appointment's confirmation cycle is invalidated (reopen, reject, date
 * change), `ConfirmationCycleService.supersedeCurrent()` marks the associated
 * portal token as SUPERSEDED. The portal-token middleware must then reject any
 * request that presents this stale token with HTTP 410 Gone.
 *
 * Why 410 (not 401/403/404):
 *   - 401 means unauthenticated — the token was once valid, the identity is known.
 *   - 403 means forbidden — implies the resource still exists but access is denied.
 *   - 404 means not found — implies the resource is gone permanently.
 *   - 410 means explicitly gone — communicates that the resource existed but is
 *     permanently unavailable. This is the correct semantic for a cycle that was
 *     superseded by a newer one. Tenant-facing UI can show "A new link has been sent".
 *
 * Tested routes (all behind `portalAuth`):
 *   GET  /v1/rental-tenant-portal/:token       → 410 (portal data)
 *   POST /v1/rental-tenant-portal/:token/confirm → 410 (confirm action)
 *   POST /v1/rental-tenant-portal/:token/reschedule → 410 (reschedule action)
 *
 * Uses mock-container with `tokenRepo.findByTokenHash` returning a SUPERSEDED
 * token entity — the same strategy used by all other portal route tests in this
 * project. The real DB behavior (token marked SUPERSEDED atomically with cycle)
 * is validated in C1.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { RentalTenantPortalTokenEntity } from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal-token.entity';

const mockFindByTokenHash = vi.fn();
const mockHashToken = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
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
    rentalTenantPortal: {
      getPortalDataUseCase: { execute: vi.fn() },
      confirmAppointmentUseCase: { execute: vi.fn() },
      rescheduleRequestUseCase: { execute: vi.fn() },
      updateContactUseCase: { execute: vi.fn() },
      reportUnavailabilityUseCase: { execute: vi.fn() },
      generatePortalTokenUseCase: { execute: vi.fn() },
      tokenRepo: {
        findByTokenHash: mockFindByTokenHash,
        findActiveByAppointmentId: vi.fn(),
        save: vi.fn(),
        updateStatus: vi.fn(),
        updateLastAccessedAt: vi.fn(),
        tryClaim: vi.fn().mockResolvedValue(true),
        releaseClaim: vi.fn(),
        revokeAllForAppointment: vi.fn(),
        expireActiveTokens: vi.fn(),
      },
      tokenService: { generateRawToken: vi.fn(), hashToken: mockHashToken },
      jwtService: { verify: mockJwtVerify },
    },
    inspectorExecution: { jwtService: { verify: mockJwtVerify } },
    billing: { jwtService: { verify: mockJwtVerify } },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
    dashboard: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const APPOINTMENT_ID = 'c0000000-0000-4000-8000-000000000001';
const TOKEN_ID = 'd0000000-0000-4000-8000-000000000002';
const RAW_TOKEN = 'raw-superseded-token';

function makeSupersededToken(): RentalTenantPortalTokenEntity {
  return new RentalTenantPortalTokenEntity({
    id: TOKEN_ID,
    appointmentId: APPOINTMENT_ID,
    tokenHash: 'hashed-superseded',
    expiresAt: new Date(Date.now() + 86400000),
    status: 'SUPERSEDED',
    usedAt: null,
    lastAccessedAt: null,
    rawTokenEncrypted: null,
    confirmationCycleId: 'old-cycle-id',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
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
  // hashToken always returns the same hash for our raw token
  mockHashToken.mockReturnValue('hashed-superseded');
});

describe('Portal middleware — SUPERSEDED token → 410', () => {
  it('GET /v1/rental-tenant-portal/:token returns 410 for SUPERSEDED token', async () => {
    mockFindByTokenHash.mockResolvedValueOnce(makeSupersededToken());

    const res = await supertest(app.server)
      .get(`/v1/rental-tenant-portal/${RAW_TOKEN}`);

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('PORTAL_TOKEN_SUPERSEDED');
  });

  it('POST /v1/rental-tenant-portal/:token/confirm returns 410 for SUPERSEDED token', async () => {
    mockFindByTokenHash.mockResolvedValueOnce(makeSupersededToken());

    const res = await supertest(app.server)
      .post(`/v1/rental-tenant-portal/${RAW_TOKEN}/confirm`)
      .send({ confirmedByTenant: true });

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('PORTAL_TOKEN_SUPERSEDED');
  });

  it('POST /v1/rental-tenant-portal/:token/reschedule returns 410 for SUPERSEDED token', async () => {
    mockFindByTokenHash.mockResolvedValueOnce(makeSupersededToken());

    const res = await supertest(app.server)
      .post(`/v1/rental-tenant-portal/${RAW_TOKEN}/reschedule`)
      .send({ newDate: '2026-09-01', newTimeSlotStart: '09:00', newTimeSlotEnd: '12:00' });

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('PORTAL_TOKEN_SUPERSEDED');
  });

  it('ACTIVE token does not return 410', async () => {
    const activeToken = new RentalTenantPortalTokenEntity({
      id: TOKEN_ID,
      appointmentId: APPOINTMENT_ID,
      tokenHash: 'hashed-superseded',
      expiresAt: new Date(Date.now() + 86400000),
      status: 'ACTIVE',
      usedAt: null,
      lastAccessedAt: null,
      rawTokenEncrypted: null,
      confirmationCycleId: 'active-cycle-id',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockFindByTokenHash.mockResolvedValueOnce(activeToken);

    const res = await supertest(app.server)
      .get(`/v1/rental-tenant-portal/${RAW_TOKEN}`);

    // 410 is specifically for SUPERSEDED — active token should not trigger it
    expect(res.status).not.toBe(410);
  });
});
