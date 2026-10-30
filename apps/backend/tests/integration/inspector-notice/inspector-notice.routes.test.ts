import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/main/server';
import { createMockContainer } from '../../helpers/mock-container';

const NOTICE_ID = '11111111-1111-4111-8111-111111111111';

const publish = vi.fn();
const list = vi.fn();
const detail = vi.fn();
const archive = vi.fn();
const listMy = vi.fn();
const getMy = vi.fn();
const markRead = vi.fn();
const unread = vi.fn();
const pushConfig = vi.fn();
const upsert = vi.fn();
const unsubscribe = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      inspectorNotice: {
        publishInspectorNoticeUseCase: { execute: publish },
        listInspectorNoticesUseCase: { execute: list },
        getInspectorNoticeUseCase: { execute: detail },
        archiveInspectorNoticeUseCase: { execute: archive },
        listMyInspectorNoticesUseCase: { execute: listMy },
        getMyInspectorNoticeUseCase: { execute: getMy },
        markInspectorNoticeReadUseCase: { execute: markRead },
        countMyUnreadInspectorNoticesUseCase: { execute: unread },
        getPushConfigUseCase: { execute: pushConfig },
        upsertPushSubscriptionUseCase: { execute: upsert },
        unsubscribePushSubscriptionUseCase: { execute: unsubscribe },
        jwtService: { verify: mockJwtVerify },
      },
    }),
}));

const SUMMARY = {
  id: NOTICE_ID,
  title: 'Road closure',
  body: 'Pacific Hwy closed',
  critical: true,
  audience: { type: 'ALL' },
  author: { type: 'USER', name: 'Ana Op' },
  publishedAt: '2026-11-10T00:00:00.000Z',
  archivedAt: null,
  recipientCount: 3,
  readCount: 0,
};
const DETAIL = {
  ...SUMMARY,
  recipients: [
    { inspectorId: 'i1', inspectorName: 'Alice', readAt: null, inspectorStatus: 'ACTIVE', hasAppAccess: true },
  ],
};
const MY = { id: NOTICE_ID, title: 'T', body: 'B', critical: true, publishedAt: '2026-11-10T00:00:00.000Z', readAt: null };

function authAs(role: string, overrides: Record<string, unknown> = {}) {
  mockJwtVerify.mockReturnValue({ userId: 'user-1', tenantId: null, role, branchId: null, inspectorId: null, ...overrides });
}

const validBody = { title: 'Road closure', body: 'Pacific Hwy closed', critical: true, audience: { type: 'ALL' } };

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
  publish.mockResolvedValue(SUMMARY);
  list.mockResolvedValue({ data: [SUMMARY], total: 1 });
  detail.mockResolvedValue(DETAIL);
  archive.mockResolvedValue({ ...SUMMARY, archivedAt: '2026-11-11T00:00:00.000Z' });
  listMy.mockResolvedValue({ data: [MY], total: 1 });
  getMy.mockResolvedValue(MY);
  markRead.mockResolvedValue({ noticeId: NOTICE_ID, readAt: '2026-11-10T01:00:00.000Z' });
  unread.mockResolvedValue({ count: 2 });
  pushConfig.mockResolvedValue({ vapidPublicKey: 'BKEY' });
  upsert.mockResolvedValue(undefined);
  unsubscribe.mockResolvedValue(undefined);
});

describe('POST /v1/inspector-notices', () => {
  it('publishes with the Idempotency-Key and returns the summary envelope', async () => {
    authAs('AM');
    const res = await supertest(app.server)
      .post('/v1/inspector-notices')
      .set('Authorization', 'Bearer t')
      .set('Idempotency-Key', 'key-1')
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ id: NOTICE_ID, recipientCount: 3, readCount: 0 });
    expect(publish.mock.calls[0][0]).toMatchObject({ idempotencyKey: 'key-1', actorUserId: 'user-1' });
  });

  it('rejects an invalid payload with 400 VALIDATION_ERROR', async () => {
    authAs('OP');
    const res = await supertest(app.server)
      .post('/v1/inspector-notices')
      .set('Authorization', 'Bearer t')
      .set('Idempotency-Key', 'key-1')
      .send({ title: '', body: 'x', audience: { type: 'ALL' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('passes idempotencyKey undefined when the header is absent', async () => {
    authAs('AM');
    await supertest(app.server).post('/v1/inspector-notices').set('Authorization', 'Bearer t').send(validBody);
    expect(publish.mock.calls[0][0].idempotencyKey).toBeUndefined();
  });
});

describe('GET /v1/inspector-notices (list + detail)', () => {
  it('returns a paginated envelope', async () => {
    authAs('AM');
    const res = await supertest(app.server).get('/v1/inspector-notices?status=all').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    expect(list.mock.calls[0][0]).toMatchObject({ status: 'all' });
  });

  it('returns the detail with per-recipient status/app-access and no internal fields', async () => {
    authAs('OP');
    const res = await supertest(app.server).get(`/v1/inspector-notices/${NOTICE_ID}`).set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body.data.recipients[0]).toMatchObject({ inspectorStatus: 'ACTIVE', hasAppAccess: true });
    // Serializer strips undeclared fields: no dedupe_key / delivery_processed_at leak.
    expect(res.body.data).not.toHaveProperty('dedupeKey');
    expect(res.body.data).not.toHaveProperty('deliveryProcessedAt');
  });

  it('rejects a non-UUID id with 400', async () => {
    authAs('AM');
    const res = await supertest(app.server).get('/v1/inspector-notices/not-a-uuid').set('Authorization', 'Bearer t');
    expect(res.status).toBe(400);
  });
});

describe('inspector box routes resolve to the box use cases (static beats :inspectorId)', () => {
  it('GET /v1/inspectors/me/notices returns the my-notice list (not the inspector detail route)', async () => {
    authAs('INSP', { inspectorId: 'insp-1' });
    const res = await supertest(app.server).get('/v1/inspectors/me/notices').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(listMy).toHaveBeenCalledTimes(1);
    expect(res.body.data[0]).toMatchObject({ id: NOTICE_ID });
    expect(res.body).not.toHaveProperty('data.0.audience'); // my-notice shape has no audience
  });

  it('GET unread-count returns the count envelope', async () => {
    authAs('INSP', { inspectorId: 'insp-1' });
    const res = await supertest(app.server).get('/v1/inspectors/me/notices/unread-count').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ count: 2 });
  });

  it('POST read returns {noticeId, readAt}', async () => {
    authAs('INSP', { inspectorId: 'insp-1' });
    const res = await supertest(app.server).post(`/v1/inspectors/me/notices/${NOTICE_ID}/read`).set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ noticeId: NOTICE_ID });
  });
});

describe('push subscription routes', () => {
  it('GET push-config returns the key', async () => {
    authAs('INSP', { inspectorId: 'insp-1' });
    const res = await supertest(app.server).get('/v1/inspectors/me/push-config').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ vapidPublicKey: 'BKEY' });
  });

  it('POST subscribe returns 204 and unsubscribe returns 204', async () => {
    authAs('INSP', { inspectorId: 'insp-1' });
    const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'P', auth: 'A' } };
    const r1 = await supertest(app.server).post('/v1/inspectors/me/push-subscriptions').set('Authorization', 'Bearer t').send(sub);
    expect(r1.status).toBe(204);
    const r2 = await supertest(app.server)
      .post('/v1/inspectors/me/push-subscriptions/unsubscribe')
      .set('Authorization', 'Bearer t')
      .send({ endpoint: sub.endpoint });
    expect(r2.status).toBe(204);
  });
});
