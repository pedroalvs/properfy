import type { FastifyInstance } from 'fastify';
import type { LoginUseCase } from '../application/use-cases/login.use-case';
import type { RefreshTokenUseCase } from '../application/use-cases/refresh-token.use-case';
import type { LogoutUseCase } from '../application/use-cases/logout.use-case';
import type { GetMeUseCase } from '../application/use-cases/get-me.use-case';
import type { ChangePasswordUseCase } from '../application/use-cases/change-password.use-case';
import type { RevokeSessionUseCase } from '../application/use-cases/revoke-session.use-case';
import { loginSchema, refreshSchema, changePasswordSchema } from '@properfy/shared';
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
  jwtService: JwtService;
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  container: AuthRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware((token) => container.jwtService.verify(token));

  // POST /v1/auth/login
  app.post('/v1/auth/login', async (request, reply) => {
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
  app.post('/v1/auth/refresh', async (request, reply) => {
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
    { preHandler: authenticate },
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
    { preHandler: authenticate },
    async (request, reply) => {
      const result = await container.getMeUseCase.execute(request.authContext!.userId);
      return reply.status(200).send(result);
    },
  );

  // POST /v1/auth/change-password
  app.post(
    '/v1/auth/change-password',
    { preHandler: authenticate },
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

  // DELETE /v1/auth/sessions/:sessionId
  app.delete(
    '/v1/auth/sessions/:sessionId',
    { preHandler: authenticate },
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
}
