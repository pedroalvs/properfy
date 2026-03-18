import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createServiceGroupSchema,
  assignInspectorSchema,
  cancelServiceGroupSchema,
  listServiceGroupsQuerySchema,
  serviceGroupResponseSchema,
  successResponseSchema,
  paginatedResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { success, paginated } from '../../../shared/interfaces/response';
import type { CreateServiceGroupUseCase } from '../application/use-cases/create-service-group.use-case';
import type { GetServiceGroupUseCase } from '../application/use-cases/get-service-group.use-case';
import type { ListServiceGroupsUseCase } from '../application/use-cases/list-service-groups.use-case';
import type { PublishServiceGroupUseCase } from '../application/use-cases/publish-service-group.use-case';
import type { AssignInspectorManuallyUseCase } from '../application/use-cases/assign-inspector-manually.use-case';
import type { CancelServiceGroupUseCase } from '../application/use-cases/cancel-service-group.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface ServiceGroupRouteContainer {
  createServiceGroupUseCase: CreateServiceGroupUseCase;
  getServiceGroupUseCase: GetServiceGroupUseCase;
  listServiceGroupsUseCase: ListServiceGroupsUseCase;
  publishServiceGroupUseCase: PublishServiceGroupUseCase;
  assignInspectorManuallyUseCase: AssignInspectorManuallyUseCase;
  cancelServiceGroupUseCase: CancelServiceGroupUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

const groupIdParam = z.object({ groupId: z.string().uuid() });

export async function registerServiceGroupRoutes(
  app: FastifyInstance,
  container: ServiceGroupRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  // POST /v1/service-groups — 201
  app.post(
    '/v1/service-groups',
    {
      preHandler: authenticate,
      schema: {
        body: createServiceGroupSchema,
        response: { 201: successResponseSchema(serviceGroupResponseSchema) },
      },
    },
    async (request, reply) => {
      const parsed = createServiceGroupSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.createServiceGroupUseCase.execute({
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(201).send(success(result));
    },
  );

  // GET /v1/service-groups — paginated 200
  app.get(
    '/v1/service-groups',
    {
      preHandler: authenticate,
      schema: {
        querystring: listServiceGroupsQuerySchema,
        response: { 200: paginatedResponseSchema(serviceGroupResponseSchema) },
      },
    },
    async (request, reply) => {
      const parsed = listServiceGroupsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }
      const { page, pageSize, sortBy, sortOrder, ...filters } = parsed.data;
      const result = await container.listServiceGroupsUseCase.execute({
        filters,
        pagination: { page, pageSize, sortBy, sortOrder },
        actor: request.authContext!,
      });
      return reply.status(200).send(paginated(result.data, result.total, page, pageSize));
    },
  );

  // GET /v1/service-groups/:groupId — 200
  app.get(
    '/v1/service-groups/:groupId',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ groupId: z.string().uuid() }),
        response: { 200: successResponseSchema(serviceGroupResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = groupIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid group ID', params.error.errors);
      }
      const result = await container.getServiceGroupUseCase.execute({
        groupId: params.data.groupId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/service-groups/:groupId/publish — 200
  app.post(
    '/v1/service-groups/:groupId/publish',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ groupId: z.string().uuid() }),
        response: { 200: successResponseSchema(serviceGroupResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = groupIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid group ID', params.error.errors);
      }
      const result = await container.publishServiceGroupUseCase.execute({
        groupId: params.data.groupId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/service-groups/:groupId/assign — 200
  app.post(
    '/v1/service-groups/:groupId/assign',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ groupId: z.string().uuid() }),
        body: assignInspectorSchema,
        response: { 200: successResponseSchema(serviceGroupResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = groupIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid group ID', params.error.errors);
      }
      const parsed = assignInspectorSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.assignInspectorManuallyUseCase.execute({
        groupId: params.data.groupId,
        inspectorId: parsed.data.inspectorId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/service-groups/:groupId/cancel — 200
  app.post(
    '/v1/service-groups/:groupId/cancel',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ groupId: z.string().uuid() }),
        body: cancelServiceGroupSchema,
        response: { 200: successResponseSchema(serviceGroupResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = groupIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid group ID', params.error.errors);
      }
      const parsed = cancelServiceGroupSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.cancelServiceGroupUseCase.execute({
        groupId: params.data.groupId,
        reason: parsed.data.reason,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );
}
