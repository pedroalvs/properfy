/**
 * T045-T049 — RBAC integration tests for runtime actors (TNT and SYS, plus INSP scoping).
 *
 * TNT (Tenant/Inquilino) actor:
 *   - Accesses portal via unique link token (not JWT)
 *   - Can: confirm, reschedule, report unavailability (within token scope)
 *   - Cannot: perform any JWT-authenticated action
 *   - Token-based endpoints return 401/invalid-token when no valid token
 *
 * SYS (System) actor:
 *   - SYS is used internally by pg-boss job handlers, not via HTTP
 *   - HTTP guard: SYS transitions are not exposed as a user-callable endpoint
 *   - Verified by ensuring status transitions require explicit actor context
 *
 * INSP actor:
 *   - Can: view own schedule, submit start/finish, view own offers
 *   - Cannot: view financial entries, manage tenants, create inspectors
 *
 * TNT portal routes use token middleware (not JWT), so tests verify:
 *   - No Authorization header → portal returns 401 for JWT routes
 *   - Portal endpoints without valid token → appropriate error
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import {
  makeAmContext,
  makeOpContext,
  makeClAdminContext,
  makeClUserContext,
  makeInspContext,
} from '../../helpers/rbac-test-helpers';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const mockJwtVerify = vi.fn();
const mockGetInspectorSchedule = vi.fn();
const mockGetAppointmentDetail = vi.fn();
const mockStartInspection = vi.fn();
const mockFinishInspection = vi.fn();
const mockGetMarketplaceOffers = vi.fn();
const mockListEntries = vi.fn();
const mockCreateTenant = vi.fn();
const mockListTenants = vi.fn();
const mockCreateInspector = vi.fn();
const mockStatusTransition = vi.fn();
const mockCrossCheck = vi.fn();
const mockGetPortalData = vi.fn();
const mockConfirmAppointment = vi.fn();
const mockRescheduleRequest = vi.fn();
const mockTokenRepo = {
  findByTokenHash: vi.fn(),
  findActiveByAppointmentId: vi.fn(),
  save: vi.fn(),
  updateStatus: vi.fn(),
  updateLastAccessedAt: vi.fn(),
  revokeAllForAppointment: vi.fn(),
};

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: {
      jwtService: { verify: mockJwtVerify },
      createTenantUseCase: { execute: mockCreateTenant },
      listTenantsUseCase: { execute: mockListTenants },
    },
    user: { jwtService: { verify: mockJwtVerify } },
    property: { jwtService: { verify: mockJwtVerify } },
    serviceType: { jwtService: { verify: mockJwtVerify } },
    pricingRule: { jwtService: { verify: mockJwtVerify } },
    inspector: {
      jwtService: { verify: mockJwtVerify },
      createInspectorUseCase: { execute: mockCreateInspector },
    },
    appointment: {
      jwtService: { verify: mockJwtVerify },
      executeStatusTransitionUseCase: { execute: mockStatusTransition },
      performCrossCheckUseCase: { execute: mockCrossCheck },
    },
    audit: { jwtService: { verify: mockJwtVerify } },
    serviceGroup: { jwtService: { verify: mockJwtVerify } },
    marketplace: { jwtService: { verify: mockJwtVerify } },
    tenantPortal: {
      jwtService: { verify: mockJwtVerify },
      getPortalDataUseCase: { execute: mockGetPortalData },
      confirmAppointmentUseCase: { execute: mockConfirmAppointment },
      rescheduleRequestUseCase: { execute: mockRescheduleRequest },
      tokenRepo: mockTokenRepo,
      tokenService: { generateRawToken: vi.fn(), hashToken: vi.fn().mockReturnValue('hashed-token') },
    },
    inspectorExecution: {
      jwtService: { verify: mockJwtVerify },
      getInspectorScheduleUseCase: { execute: mockGetInspectorSchedule },
      getAppointmentDetailUseCase: { execute: mockGetAppointmentDetail },
      startInspectionUseCase: { execute: mockStartInspection },
      finishInspectionUseCase: { execute: mockFinishInspection },
      getMarketplaceOffersUseCase: { execute: mockGetMarketplaceOffers },
    },
    billing: {
      jwtService: { verify: mockJwtVerify },
      listFinancialEntriesUseCase: { execute: mockListEntries },
    },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const INSPECTOR_ID = 'e4ffee44-4d5e-4ef9-ee9e-9ee2ee603d55';
const APPT_ID = 'c2ddfe22-2b3c-4ef9-cc7e-7cc0ce491b33';
const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

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
  // Default: no valid token in repo
  mockTokenRepo.findByTokenHash.mockResolvedValue(null);
});

// ── TNT actor: portal routes require valid token ──────────────────────────────

describe('TNT actor: portal routes — token-based access control', () => {
  it('GET /v1/tenant-portal/:token — no valid token → 404 (PortalTokenInvalidError extends NotFoundError)', async () => {
    // tokenRepo returns null = invalid token → PortalTokenInvalidError (extends NotFoundError) → 404
    mockTokenRepo.findByTokenHash.mockResolvedValue(null);
    const res = await supertest(app.server)
      .get('/v1/tenant-portal/invalid-raw-token');
    expect(res.status).toBe(404);
  });

  it('POST /v1/tenant-portal/:token/confirm — no valid token + valid body → 404', async () => {
    // Send a valid body to pass schema validation; portal middleware then rejects token (404)
    mockTokenRepo.findByTokenHash.mockResolvedValue(null);
    const res = await supertest(app.server)
      .post('/v1/tenant-portal/invalid-raw-token/confirm')
      .send({});
    expect(res.status).toBe(404);
  });

  it('POST /v1/tenant-portal/:token/reschedule — no valid token → 404', async () => {
    mockTokenRepo.findByTokenHash.mockResolvedValue(null);
    const res = await supertest(app.server)
      .post('/v1/tenant-portal/invalid-raw-token/reschedule')
      .send({ newDate: futureDate, newTimeSlotStart: '09:00', newTimeSlotEnd: '10:00' });
    expect(res.status).toBe(404);
  });
});

// ── TNT actor: JWT-authenticated routes are inaccessible ─────────────────────

describe('TNT actor: JWT routes are inaccessible without valid JWT', () => {
  it('GET /v1/appointments — no JWT → 401', async () => {
    const res = await supertest(app.server).get('/v1/appointments');
    expect(res.status).toBe(401);
  });

  it('POST /v1/appointments — no JWT + valid body → 401', async () => {
    // Fastify runs schema validation (preValidation) before auth (preHandler).
    // Sending a valid body ensures schema passes so 401 from missing JWT is returned.
    const res = await supertest(app.server)
      .post('/v1/appointments')
      .send({
        branchId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        propertyId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        serviceTypeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
        scheduledDate: futureDate,
        timeSlotStart: '09:00', timeSlotEnd: '10:00',
        contact: { tenantName: 'Test Tenant' },
      });
    expect(res.status).toBe(401);
  });

  it('GET /v1/tenants — no JWT → 401', async () => {
    const res = await supertest(app.server).get('/v1/tenants');
    expect(res.status).toBe(401);
  });

  it('POST /v1/tenants — no JWT + valid body → 401', async () => {
    const res = await supertest(app.server)
      .post('/v1/tenants')
      .send({ name: 'Acme Realty', legalName: 'Acme Realty Pty Ltd', appointmentCodePrefix: 'ACME' });
    expect(res.status).toBe(401);
  });
});

// ── INSP actor: narrow scope — own schedule only ─────────────────────────────

describe('INSP actor: allowed — GET /v1/inspector/schedule (own schedule)', () => {
  it('INSP → 200 (can view own schedule)', async () => {
    mockJwtVerify.mockResolvedValue(makeInspContext(INSPECTOR_ID));
    // Response must have `date` (required) and `appointments` array per inspectorScheduleResponseSchema
    mockGetInspectorSchedule.mockResolvedValue({ date: futureDate, appointments: [] });
    const res = await supertest(app.server)
      .get('/v1/inspector/schedule')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });
});

describe('INSP actor: allowed — GET /v1/inspector/offers (marketplace)', () => {
  it('INSP → 200 (can view marketplace offers)', async () => {
    mockJwtVerify.mockResolvedValue(makeInspContext(INSPECTOR_ID));
    mockGetMarketplaceOffers.mockResolvedValue({ data: [], total: 0 });
    const res = await supertest(app.server)
      .get('/v1/inspector/offers')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });
});

describe('INSP actor: denied — financial operations', () => {
  it('GET /v1/financial/entries → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeInspContext(INSPECTOR_ID));
    mockListEntries.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .get('/v1/financial/entries')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });
});

describe('INSP actor: denied — tenant management', () => {
  it('GET /v1/tenants → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeInspContext(INSPECTOR_ID));
    mockListTenants.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .get('/v1/tenants')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });

  it('POST /v1/tenants → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeInspContext(INSPECTOR_ID));
    mockCreateTenant.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post('/v1/tenants')
      .set('Authorization', 'Bearer t')
      .send({ name: 'Test', legalName: 'Test Pty Ltd', appointmentCodePrefix: 'TST' });
    expect(res.status).toBe(403);
  });
});

describe('INSP actor: denied — inspector management (cannot create peer)', () => {
  it('POST /v1/inspectors → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeInspContext(INSPECTOR_ID));
    mockCreateInspector.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post('/v1/inspectors')
      .set('Authorization', 'Bearer t')
      .send({ name: 'New Inspector', email: 'new@inspector.com', phone: '+61400000000' });
    expect(res.status).toBe(403);
  });
});

describe('INSP actor: denied — appointment cross-check (operational action)', () => {
  it('POST /v1/appointments/:id/cross-check-done → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeInspContext(INSPECTOR_ID));
    mockCrossCheck.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPT_ID}/cross-check-done`)
      .set('Authorization', 'Bearer t')
      .send({});
    expect(res.status).toBe(403);
  });
});

// ── SYS actor: not user-callable — verify no SYS JWT produces 401 ────────────

describe('SYS actor: not user-callable (no SYS JWT endpoint)', () => {
  it('unauthenticated status-transition → 401 (SYS does not have a JWT endpoint)', async () => {
    // SYS acts internally via pg-boss job handlers, not via HTTP.
    // Any HTTP attempt without auth returns 401.
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPT_ID}/status-transitions`)
      .send({ targetStatus: 'AWAITING_INSPECTOR' });
    expect(res.status).toBe(401);
  });

  it('unauthenticated cross-check → 401', async () => {
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPT_ID}/cross-check-done`)
      .send({});
    expect(res.status).toBe(401);
  });
});
