import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/main/server';
import { createMockContainer } from '../../helpers/mock-container';

const NOTICE_ID = '11111111-1111-4111-8111-111111111111';
const mockJwtVerify = vi.fn();

const SUMMARY = {
  id: NOTICE_ID, title: 'T', body: 'B', critical: true, audience: { type: 'ALL' },
  author: { type: 'USER', name: 'A' }, publishedAt: '2026-11-10T00:00:00.000Z',
  archivedAt: null, recipientCount: 0, readCount: 0,
};
const MY = { id: NOTICE_ID, title: 'T', body: 'B', critical: true, publishedAt: '2026-11-10T00:00:00.000Z', readAt: null };

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      inspectorNotice: {
        publishInspectorNoticeUseCase: { execute: vi.fn().mockResolvedValue(SUMMARY) },
        listInspectorNoticesUseCase: { execute: vi.fn().mockResolvedValue({ data: [], total: 0 }) },
        getInspectorNoticeUseCase: { execute: vi.fn().mockResolvedValue({ ...SUMMARY, recipients: [] }) },
        archiveInspectorNoticeUseCase: { execute: vi.fn().mockResolvedValue(SUMMARY) },
        listMyInspectorNoticesUseCase: { execute: vi.fn().mockResolvedValue({ data: [], total: 0 }) },
        getMyInspectorNoticeUseCase: { execute: vi.fn().mockResolvedValue(MY) },
        markInspectorNoticeReadUseCase: { execute: vi.fn().mockResolvedValue({ noticeId: NOTICE_ID, readAt: '2026-11-10T01:00:00.000Z' }) },
        countMyUnreadInspectorNoticesUseCase: { execute: vi.fn().mockResolvedValue({ count: 0 }) },
        getPushConfigUseCase: { execute: vi.fn().mockResolvedValue({ vapidPublicKey: null }) },
        upsertPushSubscriptionUseCase: { execute: vi.fn().mockResolvedValue(undefined) },
        unsubscribePushSubscriptionUseCase: { execute: vi.fn().mockResolvedValue(undefined) },
        jwtService: { verify: mockJwtVerify },
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
beforeEach(() => mockJwtVerify.mockReset());

function ctxFor(role: string) {
  return { userId: 'u1', tenantId: role.startsWith('CL') ? 'tenant-1' : null, role, branchId: null, inspectorId: role === 'INSP' ? 'insp-1' : null };
}

const validBody = { title: 'T', body: 'B', critical: false, audience: { type: 'ALL' } };
const validSub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'P', auth: 'A' } };

interface RouteCase {
  name: string;
  method: 'get' | 'post';
  path: string;
  body?: unknown;
  idempotency?: boolean;
}

const adminRoutes: RouteCase[] = [
  { name: 'POST /v1/inspector-notices', method: 'post', path: '/v1/inspector-notices', body: validBody, idempotency: true },
  { name: 'GET /v1/inspector-notices', method: 'get', path: '/v1/inspector-notices' },
  { name: 'GET /v1/inspector-notices/:id', method: 'get', path: `/v1/inspector-notices/${NOTICE_ID}` },
  { name: 'POST /v1/inspector-notices/:id/archive', method: 'post', path: `/v1/inspector-notices/${NOTICE_ID}/archive` },
];

const inspRoutes: RouteCase[] = [
  { name: 'GET /v1/inspectors/me/notices', method: 'get', path: '/v1/inspectors/me/notices' },
  { name: 'GET /v1/inspectors/me/notices/unread-count', method: 'get', path: '/v1/inspectors/me/notices/unread-count' },
  { name: 'GET /v1/inspectors/me/notices/:id', method: 'get', path: `/v1/inspectors/me/notices/${NOTICE_ID}` },
  { name: 'POST /v1/inspectors/me/notices/:id/read', method: 'post', path: `/v1/inspectors/me/notices/${NOTICE_ID}/read` },
  { name: 'GET /v1/inspectors/me/push-config', method: 'get', path: '/v1/inspectors/me/push-config' },
  { name: 'POST /v1/inspectors/me/push-subscriptions', method: 'post', path: '/v1/inspectors/me/push-subscriptions', body: validSub },
  { name: 'POST .../push-subscriptions/unsubscribe', method: 'post', path: '/v1/inspectors/me/push-subscriptions/unsubscribe', body: { endpoint: validSub.endpoint } },
];

function send(route: RouteCase, role: string | null) {
  if (role) mockJwtVerify.mockReturnValue(ctxFor(role));
  let req = supertest(app.server)[route.method](route.path);
  if (role) req = req.set('Authorization', 'Bearer t');
  if (route.idempotency) req = req.set('Idempotency-Key', 'key-1');
  if (route.body) req = req.send(route.body);
  return req;
}

describe('inspector-notice RBAC — admin routes (AM/OP)', () => {
  for (const route of adminRoutes) {
    it(`${route.name}: AM & OP allowed`, async () => {
      for (const role of ['AM', 'OP']) {
        const res = await send(route, role);
        expect(res.status).toBeLessThan(300);
      }
    });
    it(`${route.name}: CL_ADMIN/CL_USER/INSP → 403 FORBIDDEN`, async () => {
      for (const role of ['CL_ADMIN', 'CL_USER', 'INSP']) {
        const res = await send(route, role);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
    });
    it(`${route.name}: no token → 401`, async () => {
      const res = await send(route, null);
      expect(res.status).toBe(401);
    });
  }
});

describe('inspector-notice RBAC — inspector routes (INSP, own)', () => {
  for (const route of inspRoutes) {
    it(`${route.name}: INSP allowed`, async () => {
      const res = await send(route, 'INSP');
      expect(res.status).toBeLessThan(300);
    });
    it(`${route.name}: AM/OP/CL_ADMIN/CL_USER → 403 INSP_ONLY`, async () => {
      for (const role of ['AM', 'OP', 'CL_ADMIN', 'CL_USER']) {
        const res = await send(route, role);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('INSP_ONLY');
      }
    });
    it(`${route.name}: no token → 401`, async () => {
      const res = await send(route, null);
      expect(res.status).toBe(401);
    });
  }
});
