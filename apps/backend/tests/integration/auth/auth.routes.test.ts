import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

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
  createContainer: () => createMockContainer({
    auditService: { log: mockAuditLog } as any,
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
    tenant: { jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign } },
    user: { jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign } },
    property: { jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign } },
    serviceType: { jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign } },
    pricingRule: { jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign } },
    inspector: { jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign } },
    appointment: { jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign } },
    audit: { jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign } },
    serviceGroup: { jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign } },
    marketplace: { jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign } },
    tenantPortal: { jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign } },
    inspectorExecution: { jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign } },
    billing: { jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign } },
    report: { jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign } },
    notification: { jwtService: { verify: mockJwtVerify, signAccessToken: mockJwtSign } },
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
      expiresIn: 900,
      user: {
        id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        name: 'Test',
        email: 'test@example.com',
        role: 'CL_ADMIN',
        tenantId: 'b1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b22',
      },
    });

    const res = await supertest(app.server)
      .post('/v1/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });

  it('should return 400 with invalid payload (missing password)', async () => {
    const res = await supertest(app.server)
      .post('/v1/auth/login')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(400);
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
      expiresIn: 900,
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
      inspectorId: null,
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
      inspectorId: null,
    });
    mockGetMeExecute.mockResolvedValueOnce({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Test User',
      email: 'test@example.com',
      role: 'CL_ADMIN',
      tenantId: 'b1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b22',
      branchId: null,
      inspectorId: null,
      totpEnabled: false,
      phone: null,
      status: 'ACTIVE',
      lastLoginAt: '2026-03-17T10:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const res = await supertest(app.server)
      .get('/v1/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
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
      inspectorId: null,
    });
    mockChangePasswordExecute.mockResolvedValueOnce(undefined);

    const res = await supertest(app.server)
      .post('/v1/auth/change-password')
      .set('Authorization', 'Bearer valid-token')
      .send({ currentPassword: 'OldPass1!', newPassword: 'NewPass2@' });

    expect(res.status).toBe(204);
  });

  it('should return 400 with invalid payload', async () => {
    mockJwtVerify.mockResolvedValueOnce({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'CL_ADMIN',
      branchId: null,
      inspectorId: null,
    });

    const res = await supertest(app.server)
      .post('/v1/auth/change-password')
      .set('Authorization', 'Bearer valid-token')
      .send({ currentPassword: 'OldPass1!' }); // missing newPassword

    expect(res.status).toBe(400);
  });
});

describe('DELETE /v1/auth/sessions/:sessionId', () => {
  it('should return 204 for own session', async () => {
    mockJwtVerify.mockResolvedValueOnce({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'CL_ADMIN',
      branchId: null,
      inspectorId: null,
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
      inspectorId: null,
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
      inspectorId: null,
    });
    mockRevokeSessionExecute.mockResolvedValueOnce(undefined);

    const res = await supertest(app.server)
      .delete('/v1/auth/sessions/c2aade11-1b2d-4ef0-ad8f-8dd1df502c33')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(204);
  });
});
