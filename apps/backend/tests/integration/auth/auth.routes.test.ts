import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';

// Module-level mock functions — must be defined before vi.mock() factory
const mockLoginExecute = vi.fn();
const mockRefreshExecute = vi.fn();
const mockLogoutExecute = vi.fn();
const mockGetMeExecute = vi.fn();
const mockChangePasswordExecute = vi.fn();
const mockRevokeSessionExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockJwtSign = vi.fn();
const mockAuditLog = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => ({
    prisma: {},
    auditService: { log: mockAuditLog },
    auth: {
      loginUseCase: { execute: mockLoginExecute },
      refreshTokenUseCase: { execute: mockRefreshExecute },
      logoutUseCase: { execute: mockLogoutExecute },
      getMeUseCase: { execute: mockGetMeExecute },
      changePasswordUseCase: { execute: mockChangePasswordExecute },
      revokeSessionUseCase: { execute: mockRevokeSessionExecute },
      jwtService: {
        verify: mockJwtVerify,
        signAccessToken: mockJwtSign,
      },
    },
    tenant: {
      createTenantUseCase: { execute: vi.fn() },
      getTenantUseCase: { execute: vi.fn() },
      listTenantsUseCase: { execute: vi.fn() },
      updateTenantUseCase: { execute: vi.fn() },
      deactivateTenantUseCase: { execute: vi.fn() },
      createBranchUseCase: { execute: vi.fn() },
      listBranchesUseCase: { execute: vi.fn() },
      updateBranchUseCase: { execute: vi.fn() },
      deactivateBranchUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign },
    },
    user: {
      createUserUseCase: { execute: vi.fn() },
      getUserUseCase: { execute: vi.fn() },
      listUsersUseCase: { execute: vi.fn() },
      updateUserUseCase: { execute: vi.fn() },
      deactivateUserUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign },
    },
    property: {
      createPropertyUseCase: { execute: vi.fn() },
      getPropertyUseCase: { execute: vi.fn() },
      listPropertiesUseCase: { execute: vi.fn() },
      updatePropertyUseCase: { execute: vi.fn() },
      deletePropertyUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign },
    },
    serviceType: {
      createServiceTypeUseCase: { execute: vi.fn() },
      getServiceTypeUseCase: { execute: vi.fn() },
      listServiceTypesUseCase: { execute: vi.fn() },
      updateServiceTypeUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign },
    },
    pricingRule: {
      createPricingRuleUseCase: { execute: vi.fn() },
      listPricingRulesUseCase: { execute: vi.fn() },
      updatePricingRuleUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign },
    },
    inspector: {
      createInspectorUseCase: { execute: vi.fn() },
      getInspectorUseCase: { execute: vi.fn() },
      listInspectorsUseCase: { execute: vi.fn() },
      updateInspectorUseCase: { execute: vi.fn() },
      createAvailabilitySlotUseCase: { execute: vi.fn() },
      listAvailabilitySlotsUseCase: { execute: vi.fn() },
      updateAvailabilitySlotUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign },
    },
    appointment: {
      createAppointmentUseCase: { execute: vi.fn() },
      getAppointmentUseCase: { execute: vi.fn() },
      listAppointmentsUseCase: { execute: vi.fn() },
      updateAppointmentUseCase: { execute: vi.fn() },
      executeStatusTransitionUseCase: { execute: vi.fn() },
      forceManualConfirmationUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign },
    },
    audit: {
      listAuditLogsUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign },
    },
    serviceGroup: {
      createServiceGroupUseCase: { execute: vi.fn() },
      getServiceGroupUseCase: { execute: vi.fn() },
      listServiceGroupsUseCase: { execute: vi.fn() },
      publishServiceGroupUseCase: { execute: vi.fn() },
      assignInspectorManuallyUseCase: { execute: vi.fn() },
      cancelServiceGroupUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign },
    },
    marketplace: {
      getMarketplaceOffersUseCase: { execute: vi.fn() },
      acceptOfferUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign },
    },
    tenantPortal: {
      getPortalDataUseCase: { execute: vi.fn() },
      confirmAppointmentUseCase: { execute: vi.fn() },
      rescheduleRequestUseCase: { execute: vi.fn() },
      updateContactUseCase: { execute: vi.fn() },
      reportUnavailabilityUseCase: { execute: vi.fn() },
      generatePortalTokenUseCase: { execute: vi.fn() },
      tokenRepo: { findByTokenHash: vi.fn(), findActiveByAppointmentId: vi.fn(), save: vi.fn(), updateStatus: vi.fn(), updateLastAccessedAt: vi.fn(), revokeAllForAppointment: vi.fn() },
      tokenService: { generateRawToken: vi.fn(), hashToken: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign },
    },
    inspectorExecution: {
      getInspectorScheduleUseCase: { execute: vi.fn() },
      getAppointmentDetailUseCase: { execute: vi.fn() },
      startInspectionUseCase: { execute: vi.fn() },
      finishInspectionUseCase: { execute: vi.fn() },
      requestAssetUploadUseCase: { execute: vi.fn() },
      confirmAssetUploadUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign },
    },
    billing: {
      createFinancialEntriesOnDoneUseCase: { execute: vi.fn() },
      listFinancialEntriesUseCase: { execute: vi.fn() },
      getFinancialEntryUseCase: { execute: vi.fn() },
      approveFinancialEntryUseCase: { execute: vi.fn() },
      createManualAdjustmentUseCase: { execute: vi.fn() },
      createRefundUseCase: { execute: vi.fn() },
      generateInvoiceUseCase: { execute: vi.fn() },
      listInvoicesUseCase: { execute: vi.fn() },
      getInvoiceUseCase: { execute: vi.fn() },
      downloadInvoiceUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign },
    },
  }),
}));

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

describe('POST /v1/auth/login', () => {
  it('should return 200 with valid credentials', async () => {
    mockLoginExecute.mockResolvedValueOnce({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        id: 'user-1',
        name: 'Test',
        email: 'test@example.com',
        role: 'CL_ADMIN',
        tenantId: 'tenant-1',
        branchId: null,
        totpEnabled: false,
      },
    });

    const res = await supertest(app.server)
      .post('/v1/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });

  it('should return 422 with invalid payload (missing password)', async () => {
    const res = await supertest(app.server)
      .post('/v1/auth/login')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 401 with AUTH_INVALID_CREDENTIALS error', async () => {
    const { InvalidCredentialsError } = await import('../../../src/modules/auth/domain/auth.errors');
    mockLoginExecute.mockRejectedValueOnce(new InvalidCredentialsError());

    const res = await supertest(app.server)
      .post('/v1/auth/login')
      .send({ email: 'test@example.com', password: 'WrongPass1!' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('should return 429 with AUTH_ACCOUNT_LOCKED error including retryAfter', async () => {
    const { AccountLockedError } = await import('../../../src/modules/auth/domain/auth.errors');
    mockLoginExecute.mockRejectedValueOnce(new AccountLockedError('2026-03-17T00:00:00.000Z'));

    const res = await supertest(app.server)
      .post('/v1/auth/login')
      .send({ email: 'test@example.com', password: 'SomePass1!' });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('AUTH_ACCOUNT_LOCKED');
  });

  it('should return 403 for inactive user', async () => {
    const { UserInactiveError } = await import('../../../src/modules/auth/domain/auth.errors');
    mockLoginExecute.mockRejectedValueOnce(new UserInactiveError());

    const res = await supertest(app.server)
      .post('/v1/auth/login')
      .send({ email: 'inactive@example.com', password: 'AnyPass1!' });

    expect(res.status).toBe(403);
  });
});

describe('POST /v1/auth/refresh', () => {
  it('should return 200 with valid refresh token', async () => {
    mockRefreshExecute.mockResolvedValueOnce({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });

    const res = await supertest(app.server)
      .post('/v1/auth/refresh')
      .send({ refreshToken: 'some-valid-token' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  it('should return 401 with invalid refresh token', async () => {
    const { InvalidRefreshTokenError } = await import('../../../src/modules/auth/domain/auth.errors');
    mockRefreshExecute.mockRejectedValueOnce(new InvalidRefreshTokenError());

    const res = await supertest(app.server)
      .post('/v1/auth/refresh')
      .send({ refreshToken: 'expired-token' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_INVALID_REFRESH_TOKEN');
  });
});

describe('POST /v1/auth/logout', () => {
  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server).post('/v1/auth/logout');
    expect(res.status).toBe(401);
  });

  it('should return 204 with valid auth token', async () => {
    mockJwtVerify.mockResolvedValueOnce({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'CL_ADMIN',
      branchId: null,
    });
    mockLogoutExecute.mockResolvedValueOnce(undefined);

    const res = await supertest(app.server)
      .post('/v1/auth/logout')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(204);
  });
});

describe('GET /v1/me', () => {
  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server).get('/v1/me');
    expect(res.status).toBe(401);
  });

  it('should return 200 with valid auth token', async () => {
    mockJwtVerify.mockResolvedValueOnce({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'CL_ADMIN',
      branchId: null,
    });
    mockGetMeExecute.mockResolvedValueOnce({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      phone: null,
      role: 'CL_ADMIN',
      status: 'ACTIVE',
      tenantId: 'tenant-1',
      branchId: null,
      totpEnabled: false,
      lastLoginAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const res = await supertest(app.server)
      .get('/v1/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('user-1');
  });

  it('should return 401 with expired access token', async () => {
    const { UnauthorizedError } = await import('../../../src/shared/domain/errors');
    mockJwtVerify.mockRejectedValueOnce(
      new UnauthorizedError('AUTH_UNAUTHORIZED', 'Authentication required')
    );

    const res = await supertest(app.server)
      .get('/v1/me')
      .set('Authorization', 'Bearer expired-token');

    expect(res.status).toBe(401);
  });
});

describe('POST /v1/auth/change-password', () => {
  it('should return 204 on success', async () => {
    mockJwtVerify.mockResolvedValueOnce({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'CL_ADMIN',
      branchId: null,
    });
    mockChangePasswordExecute.mockResolvedValueOnce(undefined);

    const res = await supertest(app.server)
      .post('/v1/auth/change-password')
      .set('Authorization', 'Bearer valid-token')
      .send({ currentPassword: 'OldPass1!', newPassword: 'NewPass2@' });

    expect(res.status).toBe(204);
  });

  it('should return 422 with invalid payload', async () => {
    mockJwtVerify.mockResolvedValueOnce({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'CL_ADMIN',
      branchId: null,
    });

    const res = await supertest(app.server)
      .post('/v1/auth/change-password')
      .set('Authorization', 'Bearer valid-token')
      .send({ currentPassword: 'OldPass1!' }); // missing newPassword

    expect(res.status).toBe(422);
  });
});

describe('DELETE /v1/auth/sessions/:sessionId', () => {
  it('should return 204 for own session', async () => {
    mockJwtVerify.mockResolvedValueOnce({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'CL_ADMIN',
      branchId: null,
    });
    mockRevokeSessionExecute.mockResolvedValueOnce(undefined);

    const res = await supertest(app.server)
      .delete('/v1/auth/sessions/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(204);
  });

  it('should return 403 for other user session (non-AM)', async () => {
    mockJwtVerify.mockResolvedValueOnce({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'CL_ADMIN',
      branchId: null,
    });
    const { ForbiddenError } = await import('../../../src/shared/domain/errors');
    mockRevokeSessionExecute.mockRejectedValueOnce(
      new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions')
    );

    const res = await supertest(app.server)
      .delete('/v1/auth/sessions/b1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b22')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(403);
  });

  it('should return 204 for any session when actor is AM', async () => {
    mockJwtVerify.mockResolvedValueOnce({
      userId: 'admin-1',
      tenantId: null,
      role: 'AM',
      branchId: null,
    });
    mockRevokeSessionExecute.mockResolvedValueOnce(undefined);

    const res = await supertest(app.server)
      .delete('/v1/auth/sessions/c2aade11-1b2d-4ef0-ad8f-8dd1df502c33')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(204);
  });
});
