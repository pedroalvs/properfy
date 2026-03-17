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
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { success } from '../../../shared/interfaces/response';
import type { SendNotificationUseCase } from '../application/use-cases/send-notification.use-case';
import type { RetryNotificationUseCase } from '../application/use-cases/retry-notification.use-case';
import type { HandleProviderWebhookUseCase } from '../application/use-cases/handle-provider-webhook.use-case';
import type { ListNotificationsUseCase } from '../application/use-cases/list-notifications.use-case';
import type { GetNotificationUseCase } from '../application/use-cases/get-notification.use-case';
import type { UpsertNotificationTemplateUseCase } from '../application/use-cases/upsert-notification-template.use-case';
import type { ListNotificationTemplatesUseCase } from '../application/use-cases/list-notification-templates.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface NotificationRouteContainer {
  sendNotificationUseCase: SendNotificationUseCase;
  retryNotificationUseCase: RetryNotificationUseCase;
  handleProviderWebhookUseCase: HandleProviderWebhookUseCase;
  listNotificationsUseCase: ListNotificationsUseCase;
  getNotificationUseCase: GetNotificationUseCase;
  upsertNotificationTemplateUseCase: UpsertNotificationTemplateUseCase;
  listNotificationTemplatesUseCase: ListNotificationTemplatesUseCase;
  jwtService: JwtService;
}

const notificationIdParam = z.object({ notificationId: z.string().uuid() });
const templateParam = z.object({ templateCode: z.string(), channel: z.string() });

export async function registerNotificationRoutes(
  app: FastifyInstance,
  container: NotificationRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware((token) =>
    container.jwtService.verify(token),
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
      const result = await container.listNotificationsUseCase.execute({
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(result);
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
      const body = request.body as { type?: string; data?: { id?: string } };
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

  // POST /v1/webhooks/twilio
  app.post(
    '/v1/webhooks/twilio',
    { schema: { response: { 200: webhookAckResponseSchema } } },
    async (request, reply) => {
      const body = request.body as { MessageSid?: string; MessageStatus?: string };
      const providerMessageId = body?.MessageSid;
      const messageStatus = body?.MessageStatus;

      if (providerMessageId && messageStatus) {
        let event: string | null = null;
        if (messageStatus === 'delivered') event = 'delivered';
        else if (messageStatus === 'failed' || messageStatus === 'undelivered') event = 'failed';

        if (event) {
          await container.handleProviderWebhookUseCase.execute({
            provider: 'twilio',
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

  // POST /v1/webhooks/zenvia
  app.post(
    '/v1/webhooks/zenvia',
    { schema: { response: { 200: webhookAckResponseSchema } } },
    async (request, reply) => {
      const body = request.body as { id?: string; status?: string };
      const providerMessageId = body?.id;
      const status = body?.status;

      if (providerMessageId && status) {
        let event: string | null = null;
        if (status === 'delivered') event = 'delivered';
        else if (status === 'failed' || status === 'rejected') event = 'failed';

        if (event) {
          await container.handleProviderWebhookUseCase.execute({
            provider: 'zenvia',
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
      return reply.status(200).send(result);
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
