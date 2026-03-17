import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockLoginExecute = vi.fn();
const mockRefreshExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auth: {
      loginUseCase: { execute: mockLoginExecute },
      refreshTokenUseCase: { execute: mockRefreshExecute },
      logoutUseCase: { execute: vi.fn() },
      getMeUseCase: { execute: vi.fn() },
      changePasswordUseCase: { execute: vi.fn() },
      revokeSessionUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
  }),
}));

describe('Auth route rate limiting', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should enforce login rate limit of 30 per minute', async () => {
    mockLoginExecute.mockResolvedValue({
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
      .send({ email: 'test@example.com', password: 'Pass1234!' });

    // Rate limit headers from @fastify/rate-limit
    expect(res.headers['x-ratelimit-limit']).toBe('30');
  });

  it('should enforce refresh rate limit of 20 per minute', async () => {
    mockRefreshExecute.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresIn: 900,
    });

    const res = await supertest(app.server)
      .post('/v1/auth/refresh')
      .send({ refreshToken: 'some-valid-token' });

    expect(res.headers['x-ratelimit-limit']).toBe('20');
  });
});
