import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { RentalTenantPortalTokenEntity } from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal-token.entity';
import {
  PortalActionBlockedError,
  PortalTokenAlreadyUsedError,
  PortalGroupNotFoundError,
  PortalGroupFullError,
  PortalGroupUnavailableError,
  PortalGroupSlotUnavailableError,
} from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal.errors';

const APPOINTMENT_ID = '00000000-0000-0000-0000-000000000001';
const TOKEN_ID = '00000000-0000-0000-0000-000000000002';
const GROUP_ID = '00000000-0000-0000-0000-000000000003';

const mockGetAvailableGroupsExecute = vi.fn();
const mockJoinGroupExecute = vi.fn();
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
      listPortalActivitiesUseCase: { execute: vi.fn() },
      getAvailableGroupsUseCase: { execute: mockGetAvailableGroupsExecute },
      joinGroupUseCase: { execute: mockJoinGroupExecute },
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

function createMockToken(overrides: { status?: string; usedAt?: Date | null } = {}) {
  return new RentalTenantPortalTokenEntity({
    id: TOKEN_ID,
    appointmentId: APPOINTMENT_ID,
    tokenHash: 'hashed-token',
    expiresAt: new Date(Date.now() + 86400000),
    status: overrides.status ?? 'ACTIVE',
    usedAt: overrides.usedAt ?? null,
    lastAccessedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
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

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /v1/rental-tenant-portal/:token/available-groups', () => {
  it('should return 200 with groups list', async () => {
    setupPortalAuth();
    const mockResult = {
      groups: [
        {
          groupId: GROUP_ID,
          scheduledDate: '2026-06-01',
          timeSlotStart: '13:00',
          timeSlotEnd: '15:00',
          suburb: 'Surry Hills',
          inspectorName: 'John Smith',
          confirmedCount: 3,
          capacityMax: 10,
        },
      ],
    };
    mockGetAvailableGroupsExecute.mockResolvedValueOnce(mockResult);

    const res = await supertest(app.server).get('/v1/rental-tenant-portal/valid-token/available-groups');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockResult);
    expect(mockGetAvailableGroupsExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: APPOINTMENT_ID,
      }),
    );
  });

  it('should still list groups when the token is expired', async () => {
    mockHashToken.mockReturnValue('hashed-token');
    const expiredToken = createMockToken({ status: 'EXPIRED' });
    mockFindByTokenHash.mockResolvedValue(expiredToken);
    mockGetAvailableGroupsExecute.mockResolvedValueOnce({ groups: [] });

    const res = await supertest(app.server).get('/v1/rental-tenant-portal/valid-token/available-groups');

    expect(res.status).toBe(200);
    expect(mockGetAvailableGroupsExecute).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: APPOINTMENT_ID }),
    );
  });

  it('should return 404 for invalid token', async () => {
    mockHashToken.mockReturnValue('hashed-bad');
    mockFindByTokenHash.mockResolvedValue(null);

    const res = await supertest(app.server).get('/v1/rental-tenant-portal/bad-token/available-groups');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PORTAL_TOKEN_INVALID');
  });
});

describe('POST /v1/rental-tenant-portal/:token/join-group', () => {
  it('should return 200 on successful join', async () => {
    setupPortalAuth();
    const mockResult = {
      scheduledDate: '2026-06-01',
      timeSlotStart: '13:00',
      timeSlotEnd: '15:00',
      rentalTenantConfirmationStatus: 'CONFIRMED',
      appointmentStatus: 'SCHEDULED',
      inspector: { id: '00000000-0000-0000-0000-000000000010', name: 'John Smith' },
    };
    mockJoinGroupExecute.mockResolvedValueOnce(mockResult);

    const res = await supertest(app.server)
      .post('/v1/rental-tenant-portal/valid-token/join-group')
      .send({
        groupId: GROUP_ID,
        scheduledDate: '2026-06-01',
        timeSlotStart: '13:00',
        timeSlotEnd: '15:00',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockResult);
    expect(mockJoinGroupExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: TOKEN_ID,
        appointmentId: APPOINTMENT_ID,
        groupId: GROUP_ID,
        scheduledDate: '2026-06-01',
        timeSlotStart: '13:00',
        timeSlotEnd: '15:00',
        isUsed: false,
      }),
    );
  });

  it('should forward rentalTenantNote to use case', async () => {
    setupPortalAuth();
    mockJoinGroupExecute.mockResolvedValueOnce({
      scheduledDate: '2026-06-01',
      timeSlotStart: '13:00',
      timeSlotEnd: '15:00',
      rentalTenantConfirmationStatus: 'CONFIRMED',
      appointmentStatus: 'SCHEDULED',
      inspector: { id: '00000000-0000-0000-0000-000000000010', name: 'John Smith' },
    });

    await supertest(app.server)
      .post('/v1/rental-tenant-portal/valid-token/join-group')
      .send({
        groupId: GROUP_ID,
        scheduledDate: '2026-06-01',
        timeSlotStart: '13:00',
        timeSlotEnd: '15:00',
        rentalTenantNote: 'Please ring bell',
      });

    expect(mockJoinGroupExecute).toHaveBeenCalledWith(
      expect.objectContaining({ rentalTenantNote: 'Please ring bell' }),
    );
  });

  it('should return 422 when groupId is missing', async () => {
    setupPortalAuth();

    const res = await supertest(app.server)
      .post('/v1/rental-tenant-portal/valid-token/join-group')
      .send({});

    expect(res.status).toBe(400);
  });

  it('should return 422 when groupId is not a uuid', async () => {
    setupPortalAuth();

    const res = await supertest(app.server)
      .post('/v1/rental-tenant-portal/valid-token/join-group')
      .send({ groupId: 'not-a-uuid' });

    expect(res.status).toBe(400);
  });

  it('should return 409 when token already used (PortalTokenAlreadyUsedError)', async () => {
    mockHashToken.mockReturnValue('hashed-token');
    mockFindByTokenHash.mockResolvedValue(createMockToken({ usedAt: new Date() }));
    mockJoinGroupExecute.mockRejectedValueOnce(new PortalTokenAlreadyUsedError());

    const res = await supertest(app.server)
      .post('/v1/rental-tenant-portal/valid-token/join-group')
      .send({
        groupId: GROUP_ID,
        scheduledDate: '2026-06-01',
        timeSlotStart: '13:00',
        timeSlotEnd: '15:00',
      });

    expect(res.status).toBe(409);
  });

  it('should return 403 when token is read-only (PortalActionBlockedError)', async () => {
    mockHashToken.mockReturnValue('hashed-token');
    const expiredToken = createMockToken({ status: 'EXPIRED' });
    mockFindByTokenHash.mockResolvedValue(expiredToken);
    mockJoinGroupExecute.mockRejectedValueOnce(new PortalActionBlockedError());

    const res = await supertest(app.server)
      .post('/v1/rental-tenant-portal/valid-token/join-group')
      .send({
        groupId: GROUP_ID,
        scheduledDate: '2026-06-01',
        timeSlotStart: '13:00',
        timeSlotEnd: '15:00',
      });

    expect(res.status).toBe(403);
  });

  it('should return 404 when group not found (PortalGroupNotFoundError)', async () => {
    setupPortalAuth();
    mockJoinGroupExecute.mockRejectedValueOnce(new PortalGroupNotFoundError());

    const res = await supertest(app.server)
      .post('/v1/rental-tenant-portal/valid-token/join-group')
      .send({
        groupId: GROUP_ID,
        scheduledDate: '2026-06-01',
        timeSlotStart: '13:00',
        timeSlotEnd: '15:00',
      });

    expect(res.status).toBe(404);
  });

  it('should return 409 when group is full (PortalGroupFullError)', async () => {
    setupPortalAuth();
    mockJoinGroupExecute.mockRejectedValueOnce(new PortalGroupFullError());

    const res = await supertest(app.server)
      .post('/v1/rental-tenant-portal/valid-token/join-group')
      .send({
        groupId: GROUP_ID,
        scheduledDate: '2026-06-01',
        timeSlotStart: '13:00',
        timeSlotEnd: '15:00',
      });

    expect(res.status).toBe(409);
  });

  it('should return 409 when group unavailable (PortalGroupUnavailableError)', async () => {
    setupPortalAuth();
    mockJoinGroupExecute.mockRejectedValueOnce(new PortalGroupUnavailableError());

    const res = await supertest(app.server)
      .post('/v1/rental-tenant-portal/valid-token/join-group')
      .send({
        groupId: GROUP_ID,
        scheduledDate: '2026-06-01',
        timeSlotStart: '13:00',
        timeSlotEnd: '15:00',
      });

    expect(res.status).toBe(409);
  });

  it('should return 422 when selected slot is no longer available', async () => {
    setupPortalAuth();
    mockJoinGroupExecute.mockRejectedValueOnce(new PortalGroupSlotUnavailableError());

    const res = await supertest(app.server)
      .post('/v1/rental-tenant-portal/valid-token/join-group')
      .send({
        groupId: GROUP_ID,
        scheduledDate: '2026-06-01',
        timeSlotStart: '13:00',
        timeSlotEnd: '15:00',
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PORTAL_GROUP_SLOT_UNAVAILABLE');
  });

  it('should return 404 for invalid token', async () => {
    mockHashToken.mockReturnValue('hashed-bad');
    mockFindByTokenHash.mockResolvedValue(null);

    const res = await supertest(app.server)
      .post('/v1/rental-tenant-portal/bad-token/join-group')
      .send({
        groupId: GROUP_ID,
        scheduledDate: '2026-06-01',
        timeSlotStart: '13:00',
        timeSlotEnd: '15:00',
      });

    expect(res.status).toBe(404);
  });
});
