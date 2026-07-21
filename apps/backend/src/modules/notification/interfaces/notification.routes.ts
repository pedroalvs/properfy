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
  AU_E164_REGEX,
  templatePreviewRequestSchema,
  templatePreviewResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { success, paginated } from '../../../shared/interfaces/response';
import type { SendNotificationUseCase } from '../application/use-cases/send-notification.use-case';
import type { ListConsentsByRecipientUseCase } from '../application/use-cases/list-consents-by-recipient.use-case';
import type { OverrideConsentUseCase } from '../application/use-cases/override-consent.use-case';
import type { RetryNotificationUseCase } from '../application/use-cases/retry-notification.use-case';
import type { HandleProviderWebhookUseCase } from '../application/use-cases/handle-provider-webhook.use-case';
import type { ListNotificationsUseCase } from '../application/use-cases/list-notifications.use-case';
import type { GetNotificationUseCase } from '../application/use-cases/get-notification.use-case';
import type { UpsertNotificationTemplateUseCase } from '../application/use-cases/upsert-notification-template.use-case';
import type { DeleteNotificationTemplateUseCase } from '../application/use-cases/delete-notification-template.use-case';
import type { RenderTemplatePreviewUseCase } from '../application/use-cases/render-template-preview.use-case';
import type { SendTestNotificationUseCase } from '../application/use-cases/send-test-notification.use-case';
import type { ListNotificationTemplatesUseCase } from '../application/use-cases/list-notification-templates.use-case';
import type { CreateNotificationUseCase } from '../application/use-cases/create-notification.use-case';
import type { PollRetryableNotificationsUseCase } from '../application/use-cases/poll-retryable-notifications.use-case';
import type { PollSmsDeliveryUseCase } from '../application/use-cases/poll-sms-delivery.use-case';
import type { DispatchRemindersUseCase } from '../application/use-cases/dispatch-reminders.use-case';
import type { DispatchEscalationsUseCase } from '../application/use-cases/dispatch-escalations.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';
import type { WebhookSignatureValidator } from '../infrastructure/webhook-signature-validator';
import { timingSafeEqual } from 'node:crypto';

export function isMobileMessageTokenValid(provided: string | undefined, expected: string | undefined): boolean {
  // Fail closed: with no token configured the webhook accepts nothing, in any
  // environment — delivery-receipt spoofing must never be possible.
  if (!expected) return false;
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
  deleteNotificationTemplateUseCase: DeleteNotificationTemplateUseCase;
  renderTemplatePreviewUseCase: RenderTemplatePreviewUseCase;
  sendTestNotificationUseCase: SendTestNotificationUseCase;
  listNotificationTemplatesUseCase: ListNotificationTemplatesUseCase;
  createNotificationUseCase: CreateNotificationUseCase;
  pollRetryableNotificationsUseCase: PollRetryableNotificationsUseCase;
  pollSmsDeliveryUseCase: PollSmsDeliveryUseCase;
  dispatchRemindersUseCase: DispatchRemindersUseCase;
  dispatchEscalationsUseCase: DispatchEscalationsUseCase;
  listConsentsByRecipientUseCase: ListConsentsByRecipientUseCase;
  overrideConsentUseCase: OverrideConsentUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
  webhookSignatureValidator: WebhookSignatureValidator;
  /** Resolves the current webhook shared secret (database config → env fallback). */
  getMobileMessageWebhookToken?: () => Promise<string | undefined>;
}

const SMS_PER_MINUTE_LIMIT = 3;
const SMS_PER_DAY_LIMIT = 20;

interface SmsRateLimitEntry {
  minute: string;
  minuteCount: number;
  day: string;
  dayCount: number;
}
const smsRateLimitCounts = new Map<string, SmsRateLimitEntry>();

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
  // Auth via ?token= query param (MOBILE_MESSAGE_WEBHOOK_TOKEN). Mandatory: with no
  // token configured the endpoint rejects everything (fail closed).
  app.post(
    '/v1/webhooks/mobile-message',
    { schema: { response: { 200: webhookAckResponseSchema } } },
    async (request, reply) => {
      const providedToken = (request.query as Record<string, string | undefined>)['token'];
      const expectedToken = await container.getMobileMessageWebhookToken?.();
      if (!isMobileMessageTokenValid(providedToken, expectedToken)) {
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

  // POST /v1/notification-templates/:templateCode/:channel/test-send
  const testSendParam = z.object({
    templateCode: z.string().min(1).max(100).regex(/^[A-Z0-9_]+$/),
    channel: z.enum(['EMAIL', 'SMS']),
  });
  app.post(
    '/v1/notification-templates/:templateCode/:channel/test-send',
    { preHandler: authenticate, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const params = testSendParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid template parameters', params.error.errors);
      }
      const isSms = params.data.channel === 'SMS';

      if (isSms) {
        const actor = request.authContext!;
        const key = actor.userId ?? request.ip;
        const now = new Date();
        const minuteKey = now.toISOString().slice(0, 16);
        const dayKey = now.toISOString().slice(0, 10);
        const entry = smsRateLimitCounts.get(key);
        const sameMinute = entry?.minute === minuteKey;
        const sameDay = entry?.day === dayKey;
        const minuteCount = sameMinute ? entry!.minuteCount : 0;
        const dayCount = sameDay ? entry!.dayCount : 0;
        if (minuteCount >= SMS_PER_MINUTE_LIMIT) {
          return reply.status(429).send({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many SMS test requests. Try again in a minute.' } });
        }
        if (dayCount >= SMS_PER_DAY_LIMIT) {
          return reply.status(429).send({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Daily SMS test limit reached.' } });
        }
        smsRateLimitCounts.set(key, {
          minute: minuteKey,
          minuteCount: minuteCount + 1,
          day: dayKey,
          dayCount: dayCount + 1,
        });
      }

      const bodySchema = isSms
        ? z.object({ recipientPhone: z.string().regex(AU_E164_REGEX, 'Phone must be in E.164 AU format (e.g. +61412345678)') })
        : z.object({ recipientEmail: z.string().email() });
      const body = bodySchema.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError('Request payload is invalid', body.error.errors);
      }
      const recipient = isSms
        ? (body.data as { recipientPhone: string }).recipientPhone
        : (body.data as { recipientEmail: string }).recipientEmail;
      const result = await container.sendTestNotificationUseCase.execute({
        templateCode: params.data.templateCode,
        channel: params.data.channel,
        recipient,
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

  // DELETE /v1/notification-templates/:templateId — hard-delete a tenant override (AM/OP)
  app.delete(
    '/v1/notification-templates/:templateId',
    { preHandler: authenticate, schema: { params: z.object({ templateId: z.string().uuid() }), response: { 204: z.null() } } },
    async (request, reply) => {
      const params = z.object({ templateId: z.string().uuid() }).safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid template id', params.error.errors);
      }
      await container.deleteNotificationTemplateUseCase.execute({
        templateId: params.data.templateId,
        actor: request.authContext!,
      });
      return reply.status(204).send();
    },
  );

  // POST /v1/notification-templates/:templateCode/:channel/preview
  app.post(
    '/v1/notification-templates/:templateCode/:channel/preview',
    { preHandler: authenticate, schema: { params: z.object({ templateCode: z.string(), channel: z.string() }), body: templatePreviewRequestSchema, response: { 200: successResponseSchema(templatePreviewResponseSchema) } } },
    async (request, reply) => {
      const params = templateParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid template parameters', params.error.errors);
      }
      const parsed = templatePreviewRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.renderTemplatePreviewUseCase.execute({
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );
}
