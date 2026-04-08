import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { TenantPortalTokenEntity } from '../../../src/modules/tenant-portal/domain/tenant-portal-token.entity';

const APPOINTMENT_ID = '00000000-0000-0000-0000-000000000001';
const TOKEN_ID = '00000000-0000-0000-0000-000000000002';

const mockGetPortalDataExecute = vi.fn();
const mockConfirmAppointmentExecute = vi.fn();
const mockRescheduleRequestExecute = vi.fn();
const mockUpdateContactExecute = vi.fn();
const mockReportUnavailabilityExecute = vi.fn();
const mockGeneratePortalTokenExecute = vi.fn();
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
      getPortalDataUseCase: { execute: mockGetPortalDataExecute },
      confirmAppointmentUseCase: { execute: mockConfirmAppointmentExecute },
      rescheduleRequestUseCase: { execute: mockRescheduleRequestExecute },
      updateContactUseCase: { execute: mockUpdateContactExecute },
      reportUnavailabilityUseCase: { execute: mockReportUnavailabilityExecute },
      generatePortalTokenUseCase: { execute: mockGeneratePortalTokenExecute },
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

const amContext = {
  userId: 'admin-1',
  tenantId: null,
  role: 'AM',
  branchId: null,
  inspectorId: null,
};

function createMockToken() {
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

describe('GET /v1/tenant-portal/:token', () => {
  it('should return 200 with portal data', async () => {
    setupPortalAuth();
    const mockResult = {
      token: { status: 'ACTIVE', isReadOnly: false, isExpired: false, canRequestNewLink: false, expiresAt: '2026-04-01T00:00:00.000Z' },
      appointment: {},
      contact: null,
      restrictions: [],
      existingResponse: {
        type: 'CONFIRMED',
        createdAt: '2026-03-20T10:00:00.000Z',
        summary: 'Tenant confirmed attendance',
      },
    };
    mockGetPortalDataExecute.mockResolvedValueOnce(mockResult);

    const res = await supertest(app.server)
      .get('/v1/tenant-portal/valid-raw-token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockResult);
    expect(mockHashToken).toHaveBeenCalledWith('valid-raw-token');
    expect(mockFindByTokenHash).toHaveBeenCalledWith('hashed-token');
    expect(mockGetPortalDataExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: TOKEN_ID,
        appointmentId: APPOINTMENT_ID,
        isReadOnly: false,
        tokenStatus: 'ACTIVE',
      }),
    );
  });

  it('should return 404 for invalid token', async () => {
    mockHashToken.mockReturnValue('hashed-invalid');
    mockFindByTokenHash.mockResolvedValue(null);

    const res = await supertest(app.server)
      .get('/v1/tenant-portal/invalid-token');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PORTAL_TOKEN_INVALID');
  });
});

describe('POST /v1/tenant-portal/:token/confirm', () => {
  it('should return 200 on successful confirmation', async () => {
    setupPortalAuth();
    const mockResult = {
      tenantConfirmationStatus: 'CONFIRMED',
      confirmedAt: '2026-03-01T00:00:00.000Z',
    };
    mockConfirmAppointmentExecute.mockResolvedValueOnce(mockResult);

    const res = await supertest(app.server)
      .post('/v1/tenant-portal/valid-raw-token/confirm')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockResult);
    expect(mockConfirmAppointmentExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: TOKEN_ID,
        appointmentId: APPOINTMENT_ID,
        isReadOnly: false,
      }),
    );
  });
});

describe('POST /v1/tenant-portal/:token/reschedule', () => {
  it('should return 200 on successful reschedule request', async () => {
    setupPortalAuth();
    const mockResult = {
      scheduledDate: '2026-05-01',
      timeSlot: '09:00-10:00',
      tenantConfirmationStatus: 'PENDING',
    };
    mockRescheduleRequestExecute.mockResolvedValueOnce(mockResult);

    const res = await supertest(app.server)
      .post('/v1/tenant-portal/valid-raw-token/reschedule')
      .send({ newDate: '2026-05-01', newTimeSlot: '09:00-10:00' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockResult);
    expect(mockRescheduleRequestExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: TOKEN_ID,
        appointmentId: APPOINTMENT_ID,
        isReadOnly: false,
        newDate: '2026-05-01',
        newTimeSlot: '09:00-10:00',
      }),
    );
  });
});

describe('PATCH /v1/tenant-portal/:token/contact', () => {
  it('should return 200 on successful contact update', async () => {
    setupPortalAuth();
    const useCaseResult = { primaryEmail: 'new@email.com' };
    mockUpdateContactExecute.mockResolvedValueOnce(useCaseResult);

    const res = await supertest(app.server)
      .patch('/v1/tenant-portal/valid-raw-token/contact')
      .send({ primaryEmail: 'new@email.com' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ contact: useCaseResult });
    expect(mockUpdateContactExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: TOKEN_ID,
        appointmentId: APPOINTMENT_ID,
        isReadOnly: false,
        contact: { primaryEmail: 'new@email.com' },
      }),
    );
  });
});

describe('POST /v1/tenant-portal/:token/unavailable', () => {
  it('should return 200 on successful unavailability report', async () => {
    setupPortalAuth();
    const mockResult = { tenantConfirmationStatus: 'UNAVAILABLE', urgentMode: false };
    mockReportUnavailabilityExecute.mockResolvedValueOnce(mockResult);

    const res = await supertest(app.server)
      .post('/v1/tenant-portal/valid-raw-token/unavailable')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockResult);
    expect(mockReportUnavailabilityExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: TOKEN_ID,
        appointmentId: APPOINTMENT_ID,
        isReadOnly: false,
      }),
    );
  });
});

describe('POST /v1/appointments/:appointmentId/portal-token', () => {
  it('should return 201 with generated token', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const mockResult = { token: 'raw-token', expiresAt: '2026-04-01T00:00:00Z' };
    mockGeneratePortalTokenExecute.mockResolvedValueOnce(mockResult);

    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPOINTMENT_ID}/portal-token`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(201);
    expect(res.body).toEqual(mockResult);
    expect(mockGeneratePortalTokenExecute).toHaveBeenCalledWith({
      appointmentId: APPOINTMENT_ID,
      actor: amContext,
    });
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .post(`/v1/appointments/${APPOINTMENT_ID}/portal-token`);

    expect(res.status).toBe(401);
  });
});
