import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockPrismaQueryRaw = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      prisma: { $queryRaw: mockPrismaQueryRaw } as any,
    }),
}));

describe('Health endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('should return 200 with db connected when DB is healthy', async () => {
      mockPrismaQueryRaw.mockResolvedValue([{ '?column?': 1 }]);
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ok');
      expect(body.db).toBe('connected');
      expect(body.timestamp).toBeDefined();
    });

    it('should return 503 with db disconnected when DB is down', async () => {
      mockPrismaQueryRaw.mockRejectedValue(new Error('Connection refused'));
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body.status).toBe('degraded');
      expect(body.db).toBe('disconnected');
    });
  });

  describe('GET /ready', () => {
    it('should return 200 when all checks pass', async () => {
      mockPrismaQueryRaw.mockResolvedValue([{ '?column?': 1 }]);
      const res = await app.inject({ method: 'GET', url: '/ready' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ready');
      expect(body.checks.db).toBe('ready');
    });

    it('should return 503 when DB check fails', async () => {
      mockPrismaQueryRaw.mockRejectedValue(new Error('Connection refused'));
      const res = await app.inject({ method: 'GET', url: '/ready' });
      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body.status).toBe('not_ready');
      expect(body.checks.db).toBe('not_ready');
    });
  });
});
