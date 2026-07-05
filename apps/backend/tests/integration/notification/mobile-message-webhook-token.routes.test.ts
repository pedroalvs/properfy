import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { registerNotificationRoutes } from '../../../src/modules/notification/interfaces/notification.routes';

const WEBHOOK_TOKEN = 'integration-test-secret';
const mockHandleProviderWebhookExecute = vi.fn();
const noop = { execute: vi.fn() };

function buildMinimalApp(token: string | undefined): FastifyInstance {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  void registerNotificationRoutes(app, {
    sendNotificationUseCase: noop,
    retryNotificationUseCase: noop,
    handleProviderWebhookUseCase: { execute: mockHandleProviderWebhookExecute },
    listNotificationsUseCase: noop,
    getNotificationUseCase: noop,
    upsertNotificationTemplateUseCase: noop,
    listNotificationTemplatesUseCase: noop,
    createNotificationUseCase: noop,
    pollRetryableNotificationsUseCase: noop,
    dispatchRemindersUseCase: noop,
    dispatchEscalationsUseCase: noop,
    processUnsubscribeUseCase: noop,
    renderUnsubscribePageUseCase: { execute: vi.fn().mockReturnValue({ ok: false, reason: 'invalid' as const }) },
    listConsentsByRecipientUseCase: noop,
    overrideConsentUseCase: noop,
    reOptInUseCase: noop,
    jwtService: { verify: vi.fn(), signAccessToken: vi.fn() } as any,
    tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true }) },
    webhookSignatureValidator: { validateResend: vi.fn().mockReturnValue(true) },
    mobileMessageWebhookToken: token,
  });
  return app;
}

let app: FastifyInstance;

beforeAll(async () => {
  app = buildMinimalApp(WEBHOOK_TOKEN);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('POST /v1/webhooks/mobile-message — token enforcement', () => {
  it('returns 401 when token is configured but not provided', async () => {
    const res = await supertest(app.server)
      .post('/v1/webhooks/mobile-message')
      .send({ message_id: 'mm-1', status: 'delivered' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(mockHandleProviderWebhookExecute).not.toHaveBeenCalled();
  });

  it('returns 401 when wrong token is provided', async () => {
    const res = await supertest(app.server)
      .post('/v1/webhooks/mobile-message?token=wrong-token')
      .send({ message_id: 'mm-1', status: 'delivered' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(mockHandleProviderWebhookExecute).not.toHaveBeenCalled();
  });

  it('returns 200 and processes event when correct token is provided', async () => {
    mockHandleProviderWebhookExecute.mockResolvedValueOnce(undefined);

    const res = await supertest(app.server)
      .post(`/v1/webhooks/mobile-message?token=${WEBHOOK_TOKEN}`)
      .send({ message_id: 'mm-2', status: 'delivered' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(mockHandleProviderWebhookExecute).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'mobile-message', providerMessageId: 'mm-2', event: 'delivered' }),
    );
  });

  it('returns 401 when no token is configured (fail closed, all environments)', async () => {
    const devApp = buildMinimalApp(undefined);
    await devApp.ready();

    mockHandleProviderWebhookExecute.mockClear();
    const res = await supertest(devApp.server)
      .post('/v1/webhooks/mobile-message')
      .send({ message_id: 'mm-3', status: 'delivered' });

    expect(res.status).toBe(401);
    expect(mockHandleProviderWebhookExecute).not.toHaveBeenCalled();
    await devApp.close();
  });

  it('returns 401 even when a token is provided but none is configured', async () => {
    const devApp = buildMinimalApp(undefined);
    await devApp.ready();

    mockHandleProviderWebhookExecute.mockClear();
    const res = await supertest(devApp.server)
      .post('/v1/webhooks/mobile-message?token=anything')
      .send({ message_id: 'mm-3', status: 'delivered' });

    expect(res.status).toBe(401);
    expect(mockHandleProviderWebhookExecute).not.toHaveBeenCalled();
    await devApp.close();
  });
});
