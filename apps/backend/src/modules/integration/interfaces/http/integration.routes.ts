import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  apiKeyCreateSchema,
  apiKeyCreatedSchema,
  apiKeyResponseSchema,
  integrationDetailSchema,
  integrationProviderSchema,
  integrationStatusSchema,
  integrationTestResultSchema,
  integrationUpsertSchema,
  successResponseSchema,
} from '@properfy/shared';

import { createAuthMiddleware } from '../../../../shared/interfaces/auth-middleware';
import { success } from '../../../../shared/interfaces/response';
import type { JwtService } from '../../../auth/application/services/jwt.service';
import type { IntegrationConfigResolver } from '../../infrastructure/integration-config-resolver';
import type { ListIntegrationsUseCase } from '../../application/use-cases/list-integrations.use-case';
import type { UpsertIntegrationSettingUseCase } from '../../application/use-cases/upsert-integration-setting.use-case';
import type { DeleteIntegrationSettingUseCase } from '../../application/use-cases/delete-integration-setting.use-case';
import type { TestIntegrationConnectionUseCase } from '../../application/use-cases/test-integration-connection.use-case';
import type { CreateApiKeyUseCase } from '../../application/use-cases/create-api-key.use-case';
import type { ListApiKeysUseCase } from '../../application/use-cases/list-api-keys.use-case';
import type { RevokeApiKeyUseCase } from '../../application/use-cases/revoke-api-key.use-case';

export interface IntegrationRouteContainer {
  listIntegrationsUseCase: ListIntegrationsUseCase;
  upsertIntegrationSettingUseCase: UpsertIntegrationSettingUseCase;
  deleteIntegrationSettingUseCase: DeleteIntegrationSettingUseCase;
  testIntegrationConnectionUseCase: TestIntegrationConnectionUseCase;
  integrationConfigResolver: IntegrationConfigResolver;
  createApiKeyUseCase: CreateApiKeyUseCase;
  listApiKeysUseCase: ListApiKeysUseCase;
  revokeApiKeyUseCase: RevokeApiKeyUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

const providerParam = z.object({ provider: integrationProviderSchema });
const idParam = z.object({ id: z.string().uuid() });

// Platform-level credential management: AM only (stricter than the AM/OP
// registry screens — these are the platform's own outbound/inbound secrets).
const ALLOWED_ROLES = ['AM'] as const;

export async function registerIntegrationRoutes(
  app: FastifyInstance,
  container: IntegrationRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  const forbidden = (reply: { status: (n: number) => { send: (b: unknown) => unknown } }) =>
    reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

  // GET /v1/integrations — hub screen read model (masked configs)
  app.get(
    '/v1/integrations',
    {
      preHandler: authenticate,
      schema: {
        response: { 200: successResponseSchema(z.object({ integrations: z.array(integrationDetailSchema) })) },
      },
    },
    async (request, reply) => {
      const auth = (request as any).authContext;
      if (!ALLOWED_ROLES.includes(auth.role)) return forbidden(reply);
      const integrations = await container.listIntegrationsUseCase.execute();
      return reply.send(success({ integrations }));
    },
  );

  // GET /v1/integrations/status — lightweight feed for dashboard warnings
  app.get(
    '/v1/integrations/status',
    {
      preHandler: authenticate,
      schema: {
        response: { 200: successResponseSchema(z.object({ integrations: z.array(integrationStatusSchema) })) },
      },
    },
    async (request, reply) => {
      const auth = (request as any).authContext;
      if (!ALLOWED_ROLES.includes(auth.role)) return forbidden(reply);
      const integrations = await container.integrationConfigResolver.getStatus();
      return reply.send(success({ integrations }));
    },
  );

  // PUT /v1/integrations/:provider — upsert config (write-only secrets)
  app.put(
    '/v1/integrations/:provider',
    {
      preHandler: authenticate,
      schema: {
        params: providerParam,
        body: integrationUpsertSchema,
        response: { 200: successResponseSchema(integrationDetailSchema) },
      },
    },
    async (request, reply) => {
      const auth = (request as any).authContext;
      if (!ALLOWED_ROLES.includes(auth.role)) return forbidden(reply);
      const { provider } = request.params as z.infer<typeof providerParam>;
      const body = request.body as z.infer<typeof integrationUpsertSchema>;
      const detail = await container.upsertIntegrationSettingUseCase.execute({
        provider,
        config: body.config,
        enabled: body.enabled,
        actorId: auth.userId,
      });
      return reply.send(success(detail));
    },
  );

  // DELETE /v1/integrations/:provider — remove DB config (revert to env/stub)
  app.delete(
    '/v1/integrations/:provider',
    {
      preHandler: authenticate,
      schema: {
        params: providerParam,
        response: { 200: successResponseSchema(z.object({ deleted: z.boolean() })) },
      },
    },
    async (request, reply) => {
      const auth = (request as any).authContext;
      if (!ALLOWED_ROLES.includes(auth.role)) return forbidden(reply);
      const { provider } = request.params as z.infer<typeof providerParam>;
      await container.deleteIntegrationSettingUseCase.execute({ provider, actorId: auth.userId });
      return reply.send(success({ deleted: true }));
    },
  );

  // POST /v1/integrations/:provider/test — read-only connectivity check
  app.post(
    '/v1/integrations/:provider/test',
    {
      preHandler: authenticate,
      schema: {
        params: providerParam,
        response: { 200: successResponseSchema(integrationTestResultSchema) },
      },
    },
    async (request, reply) => {
      const auth = (request as any).authContext;
      if (!ALLOWED_ROLES.includes(auth.role)) return forbidden(reply);
      const { provider } = request.params as z.infer<typeof providerParam>;
      const result = await container.testIntegrationConnectionUseCase.execute({ provider });
      return reply.send(success(result));
    },
  );

  // POST /v1/api-keys — create (plaintext key returned exactly once)
  app.post(
    '/v1/api-keys',
    {
      preHandler: authenticate,
      schema: {
        body: apiKeyCreateSchema,
        response: { 201: successResponseSchema(apiKeyCreatedSchema) },
      },
    },
    async (request, reply) => {
      const auth = (request as any).authContext;
      if (!ALLOWED_ROLES.includes(auth.role)) return forbidden(reply);
      const body = request.body as z.infer<typeof apiKeyCreateSchema>;
      const created = await container.createApiKeyUseCase.execute({
        name: body.name,
        role: body.role,
        expiresAt: body.expiresAt ?? null,
        actorId: auth.userId,
      });
      return reply.status(201).send(success(created));
    },
  );

  // GET /v1/api-keys — list (no hashes, no plaintext)
  app.get(
    '/v1/api-keys',
    {
      preHandler: authenticate,
      schema: {
        response: { 200: successResponseSchema(z.object({ apiKeys: z.array(apiKeyResponseSchema) })) },
      },
    },
    async (request, reply) => {
      const auth = (request as any).authContext;
      if (!ALLOWED_ROLES.includes(auth.role)) return forbidden(reply);
      const apiKeys = await container.listApiKeysUseCase.execute();
      return reply.send(success({ apiKeys }));
    },
  );

  // POST /v1/api-keys/:id/revoke
  app.post(
    '/v1/api-keys/:id/revoke',
    {
      preHandler: authenticate,
      schema: {
        params: idParam,
        response: { 200: successResponseSchema(apiKeyResponseSchema) },
      },
    },
    async (request, reply) => {
      const auth = (request as any).authContext;
      if (!ALLOWED_ROLES.includes(auth.role)) return forbidden(reply);
      const { id } = request.params as z.infer<typeof idParam>;
      const revoked = await container.revokeApiKeyUseCase.execute({ id, actorId: auth.userId });
      return reply.send(success(revoked));
    },
  );
}
