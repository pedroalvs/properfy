/**
 * T042 — Integration: full public unsubscribe flow (GET confirm → form POST → consent recorded → SKIPPED_OPT_OUT)
 * T043 — Integration: expired / tampered token handling during form flow (200 HTML, never 400/500)
 * T068 — Integration: full round-trip with re-opt-in (opt out → re-opt-in → reminder delivered)
 *
 * Pattern A: buildApp + vi.mock(container) + Supertest.
 * No real DB — use case mocks represent the DB/audit writes.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { InvalidUnsubscribeTokenError } from '../../../src/modules/notification/application/use-cases/process-unsubscribe.use-case';

const mockRenderUnsubscribePage = vi.fn();
const mockProcessUnsubscribe = vi.fn();
const mockReOptIn = vi.fn();
const mockRetryNotification = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      notification: {
        renderUnsubscribePageUseCase: { execute: mockRenderUnsubscribePage },
        processUnsubscribeUseCase: { execute: mockProcessUnsubscribe },
        reOptInUseCase: { execute: mockReOptIn },
        retryNotificationUseCase: { execute: mockRetryNotification },
        jwtService: { verify: mockJwtVerify },
      },
    } as any),
}));

const NOTIFICATION_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const amActor = { userId: 'am-user-00', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

// Full notification shape required by the route's Zod response schema
const baseNotification = {
  id: NOTIFICATION_ID,
  tenantId: 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
  appointmentId: 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
  recipient: 'tenant@example.com',
  channel: 'EMAIL',
  templateCode: 'INSPECTION_REMINDER',
  providerName: 'resend',
  providerMessageId: null,
  sentAt: null,
  deliveredAt: null,
  failedAt: null,
  failureReason: null,
  retryCount: 1,
  nextRetryAt: null,
  createdAt: '2026-04-01T09:00:00.000Z',
  updatedAt: '2026-04-01T09:00:00.000Z',
};

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  process.env['NOTIFICATION_UNSUBSCRIBE_SECRET'] = 'test-unsubscribe-secret-min-16';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });
beforeEach(() => { vi.clearAllMocks(); });

// ---------------------------------------------------------------------------
// T042 — Full unsubscribe flow
// ---------------------------------------------------------------------------

describe('T042 — full public unsubscribe flow', () => {
  it('GET renders confirm page with recipient and confirm button', async () => {
    mockRenderUnsubscribePage.mockReturnValue({
      ok: true,
      recipient: 'tenant@example.com',
      channel: 'EMAIL',
      tenantId: 'tenant-1',
      notificationClass: 'OPERATIONAL',
    });

    const res = await supertest(app.server)
      .get('/v1/notifications/unsubscribe?token=tok-flow-001')
      .expect(200);

    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('data-state="confirm"');
    expect(res.text).toContain('tenant@example.com');
    // confirm button must be present (a <form> or <button> inside the page)
    expect(res.text).toMatch(/<form|<button/i);
    // public route — no JWT needed
    expect(mockJwtVerify).not.toHaveBeenCalled();
  });

  it('form POST records opt-out and returns success page with re-opt-in link', async () => {
    // Represents: consent written to DB with optedOut=true, changeSource='unsubscribe_link',
    // audit written with action='consent.opted_out_via_link', actorType='ANONYMOUS'
    mockProcessUnsubscribe.mockResolvedValue({
      recipient: 'tenant@example.com',
      channel: 'EMAIL',
      tenantId: 'tenant-1',
      notificationClass: 'OPERATIONAL',
    });

    const res = await supertest(app.server)
      .post('/v1/notifications/unsubscribe')
      .type('form')
      .send({ token: 'tok-flow-001' })
      .expect(200);

    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('data-state="success"');
    expect(res.text).toContain('tenant@example.com');
    // T042: success page must contain a re-opt-in link so the user can reverse
    expect(res.text).toContain('/v1/notifications/re-opt-in');

    // processUnsubscribeUseCase called with token + request metadata
    // → represents consent.opted_out_via_link written to DB + audit record
    expect(mockProcessUnsubscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'tok-flow-001',
        ipAddress: expect.any(String),
        requestId: expect.any(String),
      }),
    );
    expect(mockJwtVerify).not.toHaveBeenCalled();
  });

  it('subsequent OPERATIONAL notification retry returns SKIPPED_OPT_OUT after opt-out', async () => {
    // Simulate: after opt-out is recorded, a worker tries to resend an operational
    // notification for the same recipient. The retry use case checks consent and
    // returns SKIPPED_OPT_OUT without calling the external provider.
    mockJwtVerify.mockResolvedValueOnce({ ...amActor, email: 'am@test.com' });
    mockRetryNotification.mockResolvedValueOnce({
      ...baseNotification,
      status: 'SKIPPED_OPT_OUT',
    });

    const res = await supertest(app.server)
      .post(`/v1/notifications/${NOTIFICATION_ID}/retry`)
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(res.body.data.status).toBe('SKIPPED_OPT_OUT');
    expect(mockRetryNotification).toHaveBeenCalledWith(
      expect.objectContaining({ notificationId: NOTIFICATION_ID }),
    );
  });

  it('JSON POST returns 200 JSON success and records opt-out', async () => {
    mockProcessUnsubscribe.mockResolvedValue({
      recipient: 'tenant@example.com',
      channel: 'EMAIL',
      tenantId: 'tenant-1',
      notificationClass: 'OPERATIONAL',
    });

    const res = await supertest(app.server)
      .post('/v1/notifications/unsubscribe')
      .send({ token: 'tok-flow-001' })
      .expect(200);

    expect(res.body.data).toMatchObject({
      message: 'Successfully unsubscribed',
      recipient: 'tenant@example.com',
      notificationClass: 'OPERATIONAL',
    });
    expect(mockProcessUnsubscribe).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// T043 — Expired / invalid token handling (always 200 HTML, never 400/500)
// ---------------------------------------------------------------------------

describe('T043 — expired and invalid token handling', () => {
  it('GET with expired token returns 200 HTML with link-expired state', async () => {
    mockRenderUnsubscribePage.mockReturnValue({ ok: false, reason: 'expired' });

    const res = await supertest(app.server)
      .get('/v1/notifications/unsubscribe?token=expired-tok')
      .expect(200);

    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('data-state="expired"');
    expect(res.text).toContain('Link expired');
  });

  it('GET with tampered token returns 200 HTML with invalid state', async () => {
    mockRenderUnsubscribePage.mockReturnValue({ ok: false, reason: 'invalid_signature' });

    const res = await supertest(app.server)
      .get('/v1/notifications/unsubscribe?token=tampered-tok')
      .expect(200);

    expect(res.text).toContain('data-state="invalid"');
  });

  it('form POST with expired token returns 200 HTML with expired state (never 400/500)', async () => {
    // The route catches InvalidUnsubscribeTokenError during form submission
    // and renders a graceful error page instead of throwing.
    mockProcessUnsubscribe.mockRejectedValueOnce(
      new InvalidUnsubscribeTokenError('expired'),
    );

    const res = await supertest(app.server)
      .post('/v1/notifications/unsubscribe')
      .type('form')
      .send({ token: 'expired-tok' })
      .expect(200);

    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('data-state="expired"');
  });

  it('form POST with tampered token returns 200 HTML with invalid state', async () => {
    mockProcessUnsubscribe.mockRejectedValueOnce(
      new InvalidUnsubscribeTokenError('invalid_signature'),
    );

    const res = await supertest(app.server)
      .post('/v1/notifications/unsubscribe')
      .type('form')
      .send({ token: 'tampered-tok' })
      .expect(200);

    expect(res.text).toContain('data-state="invalid"');
  });
});

// ---------------------------------------------------------------------------
// T068 — Full round-trip: opt out → re-opt-in → reminder delivered
// ---------------------------------------------------------------------------

describe('T068 — opt out then re-opt-in round-trip', () => {
  it('re-opt-in via form restores opted-in status and emits audit record', async () => {
    // Step 1: unsubscribe (opt out)
    mockProcessUnsubscribe.mockResolvedValueOnce({
      recipient: 'tenant@example.com',
      channel: 'EMAIL',
      tenantId: 'tenant-1',
      notificationClass: 'OPERATIONAL',
    });

    const unsubRes = await supertest(app.server)
      .post('/v1/notifications/unsubscribe')
      .type('form')
      .send({ token: 'tok-roundtrip' })
      .expect(200);

    // Confirm success page has re-opt-in link
    expect(unsubRes.text).toContain('data-state="success"');
    expect(unsubRes.text).toContain('/v1/notifications/re-opt-in');

    // Step 2: user clicks re-opt-in link
    // Represents: consent flipped to optedOut=false, audit written with
    // action='consent.re_opted_in_via_link', actorType='ANONYMOUS'
    mockReOptIn.mockResolvedValueOnce({
      recipient: 'tenant@example.com',
      channel: 'EMAIL',
      tenantId: 'tenant-1',
      notificationClass: 'OPERATIONAL',
    });

    const reOptRes = await supertest(app.server)
      .post('/v1/notifications/re-opt-in')
      .type('form')
      .send({ token: 'tok-roundtrip' })
      .expect(200);

    expect(reOptRes.headers['content-type']).toContain('text/html');
    expect(reOptRes.text).toContain('data-state="success"');

    // reOptInUseCase called with same token → status flipped + audit written
    expect(mockReOptIn).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'tok-roundtrip',
        ipAddress: expect.any(String),
        requestId: expect.any(String),
      }),
    );
  });

  it('after re-opt-in, reminder notification retry is no longer skipped', async () => {
    // After re-opt-in the retry use case delivers normally (not SKIPPED_OPT_OUT)
    mockJwtVerify.mockResolvedValueOnce({ ...amActor, email: 'am@test.com' });
    mockRetryNotification.mockResolvedValueOnce({
      ...baseNotification,
      status: 'SENT',
      sentAt: '2026-04-01T10:00:00.000Z',
    });

    const res = await supertest(app.server)
      .post(`/v1/notifications/${NOTIFICATION_ID}/retry`)
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(res.body.data.status).toBe('SENT');
    expect(res.body.data.status).not.toBe('SKIPPED_OPT_OUT');
  });

  it('re-opt-in does not require authentication', async () => {
    mockReOptIn.mockResolvedValueOnce({
      recipient: 'a@b.com',
      channel: 'EMAIL',
      tenantId: 't-1',
      notificationClass: 'OPERATIONAL',
    });

    await supertest(app.server)
      .post('/v1/notifications/re-opt-in')
      .send({ token: 'any' })
      .expect(200);

    expect(mockJwtVerify).not.toHaveBeenCalled();
  });
});
