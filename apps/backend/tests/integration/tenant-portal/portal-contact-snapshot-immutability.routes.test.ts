import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { RentalTenantPortalTokenEntity } from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal-token.entity';

/**
 * Route-level integration for portal contact snapshot immutability (021 invariant).
 *
 * When a renter updates their contact via the portal for appointment A, the route
 * must scope the operation strictly to appointment A — never to any other appointment
 * that may share the same registry contact.
 *
 * This is verified at the route level by confirming:
 * 1. The portal-auth middleware resolves the token to exactly ONE appointmentId.
 * 2. The use case is called exactly once with that appointmentId.
 * 3. No other appointmentId appears in the call args.
 *
 * The underlying registry fan-out logic is unit-tested separately.
 */

const APPT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const APPT_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const TOKEN_FOR_A = 'cccccccc-0000-4000-8000-000000000003';

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
    rentalTenantPortal: {
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

function tokenForAppointment(appointmentId: string) {
  return new RentalTenantPortalTokenEntity({
    id: TOKEN_FOR_A,
    appointmentId,
    tokenHash: 'hashed-token-a',
    expiresAt: new Date(Date.now() + 86400000),
    status: 'ACTIVE',
    usedAt: null,
    lastAccessedAt: null,
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
beforeEach(() => { vi.clearAllMocks(); });

describe('PATCH /v1/rental-tenant-portal/:token/contact — snapshot immutability (feature 021)', () => {
  it('use case is called with appointment A\'s id — never with appointment B\'s id', async () => {
    // Token is bound to appt-A, not appt-B. Even if they share a registry contact,
    // the route must only invoke the use case for appt-A.
    mockHashToken.mockReturnValue('hashed-token-a');
    mockFindByTokenHash.mockResolvedValue(tokenForAppointment(APPT_A));
    mockUpdateContactExecute.mockResolvedValue({
      rentalTenantName: 'Alice',
      primaryEmail: 'updated@example.com',
      primaryPhone: null,
    });

    const res = await supertest(app.server)
      .patch('/v1/rental-tenant-portal/token-for-a/contact')
      .send({ primaryEmail: 'updated@example.com' });

    expect(res.status).toBe(200);

    // Response contract is snapshot-only: primary fields echo back and the
    // removed secondary_* fields must NOT be serialized (guards a stale route
    // serializer that could keep emitting the dropped inline columns).
    expect(res.body.contact).toMatchObject({ primaryEmail: 'updated@example.com' });
    expect(res.body.contact).not.toHaveProperty('secondaryEmail');
    expect(res.body.contact).not.toHaveProperty('secondaryPhone');

    // Exactly one call to the use case
    expect(mockUpdateContactExecute).toHaveBeenCalledOnce();

    const [callArgs] = mockUpdateContactExecute.mock.calls[0];
    // Scoped to appt-A
    expect(callArgs.appointmentId).toBe(APPT_A);
    // Never appt-B
    expect(callArgs.appointmentId).not.toBe(APPT_B);
  });

  it('does not cross-contaminate: two sequential requests on different tokens call use case for their respective appointments only', async () => {
    const TOKEN_B = 'dddddddd-0000-4000-8000-000000000004';

    // First request: token for appt-A
    mockHashToken.mockReturnValue('hashed-token-a');
    mockFindByTokenHash.mockResolvedValue(tokenForAppointment(APPT_A));
    mockUpdateContactExecute.mockResolvedValue({
      rentalTenantName: 'A', primaryEmail: 'a@example.com', primaryPhone: null,
    });

    const res1 = await supertest(app.server)
      .patch('/v1/rental-tenant-portal/token-for-a/contact')
      .send({ primaryEmail: 'a@example.com' });
    expect(res1.status).toBe(200);

    // Second request: token for appt-B
    mockHashToken.mockReturnValue('hashed-token-b');
    mockFindByTokenHash.mockResolvedValue(new RentalTenantPortalTokenEntity({
      id: TOKEN_B,
      appointmentId: APPT_B,
      tokenHash: 'hashed-token-b',
      expiresAt: new Date(Date.now() + 86400000),
      status: 'ACTIVE',
      usedAt: null,
      lastAccessedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mockUpdateContactExecute.mockResolvedValue({
      rentalTenantName: 'B', primaryEmail: 'b@example.com', primaryPhone: null,
    });

    const res2 = await supertest(app.server)
      .patch('/v1/rental-tenant-portal/token-for-b/contact')
      .send({ primaryEmail: 'b@example.com' });
    expect(res2.status).toBe(200);

    // Two calls total, each scoped to its appointment
    expect(mockUpdateContactExecute).toHaveBeenCalledTimes(2);
    const appointmentIds = mockUpdateContactExecute.mock.calls.map((c) => c[0].appointmentId);
    expect(appointmentIds[0]).toBe(APPT_A);
    expect(appointmentIds[1]).toBe(APPT_B);
  });
});
