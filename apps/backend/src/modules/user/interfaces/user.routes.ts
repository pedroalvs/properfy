import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createUserSchema,
  updateUserSchema,
  listUsersQuerySchema,
  deactivateSchema,
  userResponseSchema,
  successResponseSchema,
  paginatedResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { success, paginated } from '../../../shared/interfaces/response';
import type { CreateUserUseCase } from '../application/use-cases/create-user.use-case';
import type { GetUserUseCase } from '../application/use-cases/get-user.use-case';
import type { ListUsersUseCase } from '../application/use-cases/list-users.use-case';
import type { UpdateUserUseCase } from '../application/use-cases/update-user.use-case';
import type { DeactivateUserUseCase } from '../application/use-cases/deactivate-user.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface UserRouteContainer {
  createUserUseCase: CreateUserUseCase;
  getUserUseCase: GetUserUseCase;
  listUsersUseCase: ListUsersUseCase;
  updateUserUseCase: UpdateUserUseCase;
  deactivateUserUseCase: DeactivateUserUseCase;
  jwtService: JwtService;
}

const tenantIdParam = z.object({ tenantId: z.string().uuid() });
const userIdParam = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
});

export async function registerUserRoutes(
  app: FastifyInstance,
  container: UserRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware((token) =>
    container.jwtService.verify(token),
  );

  // POST /v1/tenants/:tenantId/users
  app.post(
    '/v1/tenants/:tenantId/users',
    {
      preHandler: authenticate,
      schema: {
        params: tenantIdParam,
        body: createUserSchema,
        response: { 201: successResponseSchema(userResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = tenantIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid tenant ID',
          params.error.errors,
        );
      const parsed = createUserSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      const result = await container.createUserUseCase.execute({
        tenantId: params.data.tenantId,
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(201).send(success(result));
    },
  );

  // GET /v1/tenants/:tenantId/users
  app.get(
    '/v1/tenants/:tenantId/users',
    {
      preHandler: authenticate,
      schema: {
        params: tenantIdParam,
        querystring: listUsersQuerySchema,
        response: { 200: paginatedResponseSchema(userResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = tenantIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid tenant ID',
          params.error.errors,
        );
      const parsed = listUsersQuerySchema.safeParse(request.query);
      if (!parsed.success)
        throw new ValidationError(
          'Invalid query parameters',
          parsed.error.errors,
        );
      const { page, pageSize, sortBy, sortOrder, ...filters } = parsed.data;
      const result = await container.listUsersUseCase.execute({
        tenantId: params.data.tenantId,
        filters,
        pagination: { page, pageSize, sortBy, sortOrder },
        actor: request.authContext!,
      });
      return reply
        .status(200)
        .send(paginated(result.data, result.total, page, pageSize));
    },
  );

  // GET /v1/tenants/:tenantId/users/:userId
  app.get(
    '/v1/tenants/:tenantId/users/:userId',
    {
      preHandler: authenticate,
      schema: {
        params: userIdParam,
        response: { 200: successResponseSchema(userResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = userIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid parameters',
          params.error.errors,
        );
      const result = await container.getUserUseCase.execute({
        tenantId: params.data.tenantId,
        userId: params.data.userId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // PATCH /v1/tenants/:tenantId/users/:userId
  app.patch(
    '/v1/tenants/:tenantId/users/:userId',
    {
      preHandler: authenticate,
      schema: {
        params: userIdParam,
        body: updateUserSchema,
        response: { 200: successResponseSchema(userResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = userIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid parameters',
          params.error.errors,
        );
      const parsed = updateUserSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      const result = await container.updateUserUseCase.execute({
        tenantId: params.data.tenantId,
        userId: params.data.userId,
        data: parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/tenants/:tenantId/users/:userId/deactivate
  app.post(
    '/v1/tenants/:tenantId/users/:userId/deactivate',
    {
      preHandler: authenticate,
      schema: {
        params: userIdParam,
        body: deactivateSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const params = userIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid parameters',
          params.error.errors,
        );
      const parsed = deactivateSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      await container.deactivateUserUseCase.execute({
        tenantId: params.data.tenantId,
        userId: params.data.userId,
        reason: parsed.data.reason,
        actor: request.authContext!,
      });
      return reply.status(204).send();
    },
  );
}
