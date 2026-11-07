import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  createPropertyIssueSchema,
  propertyIssueResponseSchema,
  markPropertyIssueSeenResponseSchema,
  listPropertyIssuesQuerySchema,
  listPropertyIssuesResponseSchema,
  propertyIssueUnseenCountResponseSchema,
  successResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { success } from '../../../shared/interfaces/response';
import type { JwtService } from '../../auth/application/services/jwt.service';
import type { CreatePropertyIssueUseCase } from '../application/use-cases/create-property-issue.use-case';
import type { MarkPropertyIssueAsSeenUseCase } from '../application/use-cases/mark-property-issue-seen.use-case';
import type { DeletePropertyIssueUseCase } from '../application/use-cases/delete-property-issue.use-case';
import type { ListPropertyIssuesUseCase } from '../application/use-cases/list-property-issues.use-case';
import type { CountUnseenPropertyIssuesUseCase } from '../application/use-cases/count-unseen-property-issues.use-case';

export interface PropertyIssueRouteContainer {
  createPropertyIssueUseCase: Pick<CreatePropertyIssueUseCase, 'execute'>;
  markPropertyIssueAsSeenUseCase: Pick<MarkPropertyIssueAsSeenUseCase, 'execute'>;
  deletePropertyIssueUseCase: Pick<DeletePropertyIssueUseCase, 'execute'>;
  listPropertyIssuesUseCase: Pick<ListPropertyIssuesUseCase, 'execute'>;
  countUnseenPropertyIssuesUseCase: Pick<CountUnseenPropertyIssuesUseCase, 'execute'>;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

const idParam = z.object({ id: z.string().uuid() });

function idempotencyKey(request: FastifyRequest): string | undefined {
  const value = request.headers['idempotency-key'];
  return typeof value === 'string' ? value : undefined;
}

export async function registerPropertyIssueRoutes(
  app: FastifyInstance,
  container: PropertyIssueRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  app.post(
    '/v1/property-issues',
    {
      preHandler: authenticate,
      schema: {
        body: createPropertyIssueSchema,
        response: { 201: successResponseSchema(propertyIssueResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await container.createPropertyIssueUseCase.execute({
        actor: request.authContext!,
        input: request.body as z.infer<typeof createPropertyIssueSchema>,
        idempotencyKey: idempotencyKey(request),
        requestId: request.id,
      });
      return reply.status(201).send(success(result));
    },
  );

  // Static path registered before the :id routes so it is never shadowed.
  app.get(
    '/v1/property-issues/unseen-count',
    {
      preHandler: authenticate,
      schema: {
        response: { 200: successResponseSchema(propertyIssueUnseenCountResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await container.countUnseenPropertyIssuesUseCase.execute({
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  app.get(
    '/v1/property-issues',
    {
      preHandler: authenticate,
      schema: {
        querystring: listPropertyIssuesQuerySchema,
        response: { 200: successResponseSchema(listPropertyIssuesResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await container.listPropertyIssuesUseCase.execute({
        actor: request.authContext!,
        query: request.query as z.infer<typeof listPropertyIssuesQuerySchema>,
      });
      return reply.status(200).send(success(result));
    },
  );

  app.post(
    '/v1/property-issues/:id/seen',
    {
      preHandler: authenticate,
      schema: {
        params: idParam,
        response: { 200: successResponseSchema(markPropertyIssueSeenResponseSchema) },
      },
    },
    async (request, reply) => {
      const { id } = request.params as z.infer<typeof idParam>;
      const result = await container.markPropertyIssueAsSeenUseCase.execute({
        actor: request.authContext!,
        issueId: id,
        requestId: request.id,
      });
      return reply.status(200).send(success(result));
    },
  );

  app.delete(
    '/v1/property-issues/:id',
    { preHandler: authenticate, schema: { params: idParam } },
    async (request, reply) => {
      const { id } = request.params as z.infer<typeof idParam>;
      await container.deletePropertyIssueUseCase.execute({
        actor: request.authContext!,
        issueId: id,
        requestId: request.id,
      });
      return reply.status(204).send();
    },
  );
}
