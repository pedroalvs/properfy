import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listNotificationsQuerySchema,
  upsertNotificationTemplateSchema,
  listNotificationTemplatesQuerySchema,
  notificationResponseSchema,
  notificationTemplateResponseSchema,
  webhookAckResponseSchema,
  successResponseSchema,
  paginatedResponseSchema,
  listConsentsQuerySchema,
  overrideConsentSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { success, paginated } from '../../../shared/interfaces/response';
import type { SendNotificationUseCase } from '../application/use-cases/send-notification.use-case';
import type { ProcessUnsubscribeUseCase } from '../application/use-cases/process-unsubscribe.use-case';
import { InvalidUnsubscribeTokenError } from '../application/use-cases/process-unsubscribe.use-case';
import type { RenderUnsubscribePageUseCase } from '../application/use-cases/render-unsubscribe-page.use-case';
import type { ListConsentsByRecipientUseCase } from '../application/use-cases/list-consents-by-recipient.use-case';
import type { OverrideConsentUseCase } from '../application/use-cases/override-consent.use-case';
import type { ReOptInUseCase } from '../application/use-cases/re-opt-in.use-case';
import { renderUnsubscribePageHtml } from './unsubscribe-page.renderer';
import type { RetryNotificationUseCase } from '../application/use-cases/retry-notification.use-case';
import type { HandleProviderWebhookUseCase } from '../application/use-cases/handle-provider-webhook.use-case';
import type { ListNotificationsUseCase } from '../application/use-cases/list-notifications.use-case';
import type { GetNotificationUseCase } from '../application/use-cases/get-notification.use-case';
import type { UpsertNotificationTemplateUseCase } from '../application/use-cases/upsert-notification-template.use-case';
import type { ListNotificationTemplatesUseCase } from '../application/use-cases/list-notification-templates.use-case';
import type { CreateNotificationUseCase } from '../application/use-cases/create-notification.use-case';
import type { PollRetryableNotificationsUseCase } from '../application/use-cases/poll-retryable-notifications.use-case';
import type { DispatchRemindersUseCase } from '../application/use-cases/dispatch-reminders.use-case';
import type { DispatchEscalationsUseCase } from '../application/use-cases/dispatch-escalations.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';
import type { WebhookSignatureValidator } from '../infrastructure/webhook-signature-validator';
import { timingSafeEqual } from 'node:crypto';

export function isMobileMessageTokenValid(provided: string | undefined, expected: string | undefined): boolean {
  if (!expected) return true;
  if (!provided) return false;
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export interface NotificationRouteContainer {
  sendNotificationUseCase: SendNotificationUseCase;
  retryNotificationUseCase: RetryNotificationUseCase;
  handleProviderWebhookUseCase: HandleProviderWebhookUseCase;
  listNotificationsUseCase: ListNotificationsUseCase;
  getNotificationUseCase: GetNotificationUseCase;
  upsertNotificationTemplateUseCase: UpsertNotificationTemplateUseCase;
  listNotificationTemplatesUseCase: ListNotificationTemplatesUseCase;
  createNotificationUseCase: CreateNotificationUseCase;
  pollRetryableNotificationsUseCase: PollRetryableNotificationsUseCase;
  dispatchRemindersUseCase: DispatchRemindersUseCase;
  dispatchEscalationsUseCase: DispatchEscalationsUseCase;
  processUnsubscribeUseCase: ProcessUnsubscribeUseCase;
  renderUnsubscribePageUseCase: RenderUnsubscribePageUseCase;
  listConsentsByRecipientUseCase: ListConsentsByRecipientUseCase;
  overrideConsentUseCase: OverrideConsentUseCase;
  reOptInUseCase: ReOptInUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
  webhookSignatureValidator: WebhookSignatureValidator;
  mobileMessageWebhookToken?: string;
}

const notificationIdParam = z.object({ notificationId: z.string().uuid() });
const templateParam = z.object({ templateCode: z.string(), channel: z.string() });

export async function registerNotificationRoutes(
  app: FastifyInstance,
  container: NotificationRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  // GET /v1/notifications
  app.get(
    '/v1/notifications',
    { preHandler: authenticate, schema: { querystring: listNotificationsQuerySchema, response: { 200: paginatedResponseSchema(notificationResponseSchema) } } },
    async (request, reply) => {
      const parsed = listNotificationsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }
      const { page, pageSize } = parsed.data;
      const result = await container.listNotificationsUseCase.execute({
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(paginated(result.data, result.total, page, pageSize));
    },
  );

  // GET /v1/notifications/:notificationId
  app.get(
    '/v1/notifications/:notificationId',
    { preHandler: authenticate, schema: { params: z.object({ notificationId: z.string().uuid() }), response: { 200: successResponseSchema(notificationResponseSchema) } } },
    async (request, reply) => {
      const params = notificationIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid notification ID', params.error.errors);
      }
      const result = await container.getNotificationUseCase.execute({
        notificationId: params.data.notificationId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/notifications/:notificationId/retry
  app.post(
    '/v1/notifications/:notificationId/retry',
    { preHandler: authenticate, schema: { params: z.object({ notificationId: z.string().uuid() }), response: { 200: successResponseSchema(notificationResponseSchema) } } },
    async (request, reply) => {
      const params = notificationIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid notification ID', params.error.errors);
      }
      const result = await container.retryNotificationUseCase.execute({
        notificationId: params.data.notificationId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/webhooks/resend
  app.post(
    '/v1/webhooks/resend',
    { schema: { response: { 200: webhookAckResponseSchema } } },
    async (request, reply) => {
      const rawBody = typeof request.body === 'string'
        ? request.body
        : JSON.stringify(request.body);
      const headers = request.headers as Record<string, string | undefined>;

      const valid = container.webhookSignatureValidator.validateResend(
        {
          'svix-id': headers['svix-id'],
          'svix-timestamp': headers['svix-timestamp'],
          'svix-signature': headers['svix-signature'],
        },
        rawBody,
      );
      if (!valid) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid webhook signature' } });
      }

      const body = typeof request.body === 'string'
        ? (JSON.parse(request.body) as { type?: string; data?: { id?: string } })
        : (request.body as { type?: string; data?: { id?: string } });
      const providerMessageId = body?.data?.id;
      const eventType = body?.type;

      if (providerMessageId && eventType) {
        let event: string | null = null;
        if (eventType === 'email.delivered') event = 'delivered';
        else if (eventType === 'email.bounced') event = 'bounced';
        else if (eventType === 'email.complained') event = 'failed';

        if (event) {
          await container.handleProviderWebhookUseCase.execute({
            provider: 'resend',
            providerMessageId,
            event,
            occurredAt: new Date().toISOString(),
            rawPayload: body,
          });
        }
      }

      return reply.status(200).send({ received: true });
    },
  );

  // POST /v1/webhooks/mobile-message
  // MobileMessage has no webhook signing support (confirmed 2026-04-22 via dashboard).
  // Token enforcement via ?token= query param when MOBILE_MESSAGE_WEBHOOK_TOKEN is set.
  app.post(
    '/v1/webhooks/mobile-message',
    { schema: { response: { 200: webhookAckResponseSchema } } },
    async (request, reply) => {
      const providedToken = (request.query as Record<string, string | undefined>)['token'];
      if (!isMobileMessageTokenValid(providedToken, container.mobileMessageWebhookToken)) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing webhook token' } });
      }

      const body = request.body as { message_id?: string; status?: string };
      const providerMessageId = body?.message_id;
      const status = body?.status;

      if (providerMessageId && status) {
        let event: string | null = null;
        if (status === 'delivered') event = 'delivered';
        else if (status === 'failed' || status === 'undelivered') event = 'failed';

        if (event) {
          await container.handleProviderWebhookUseCase.execute({
            provider: 'mobile-message',
            providerMessageId,
            event,
            occurredAt: new Date().toISOString(),
            rawPayload: body,
          });
        }
      }

      return reply.status(200).send({ received: true });
    },
  );

  // GET /v1/notification-templates
  app.get(
    '/v1/notification-templates',
    { preHandler: authenticate, schema: { querystring: listNotificationTemplatesQuerySchema, response: { 200: paginatedResponseSchema(notificationTemplateResponseSchema) } } },
    async (request, reply) => {
      const parsed = listNotificationTemplatesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }
      const result = await container.listNotificationTemplatesUseCase.execute({
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(paginated(result.data, result.data.length, 1, result.data.length || 10));
    },
  );

  // GET /v1/notifications/unsubscribe (public, no auth)
  // Renders the HTML confirmation page for the recipient to click "Confirm".
  // Always returns 200 to prevent information leakage via status probing.
  app.get(
    '/v1/notifications/unsubscribe',
    async (request, reply) => {
      const query = request.query as { token?: string } | undefined;
      const token = typeof query?.token === 'string' ? query.token : '';

      const result = container.renderUnsubscribePageUseCase.execute({ token });

      let html: string;
      if (result.ok) {
        html = renderUnsubscribePageHtml({
          state: 'confirm',
          recipient: result.recipient,
          channel: result.channel,
          token,
        });
      } else if (result.reason === 'expired') {
        html = renderUnsubscribePageHtml({ state: 'expired' });
      } else {
        html = renderUnsubscribePageHtml({ state: 'invalid' });
      }

      return reply.status(200).header('content-type', 'text/html; charset=utf-8').send(html);
    },
  );

  // POST /v1/notifications/unsubscribe (public, no auth required)
  // Accepts both application/json (API clients) and application/x-www-form-urlencoded
  // (HTML form submissions from the GET confirmation page).
  app.post(
    '/v1/notifications/unsubscribe',
    async (request, reply) => {
      const body = request.body as { token?: string } | undefined;
      const isFormSubmission = (request.headers['content-type'] ?? '').includes(
        'application/x-www-form-urlencoded',
      );

      if (!body?.token || typeof body.token !== 'string') {
        if (isFormSubmission) {
          const html = renderUnsubscribePageHtml({ state: 'invalid' });
          return reply.status(200).header('content-type', 'text/html; charset=utf-8').send(html);
        }
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'token is required' },
        });
      }

      try {
        const result = await container.processUnsubscribeUseCase.execute({
          token: body.token,
          requestId: request.id,
          ipAddress: request.ip,
        });

        if (isFormSubmission) {
          const html = renderUnsubscribePageHtml({
            state: 'success',
            recipient: result.recipient,
            channel: result.channel,
            token: body.token, // allow the page to render a re-opt-in link
          });
          return reply.status(200).header('content-type', 'text/html; charset=utf-8').send(html);
        }

        return reply.status(200).send({
          data: {
            message: 'Successfully unsubscribed',
            recipient: result.recipient,
            channel: result.channel,
            notificationClass: result.notificationClass,
          },
        });
      } catch (error) {
        if (isFormSubmission && error instanceof InvalidUnsubscribeTokenError) {
          const state = error.reason === 'expired' ? 'expired' : 'invalid';
          const html = renderUnsubscribePageHtml({ state });
          return reply.status(200).header('content-type', 'text/html; charset=utf-8').send(html);
        }
        throw error;
      }
    },
  );

  // Feature 018 US6: POST /v1/notifications/re-opt-in (public, no auth required)
  // Flips a previously opted-out consent back to opted-in via the same token flow.
  app.post(
    '/v1/notifications/re-opt-in',
    async (request, reply) => {
      const body = request.body as { token?: string } | undefined;
      const isFormSubmission = (request.headers['content-type'] ?? '').includes(
        'application/x-www-form-urlencoded',
      );

      if (!body?.token || typeof body.token !== 'string') {
        if (isFormSubmission) {
          const html = renderUnsubscribePageHtml({ state: 'invalid' });
          return reply.status(200).header('content-type', 'text/html; charset=utf-8').send(html);
        }
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'token is required' },
        });
      }

      try {
        const result = await container.reOptInUseCase.execute({
          token: body.token,
          requestId: request.id,
          ipAddress: request.ip,
        });

        if (isFormSubmission) {
          // Render the success page (generic — reuses the unsubscribe success template shape)
          const html = renderUnsubscribePageHtml({
            state: 'success',
            recipient: result.recipient,
            channel: result.channel,
          });
          return reply.status(200).header('content-type', 'text/html; charset=utf-8').send(html);
        }

        return reply.status(200).send({
          data: {
            message: 'Successfully re-subscribed',
            recipient: result.recipient,
            channel: result.channel,
            notificationClass: result.notificationClass,
          },
        });
      } catch (error) {
        if (isFormSubmission && error instanceof InvalidUnsubscribeTokenError) {
          const state = error.reason === 'expired' ? 'expired' : 'invalid';
          const html = renderUnsubscribePageHtml({ state });
          return reply.status(200).header('content-type', 'text/html; charset=utf-8').send(html);
        }
        throw error;
      }
    },
  );

  // Feature 018 US3: GET /v1/notifications/consents — operator consent lookup
  app.get(
    '/v1/notifications/consents',
    { preHandler: authenticate },
    async (request, reply) => {
      const parsed = listConsentsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }
      const result = await container.listConsentsByRecipientUseCase.execute({
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // Feature 018 US4: POST /v1/notifications/consents/:id/override — operator override
  app.post(
    '/v1/notifications/consents/:consentId/override',
    { preHandler: authenticate },
    async (request, reply) => {
      const params = z.object({ consentId: z.string().uuid() }).safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid consent id', params.error.errors);
      }
      const body = overrideConsentSchema.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError('Request payload is invalid', body.error.errors);
      }
      const result = await container.overrideConsentUseCase.execute({
        consentId: params.data.consentId,
        reason: body.data.reason,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // PUT /v1/notification-templates/:templateCode/:channel
  app.put(
    '/v1/notification-templates/:templateCode/:channel',
    { preHandler: authenticate, schema: { params: z.object({ templateCode: z.string(), channel: z.string() }), body: upsertNotificationTemplateSchema, response: { 200: successResponseSchema(notificationTemplateResponseSchema) } } },
    async (request, reply) => {
      const params = templateParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid template parameters', params.error.errors);
      }
      const parsed = upsertNotificationTemplateSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.upsertNotificationTemplateUseCase.execute({
        templateCode: params.data.templateCode,
        channel: params.data.channel,
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );
}
