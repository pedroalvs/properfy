import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { TenantPortalTokenEntity } from '../../../src/modules/tenant-portal/domain/tenant-portal-token.entity';

/**
 * Route-level integration for the portal contact dual-write (FR-053).
 * Verifies that PATCH /v1/tenant-portal/:token/contact wires correctly through
 * portal-auth middleware → use case, passing the right appointmentId and contact
 * fields. Dual-write logic (snapshot + registry) is exercised inside the use case
 * which is mocked here at the container level.
 */

const APPOINTMENT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const TOKEN_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const TENANT_ID = 'cccccccc-0000-4000-8000-000000000003';

const mockUpdateContactExecute = vi.fn();
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
    tenantPortal: {
      getPortalDataUseCase: { execute: vi.fn() },
      confirmAppointmentUseCase: { execute: vi.fn() },
      rescheduleRequestUseCase: { execute: vi.fn() },
      updateContactUseCase: { execute: mockUpdateContactExecute },
      reportUnavailabilityUseCase: { execute: vi.fn() },
      generatePortalTokenUseCase: { execute: vi.fn() },
      tokenRepo: {
        findByTokenHash: mockFindByTokenHash,
        findActiveByAppointmentId: vi.fn(),
        save: vi.fn(),
        updateStatus: vi.fn(),
        updateLastAccessedAt: vi.fn(),
        markUsed: vi.fn(),
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

function createMockToken(overrides: Partial<ConstructorParameters<typeof TenantPortalTokenEntity>[0]> = {}) {
  return new TenantPortalTokenEntity({
    id: TOKEN_ID,
    appointmentId: APPOINTMENT_ID,
    tokenHash: 'hashed-token',
    expiresAt: new Date(Date.now() + 86400000),
    status: 'ACTIVE',
    usedAt: null,
    lastAccessedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function setupPortalAuth() {
  mockHashToken.mockReturnValue('hashed-token');
  mockFindByTokenHash.mockResolvedValue(createMockToken());
}

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });
beforeEach(() => { vi.clearAllMocks(); });

describe('PATCH /v1/tenant-portal/:token/contact — dual-write (FR-053)', () => {
  it('200: returns updated contact and passes appointmentId to use case', async () => {
    setupPortalAuth();
    mockUpdateContactExecute.mockResolvedValue({
      tenantName: 'John Smith',
      primaryEmail: 'newemail@example.com',
      primaryPhone: '+61400000000',
    });

    const res = await supertest(app.server)
      .patch('/v1/tenant-portal/valid-raw-token/contact')
      .send({ primaryEmail: 'newemail@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.contact).toBeDefined();
    expect(mockUpdateContactExecute).toHaveBeenCalledOnce();
    expect(mockUpdateContactExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: TOKEN_ID,
        appointmentId: APPOINTMENT_ID,
        contact: expect.objectContaining({ primaryEmail: 'newemail@example.com' }),
      }),
    );
  });

  it('use case receives both snapshot fields and registry update fields together', async () => {
    setupPortalAuth();
    mockUpdateContactExecute.mockResolvedValue({
      tenantName: 'John Smith',
      primaryEmail: 'updated@example.com',
      primaryPhone: '+61499999999',
    });

    await supertest(app.server)
      .patch('/v1/tenant-portal/valid-raw-token/contact')
      .send({ primaryEmail: 'updated@example.com', primaryPhone: '+61499999999' });

    const [callArgs] = mockUpdateContactExecute.mock.calls[0];
    // Snapshot + registry fields forwarded
    expect(callArgs.contact.primaryEmail).toBe('updated@example.com');
    expect(callArgs.contact.primaryPhone).toBe('+61499999999');
    // Appointment scoped to token
    expect(callArgs.appointmentId).toBe(APPOINTMENT_ID);
    // Execute called exactly once (not for any other appointment)
    expect(mockUpdateContactExecute).toHaveBeenCalledOnce();
  });

  it('200: skips registry update on email conflict (use case handles conflict, route returns 200)', async () => {
    setupPortalAuth();
    // When there is an email conflict, the use case skips the registry write but
    // still succeeds — it returns the snapshot-updated result, and the route returns 200.
    mockUpdateContactExecute.mockResolvedValue({
      tenantName: 'John Smith',
      primaryEmail: 'newemail@example.com', // snapshot updated
      primaryPhone: null,
    });

    const res = await supertest(app.server)
      .patch('/v1/tenant-portal/valid-raw-token/contact')
      .send({ primaryEmail: 'newemail@example.com' });

    expect(res.status).toBe(200);
    expect(mockUpdateContactExecute).toHaveBeenCalledOnce();
  });

  it('200: legacy contact_id=null path — use case still called with correct appointmentId', async () => {
    setupPortalAuth();
    // Legacy rows (contact_id null) are handled inside the use case.
    // The route layer is agnostic — it just passes the appointmentId from the token.
    mockUpdateContactExecute.mockResolvedValue({
      tenantName: 'Legacy Tenant',
      primaryEmail: 'legacy@example.com',
      primaryPhone: null,
    });

    const res = await supertest(app.server)
      .patch('/v1/tenant-portal/valid-raw-token/contact')
      .send({ primaryEmail: 'legacy@example.com' });

    expect(res.status).toBe(200);
    expect(mockUpdateContactExecute).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: APPOINTMENT_ID }),
    );
  });

  it('404: returns 404 for an invalid or not-found token', async () => {
    mockHashToken.mockReturnValue('hashed-bad-token');
    mockFindByTokenHash.mockResolvedValue(null);

    const res = await supertest(app.server)
      .patch('/v1/tenant-portal/invalid-token/contact')
      .send({ primaryEmail: 'test@example.com' });

    expect(res.status).toBe(404);
    expect(mockUpdateContactExecute).not.toHaveBeenCalled();
  });
});
