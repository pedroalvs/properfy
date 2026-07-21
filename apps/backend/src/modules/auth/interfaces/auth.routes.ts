import type { FastifyInstance } from 'fastify';
import type { LoginUseCase } from '../application/use-cases/login.use-case';
import type { RefreshTokenUseCase } from '../application/use-cases/refresh-token.use-case';
import type { LogoutUseCase } from '../application/use-cases/logout.use-case';
import type { GetMeUseCase } from '../application/use-cases/get-me.use-case';
import type { ChangePasswordUseCase } from '../application/use-cases/change-password.use-case';
import type { RevokeSessionUseCase } from '../application/use-cases/revoke-session.use-case';
import type { ListSessionsUseCase } from '../application/use-cases/list-sessions.use-case';
import type { SetupTotpUseCase } from '../application/use-cases/setup-totp.use-case';
import type { ConfirmTotpUseCase } from '../application/use-cases/confirm-totp.use-case';
import type { RequestPasswordResetUseCase } from '../application/use-cases/request-password-reset.use-case';
import type { ConsumePasswordResetUseCase } from '../application/use-cases/consume-password-reset.use-case';
import {
  loginSchema,
  refreshSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  loginResponseSchema,
  refreshResponseSchema,
  meResponseSchema,
} from '@properfy/shared';
import { z } from 'zod';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import type { JwtService } from '../application/services/jwt.service';
import { ValidationError } from '../../../shared/domain/errors';

export interface AuthRouteContainer {
  loginUseCase: LoginUseCase;
  refreshTokenUseCase: RefreshTokenUseCase;
  logoutUseCase: LogoutUseCase;
  getMeUseCase: GetMeUseCase;
  changePasswordUseCase: ChangePasswordUseCase;
  revokeSessionUseCase: RevokeSessionUseCase;
  listSessionsUseCase: ListSessionsUseCase;
  setupTotpUseCase: SetupTotpUseCase;
  confirmTotpUseCase: ConfirmTotpUseCase;
  requestPasswordResetUseCase: RequestPasswordResetUseCase;
  consumePasswordResetUseCase: ConsumePasswordResetUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean; settingsJson?: Record<string, unknown> } | null> };
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  container: AuthRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return (tenant?.settingsJson?.clUserPermissions as string[] | undefined) ?? [];
    },
  );

  // POST /v1/auth/login
  app.post('/v1/auth/login', {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute',
      },
    },
    schema: {
      body: loginSchema,
      response: { 200: loginResponseSchema },
    },
  }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Request payload is invalid', parsed.error.errors);
    }
    const result = await container.loginUseCase.execute({
      email: parsed.data.email,
      password: parsed.data.password,
      totpCode: parsed.data.totpCode,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent']?.slice(0, 500),
    });
    return reply.status(200).send(result);
  });

  // POST /v1/auth/refresh
  app.post('/v1/auth/refresh', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
      },
    },
    schema: {
      body: refreshSchema,
      response: { 200: refreshResponseSchema },
    },
  }, async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Request payload is invalid', parsed.error.errors);
    }
    const result = await container.refreshTokenUseCase.execute({
      refreshToken: parsed.data.refreshToken,
    });
    return reply.status(200).send(result);
  });

  // POST /v1/auth/logout
  app.post(
    '/v1/auth/logout',
    { preHandler: authenticate, schema: { response: { 204: z.null() } } },
    async (request, reply) => {
      await container.logoutUseCase.execute({
        userId: request.authContext!.userId,
      });
      return reply.status(204).send();
    },
  );

  // GET /v1/me
  app.get(
    '/v1/me',
    { preHandler: authenticate, schema: { response: { 200: meResponseSchema } } },
    async (request, reply) => {
      const result = await container.getMeUseCase.execute(request.authContext!.userId);
      return reply.status(200).send(result);
    },
  );

  // POST /v1/auth/change-password
  app.post(
    '/v1/auth/change-password',
    {
      preHandler: authenticate,
      schema: {
        body: changePasswordSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const parsed = changePasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      await container.changePasswordUseCase.execute({
        userId: request.authContext!.userId,
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      });
      return reply.status(204).send();
    },
  );

  // POST /v1/auth/2fa/setup
  app.post(
    '/v1/auth/2fa/setup',
    {
      preHandler: authenticate,
      schema: {
        response: { 200: z.object({ secret: z.string(), qrUri: z.string() }) },
      },
    },
    async (request, reply) => {
      const result = await container.setupTotpUseCase.execute({
        userId: request.authContext!.userId,
      });
      return reply.status(200).send(result);
    },
  );

  // POST /v1/auth/2fa/confirm
  app.post(
    '/v1/auth/2fa/confirm',
    {
      preHandler: authenticate,
      schema: {
        body: z.object({ totpCode: z.string().length(6) }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const parsed = z.object({ totpCode: z.string().length(6) }).safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      await container.confirmTotpUseCase.execute({
        userId: request.authContext!.userId,
        totpCode: parsed.data.totpCode,
      });
      return reply.status(204).send();
    },
  );

  // DELETE /v1/auth/sessions/:sessionId
  app.get(
    '/v1/auth/sessions',
    {
      preHandler: authenticate,
      schema: {
        response: {
          200: z.object({
            data: z.array(
              z.object({
                id: z.string().uuid(),
                userAgent: z.string().nullable(),
                ipAddress: z.string().nullable(),
                lastActiveAt: z.string().datetime(),
                createdAt: z.string().datetime(),
                isCurrent: z.boolean(),
              }),
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const result = await container.listSessionsUseCase.execute({
        actor: request.authContext!,
        currentIpAddress: request.ip,
        currentUserAgent: request.headers['user-agent'] ?? null,
      });
      return reply.status(200).send({ data: result });
    },
  );

  // DELETE /v1/auth/sessions/:sessionId
  app.delete(
    '/v1/auth/sessions/:sessionId',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ sessionId: z.string().uuid() }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const paramsParsed = z.object({ sessionId: z.string().uuid() }).safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError('Invalid session ID', paramsParsed.error.errors);
      }
      const { sessionId } = paramsParsed.data;
      await container.revokeSessionUseCase.execute({
        sessionId,
        actorId: request.authContext!.userId,
        actorRole: request.authContext!.role,
      });
      return reply.status(204).send();
    },
  );

  // POST /v1/auth/forgot-password (public)
  app.post('/v1/auth/forgot-password', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
      },
    },
    schema: {
      body: forgotPasswordSchema,
      response: { 204: z.null() },
    },
  }, async (request, reply) => {
    const parsed = forgotPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Request payload is invalid', parsed.error.errors);
    }
    await container.requestPasswordResetUseCase.execute({
      email: parsed.data.email,
    });
    return reply.status(204).send();
  });

  // POST /v1/auth/reset-password (public)
  app.post('/v1/auth/reset-password', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
    schema: {
      body: resetPasswordSchema,
      response: { 204: z.null() },
    },
  }, async (request, reply) => {
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Request payload is invalid', parsed.error.errors);
    }
    await container.consumePasswordResetUseCase.execute({
      token: parsed.data.token,
      newPassword: parsed.data.newPassword,
    });
    return reply.status(204).send();
  });

}
