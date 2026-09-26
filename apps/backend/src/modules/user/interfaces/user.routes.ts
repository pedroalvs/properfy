import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createUserSchema,
  updateUserSchema,
  resetUserPasswordSchema,
  listUsersQuerySchema,
  deactivateSchema,
  userResponseSchema,
  successResponseSchema,
  paginatedResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { success, paginated } from '../../../shared/interfaces/response';
import type { CreateUserUseCase } from '../application/use-cases/create-user.use-case';
import type { GetUserUseCase } from '../application/use-cases/get-user.use-case';
import type { ListUsersUseCase } from '../application/use-cases/list-users.use-case';
import type { UpdateUserUseCase } from '../application/use-cases/update-user.use-case';
import type { DeactivateUserUseCase } from '../application/use-cases/deactivate-user.use-case';
import type { ReactivateUserUseCase } from '../application/use-cases/reactivate-user.use-case';
import type { UnlockUserUseCase } from '../application/use-cases/unlock-user.use-case';
import type { ResetUserPasswordUseCase } from '../application/use-cases/reset-user-password.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface UserRouteContainer {
  createUserUseCase: CreateUserUseCase;
  getUserUseCase: GetUserUseCase;
  listUsersUseCase: ListUsersUseCase;
  updateUserUseCase: UpdateUserUseCase;
  deactivateUserUseCase: DeactivateUserUseCase;
  reactivateUserUseCase: ReactivateUserUseCase;
  unlockUserUseCase: UnlockUserUseCase;
  resetUserPasswordUseCase: ResetUserPasswordUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

const tenantIdParam = z.object({ tenantId: z.string().uuid() });
const userIdParam = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
});
const internalUserIdParam = z.object({ userId: z.string().uuid() });

export async function registerUserRoutes(
  app: FastifyInstance,
  container: UserRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
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
      const { tenantId } = request.params as z.infer<typeof tenantIdParam>;
      const result = await container.createUserUseCase.execute({
        tenantId,
        ...(request.body as z.infer<typeof createUserSchema>),
        actor: request.authContext!,
        requestId: request.id,
      });
      return reply.status(201).send(success(result));
    },
  );

  // POST /v1/users (internal users only)
  app.post(
    '/v1/users',
    {
      preHandler: authenticate,
      schema: {
        body: createUserSchema,
        response: { 201: successResponseSchema(userResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await container.createUserUseCase.execute({
        tenantId: null,
        ...(request.body as z.infer<typeof createUserSchema>),
        actor: request.authContext!,
        requestId: request.id,
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
      const { tenantId } = request.params as z.infer<typeof tenantIdParam>;
      const { page, pageSize, sortBy, sortOrder, ...filters } =
        request.query as z.infer<typeof listUsersQuerySchema>;
      const result = await container.listUsersUseCase.execute({
        tenantId,
        filters,
        pagination: { page, pageSize, sortBy, sortOrder },
        actor: request.authContext!,
      });
      return reply
        .status(200)
        .send(paginated(result.data, result.total, page, pageSize));
    },
  );

  // GET /v1/users (internal users only)
  app.get(
    '/v1/users',
    {
      preHandler: authenticate,
      schema: {
        querystring: listUsersQuerySchema,
        response: { 200: paginatedResponseSchema(userResponseSchema) },
      },
    },
    async (request, reply) => {
      const { page, pageSize, sortBy, sortOrder, ...filters } =
        request.query as z.infer<typeof listUsersQuerySchema>;
      const result = await container.listUsersUseCase.execute({
        tenantId: null,
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
      const { tenantId, userId } = request.params as z.infer<typeof userIdParam>;
      const result = await container.getUserUseCase.execute({
        tenantId,
        userId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // GET /v1/users/:userId (internal users only)
  app.get(
    '/v1/users/:userId',
    {
      preHandler: authenticate,
      schema: {
        params: internalUserIdParam,
        response: { 200: successResponseSchema(userResponseSchema) },
      },
    },
    async (request, reply) => {
      const { userId } = request.params as z.infer<typeof internalUserIdParam>;
      const result = await container.getUserUseCase.execute({
        tenantId: null,
        userId,
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
      const { tenantId, userId } = request.params as z.infer<typeof userIdParam>;
      const result = await container.updateUserUseCase.execute({
        tenantId,
        userId,
        data: request.body as z.infer<typeof updateUserSchema>,
        actor: request.authContext!,
        requestId: request.id,
      });
      return reply.status(200).send(success(result));
    },
  );

  // PATCH /v1/users/:userId (internal users only)
  app.patch(
    '/v1/users/:userId',
    {
      preHandler: authenticate,
      schema: {
        params: internalUserIdParam,
        body: updateUserSchema,
        response: { 200: successResponseSchema(userResponseSchema) },
      },
    },
    async (request, reply) => {
      const { userId } = request.params as z.infer<typeof internalUserIdParam>;
      const result = await container.updateUserUseCase.execute({
        tenantId: null,
        userId,
        data: request.body as z.infer<typeof updateUserSchema>,
        actor: request.authContext!,
        requestId: request.id,
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
      const { tenantId, userId } = request.params as z.infer<typeof userIdParam>;
      const { reason } = request.body as z.infer<typeof deactivateSchema>;
      await container.deactivateUserUseCase.execute({
        tenantId,
        userId,
        reason,
        actor: request.authContext!,
        requestId: request.id,
      });
      return reply.status(204).send();
    },
  );

  // POST /v1/users/:userId/deactivate (internal users only)
  app.post(
    '/v1/users/:userId/deactivate',
    {
      preHandler: authenticate,
      schema: {
        params: internalUserIdParam,
        body: deactivateSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { userId } = request.params as z.infer<typeof internalUserIdParam>;
      const { reason } = request.body as z.infer<typeof deactivateSchema>;
      await container.deactivateUserUseCase.execute({
        tenantId: null,
        userId,
        reason,
        actor: request.authContext!,
        requestId: request.id,
      });
      return reply.status(204).send();
    },
  );

  // POST /v1/tenants/:tenantId/users/:userId/reactivate
  app.post(
    '/v1/tenants/:tenantId/users/:userId/reactivate',
    {
      preHandler: authenticate,
      schema: {
        params: userIdParam,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = request.params as z.infer<typeof userIdParam>;
      await container.reactivateUserUseCase.execute({
        tenantId,
        userId,
        actor: request.authContext!,
        requestId: request.id,
      });
      return reply.status(204).send();
    },
  );

  // POST /v1/users/:userId/reactivate (internal users only)
  app.post(
    '/v1/users/:userId/reactivate',
    {
      preHandler: authenticate,
      schema: {
        params: internalUserIdParam,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { userId } = request.params as z.infer<typeof internalUserIdParam>;
      await container.reactivateUserUseCase.execute({
        tenantId: null,
        userId,
        actor: request.authContext!,
        requestId: request.id,
      });
      return reply.status(204).send();
    },
  );

  // POST /v1/tenants/:tenantId/users/:userId/unlock
  app.post(
    '/v1/tenants/:tenantId/users/:userId/unlock',
    {
      preHandler: authenticate,
      schema: {
        params: userIdParam,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = request.params as z.infer<typeof userIdParam>;
      await container.unlockUserUseCase.execute({
        tenantId,
        userId,
        actor: request.authContext!,
        requestId: request.id,
      });
      return reply.status(204).send();
    },
  );

  // POST /v1/tenants/:tenantId/users/:userId/reset-password
  app.post(
    '/v1/tenants/:tenantId/users/:userId/reset-password',
    {
      preHandler: authenticate,
      schema: {
        params: userIdParam,
        body: resetUserPasswordSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = request.params as z.infer<typeof userIdParam>;
      const { newPassword } = request.body as z.infer<typeof resetUserPasswordSchema>;
      await container.resetUserPasswordUseCase.execute({
        tenantId,
        userId,
        newPassword,
        actor: request.authContext!,
        requestId: request.id,
      });
      return reply.status(204).send();
    },
  );

  // POST /v1/users/:userId/reset-password (internal users only)
  app.post(
    '/v1/users/:userId/reset-password',
    {
      preHandler: authenticate,
      schema: {
        params: internalUserIdParam,
        body: resetUserPasswordSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { userId } = request.params as z.infer<typeof internalUserIdParam>;
      const { newPassword } = request.body as z.infer<typeof resetUserPasswordSchema>;
      await container.resetUserPasswordUseCase.execute({
        tenantId: null,
        userId,
        newPassword,
        actor: request.authContext!,
        requestId: request.id,
      });
      return reply.status(204).send();
    },
  );
}
