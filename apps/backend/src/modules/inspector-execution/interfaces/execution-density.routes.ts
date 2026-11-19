import type { FastifyInstance } from 'fastify';
import {
  executionDensityQuerySchema,
  executionDensityResponseSchema,
  successResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { success } from '../../../shared/interfaces/response';
import type { JwtService } from '../../auth/application/services/jwt.service';
import type { GetExecutionDensityUseCase } from '../application/use-cases/get-execution-density.use-case';

export interface ExecutionDensityRouteContainer {
  getExecutionDensityUseCase: Pick<GetExecutionDensityUseCase, 'execute'>;
  jwtService: JwtService;
  tenantRepo: {
    findById(id: string): Promise<{ isActive(): boolean } | null>;
  };
}

/**
 * `GET /v1/map/execution-density` (F09-1). The route stays thin: authenticate,
 * validate the query, call the use case, map the response. All RBAC, tenant
 * scope, k-anonymity and preset enforcement live in the use case; the response
 * schema strips any field the cell object does not declare (second privacy
 * barrier against a raw coordinate ever reaching the client).
 */
export async function registerExecutionDensityRoutes(
  app: FastifyInstance,
  container: ExecutionDensityRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  // GET /v1/map/execution-density — 200
  app.get(
    '/v1/map/execution-density',
    {
      preHandler: authenticate,
      schema: {
        querystring: executionDensityQuerySchema,
        response: { 200: successResponseSchema(executionDensityResponseSchema) },
      },
    },
    async (request, reply) => {
      const parsed = executionDensityQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Query parameters are invalid', parsed.error.errors);
      }
      const result = await container.getExecutionDensityUseCase.execute({
        actor: request.authContext!,
        query: parsed.data,
      });
      return reply.status(200).send(success(result));
    },
  );
}
