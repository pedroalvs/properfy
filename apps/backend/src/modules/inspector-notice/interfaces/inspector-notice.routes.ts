import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  UserRole,
  listInspectorNoticesQuerySchema,
  listMyInspectorNoticesQuerySchema,
  inspectorNoticeDetailSchema,
  inspectorNoticeSummarySchema,
  myInspectorNoticeSchema,
  publishInspectorNoticeSchema,
  pushConfigResponseSchema,
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
  successResponseSchema,
  paginatedResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { requireRoles } from '../../../shared/interfaces/role-guard';
import { success, paginated } from '../../../shared/interfaces/response';
import { ForbiddenError } from '../../../shared/domain/errors';
import type { JwtService } from '../../auth/application/services/jwt.service';
import type { PublishInspectorNoticeUseCase } from '../application/use-cases/publish-inspector-notice.use-case';
import type { ArchiveInspectorNoticeUseCase } from '../application/use-cases/archive-inspector-notice.use-case';
import type { ListInspectorNoticesUseCase } from '../application/use-cases/list-inspector-notices.use-case';
import type { GetInspectorNoticeUseCase } from '../application/use-cases/get-inspector-notice.use-case';
import type { ListMyInspectorNoticesUseCase } from '../application/use-cases/list-my-inspector-notices.use-case';
import type { GetMyInspectorNoticeUseCase } from '../application/use-cases/get-my-inspector-notice.use-case';
import type { MarkInspectorNoticeReadUseCase } from '../application/use-cases/mark-inspector-notice-read.use-case';
import type { CountMyUnreadInspectorNoticesUseCase } from '../application/use-cases/count-my-unread-inspector-notices.use-case';
import type { GetPushConfigUseCase } from '../application/use-cases/get-push-config.use-case';
import type { UpsertPushSubscriptionUseCase } from '../application/use-cases/upsert-push-subscription.use-case';
import type { UnsubscribePushSubscriptionUseCase } from '../application/use-cases/unsubscribe-push-subscription.use-case';

export interface InspectorNoticeRouteContainer {
  publishInspectorNoticeUseCase: PublishInspectorNoticeUseCase;
  archiveInspectorNoticeUseCase: ArchiveInspectorNoticeUseCase;
  listInspectorNoticesUseCase: ListInspectorNoticesUseCase;
  getInspectorNoticeUseCase: GetInspectorNoticeUseCase;
  listMyInspectorNoticesUseCase: ListMyInspectorNoticesUseCase;
  getMyInspectorNoticeUseCase: GetMyInspectorNoticeUseCase;
  markInspectorNoticeReadUseCase: MarkInspectorNoticeReadUseCase;
  countMyUnreadInspectorNoticesUseCase: CountMyUnreadInspectorNoticesUseCase;
  getPushConfigUseCase: GetPushConfigUseCase;
  upsertPushSubscriptionUseCase: UpsertPushSubscriptionUseCase;
  unsubscribePushSubscriptionUseCase: UnsubscribePushSubscriptionUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

const noticeIdParam = z.object({ noticeId: z.string().uuid() });
const readResponseSchema = z.object({ noticeId: z.string(), readAt: z.string() });
const unreadCountResponseSchema = z.object({ count: z.number().int() });

function idempotencyKey(request: FastifyRequest): string | undefined {
  const value = request.headers['idempotency-key'];
  return typeof value === 'string' ? value : undefined;
}

/** INSP-only guard: 403 INSP_ONLY for any non-inspector (or an inspector without a profile id). */
function requireInspectorId(request: FastifyRequest): string {
  const actor = request.authContext;
  if (!actor || actor.role !== 'INSP' || !actor.inspectorId) {
    throw new ForbiddenError('INSP_ONLY', 'This endpoint is only accessible to inspectors');
  }
  return actor.inspectorId;
}

export async function registerInspectorNoticeRoutes(
  app: FastifyInstance,
  container: InspectorNoticeRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );
  const adminOnly = [authenticate, requireRoles([UserRole.AM, UserRole.OP])];

  // Per-user rate limit for push subscription endpoints (10/min). hook: 'preHandler' so the
  // key generator sees authContext (populated by the authenticate preHandler).
  const perUserRateLimit = {
    max: 10,
    timeWindow: '1 minute',
    hook: 'preHandler' as const,
    keyGenerator: (request: FastifyRequest) => request.authContext?.userId ?? request.ip,
  };

  // ── Admin (AM/OP) ──────────────────────────────────────────────────────────

  app.post(
    '/v1/inspector-notices',
    {
      preHandler: adminOnly,
      schema: {
        body: publishInspectorNoticeSchema,
        response: { 201: successResponseSchema(inspectorNoticeSummarySchema) },
      },
    },
    async (request, reply) => {
      const result = await container.publishInspectorNoticeUseCase.execute({
        body: request.body as z.infer<typeof publishInspectorNoticeSchema>,
        idempotencyKey: idempotencyKey(request),
        actorUserId: request.authContext!.userId,
        requestId: request.id,
      });
      return reply.status(201).send(success(result));
    },
  );

  app.get(
    '/v1/inspector-notices',
    {
      preHandler: adminOnly,
      schema: {
        querystring: listInspectorNoticesQuerySchema,
        response: { 200: paginatedResponseSchema(inspectorNoticeSummarySchema) },
      },
    },
    async (request, reply) => {
      const query = request.query as z.infer<typeof listInspectorNoticesQuerySchema>;
      const result = await container.listInspectorNoticesUseCase.execute({
        status: query.status,
        page: query.page,
        pageSize: query.pageSize,
      });
      return reply.status(200).send(paginated(result.data, result.total, query.page, query.pageSize));
    },
  );

  app.get(
    '/v1/inspector-notices/:noticeId',
    {
      preHandler: adminOnly,
      schema: {
        params: noticeIdParam,
        response: { 200: successResponseSchema(inspectorNoticeDetailSchema) },
      },
    },
    async (request, reply) => {
      const { noticeId } = request.params as z.infer<typeof noticeIdParam>;
      const result = await container.getInspectorNoticeUseCase.execute(noticeId);
      return reply.status(200).send(success(result));
    },
  );

  app.post(
    '/v1/inspector-notices/:noticeId/archive',
    {
      preHandler: adminOnly,
      schema: {
        params: noticeIdParam,
        response: { 200: successResponseSchema(inspectorNoticeSummarySchema) },
      },
    },
    async (request, reply) => {
      const { noticeId } = request.params as z.infer<typeof noticeIdParam>;
      const result = await container.archiveInspectorNoticeUseCase.execute({
        noticeId,
        actorUserId: request.authContext!.userId,
        requestId: request.id,
      });
      return reply.status(200).send(success(result));
    },
  );

  // ── Inspector box (INSP, own) ───────────────────────────────────────────────
  // Static /me/* paths; find-my-way matches these over the parametric
  // /v1/inspectors/:inspectorId regardless of registration order.

  app.get(
    '/v1/inspectors/me/notices',
    {
      preHandler: authenticate,
      schema: {
        querystring: listMyInspectorNoticesQuerySchema,
        response: { 200: paginatedResponseSchema(myInspectorNoticeSchema) },
      },
    },
    async (request, reply) => {
      const inspectorId = requireInspectorId(request);
      const query = request.query as z.infer<typeof listMyInspectorNoticesQuerySchema>;
      const result = await container.listMyInspectorNoticesUseCase.execute({
        inspectorId,
        page: query.page,
        pageSize: query.pageSize,
      });
      return reply.status(200).send(paginated(result.data, result.total, query.page, query.pageSize));
    },
  );

  app.get(
    '/v1/inspectors/me/notices/unread-count',
    {
      preHandler: authenticate,
      schema: { response: { 200: successResponseSchema(unreadCountResponseSchema) } },
    },
    async (request, reply) => {
      const inspectorId = requireInspectorId(request);
      const result = await container.countMyUnreadInspectorNoticesUseCase.execute(inspectorId);
      return reply.status(200).send(success(result));
    },
  );

  app.get(
    '/v1/inspectors/me/notices/:noticeId',
    {
      preHandler: authenticate,
      schema: {
        params: noticeIdParam,
        response: { 200: successResponseSchema(myInspectorNoticeSchema) },
      },
    },
    async (request, reply) => {
      const inspectorId = requireInspectorId(request);
      const { noticeId } = request.params as z.infer<typeof noticeIdParam>;
      const result = await container.getMyInspectorNoticeUseCase.execute(inspectorId, noticeId);
      return reply.status(200).send(success(result));
    },
  );

  app.post(
    '/v1/inspectors/me/notices/:noticeId/read',
    {
      preHandler: authenticate,
      schema: {
        params: noticeIdParam,
        response: { 200: successResponseSchema(readResponseSchema) },
      },
    },
    async (request, reply) => {
      const inspectorId = requireInspectorId(request);
      const { noticeId } = request.params as z.infer<typeof noticeIdParam>;
      const result = await container.markInspectorNoticeReadUseCase.execute(inspectorId, noticeId);
      return reply.status(200).send(success(result));
    },
  );

  // ── Push subscriptions (INSP, own) ──────────────────────────────────────────

  app.get(
    '/v1/inspectors/me/push-config',
    {
      preHandler: authenticate,
      schema: { response: { 200: successResponseSchema(pushConfigResponseSchema) } },
    },
    async (request, reply) => {
      requireInspectorId(request);
      const result = await container.getPushConfigUseCase.execute();
      return reply.status(200).send(success(result));
    },
  );

  app.post(
    '/v1/inspectors/me/push-subscriptions',
    {
      preHandler: authenticate,
      config: { rateLimit: perUserRateLimit },
      schema: { body: pushSubscriptionSchema },
    },
    async (request, reply) => {
      const inspectorId = requireInspectorId(request);
      await container.upsertPushSubscriptionUseCase.execute(
        inspectorId,
        request.body as z.infer<typeof pushSubscriptionSchema>,
      );
      return reply.status(204).send();
    },
  );

  app.post(
    '/v1/inspectors/me/push-subscriptions/unsubscribe',
    {
      preHandler: authenticate,
      config: { rateLimit: perUserRateLimit },
      schema: { body: pushUnsubscribeSchema },
    },
    async (request, reply) => {
      const inspectorId = requireInspectorId(request);
      await container.unsubscribePushSubscriptionUseCase.execute(
        inspectorId,
        request.body as z.infer<typeof pushUnsubscribeSchema>,
      );
      return reply.status(204).send();
    },
  );
}
