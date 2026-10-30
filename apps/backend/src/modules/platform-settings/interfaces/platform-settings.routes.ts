import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  updatePlatformSettingSchema,
  platformSettingResponseSchema,
  platformSettingsListResponseSchema,
  successResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { success } from '../../../shared/interfaces/response';
import type { ListPlatformSettingsUseCase } from '../application/use-cases/list-platform-settings.use-case';
import type { GetPlatformSettingUseCase } from '../application/use-cases/get-platform-setting.use-case';
import type { UpdatePlatformSettingUseCase } from '../application/use-cases/update-platform-setting.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface PlatformSettingsRouteContainer {
  listPlatformSettingsUseCase: ListPlatformSettingsUseCase;
  getPlatformSettingUseCase: GetPlatformSettingUseCase;
  updatePlatformSettingUseCase: UpdatePlatformSettingUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

const keyParam = z.object({ key: z.string().max(100) });

export async function registerPlatformSettingsRoutes(
  app: FastifyInstance,
  container: PlatformSettingsRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  // GET /v1/platform-settings — all keys (AM/OP)
  app.get(
    '/v1/platform-settings',
    {
      preHandler: authenticate,
      schema: { response: { 200: successResponseSchema(platformSettingsListResponseSchema) } },
    },
    async (request, reply) => {
      const result = await container.listPlatformSettingsUseCase.execute({
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // GET /v1/platform-settings/:key — one key (AM/OP)
  app.get(
    '/v1/platform-settings/:key',
    {
      preHandler: authenticate,
      schema: { params: keyParam, response: { 200: successResponseSchema(platformSettingResponseSchema) } },
    },
    async (request, reply) => {
      const params = keyParam.safeParse(request.params);
      if (!params.success) throw new ValidationError('Invalid platform setting key', params.error.errors);
      const result = await container.getPlatformSettingUseCase.execute({
        key: params.data.key,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // PUT /v1/platform-settings/:key — update one key (AM/OP)
  app.put(
    '/v1/platform-settings/:key',
    {
      preHandler: authenticate,
      schema: {
        params: keyParam,
        body: updatePlatformSettingSchema,
        response: { 200: successResponseSchema(platformSettingResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = keyParam.safeParse(request.params);
      if (!params.success) throw new ValidationError('Invalid platform setting key', params.error.errors);
      const parsed = updatePlatformSettingSchema.safeParse(request.body);
      if (!parsed.success) throw new ValidationError('Request payload is invalid', parsed.error.errors);
      const result = await container.updatePlatformSettingUseCase.execute({
        key: params.data.key,
        value: parsed.data.value,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );
}
