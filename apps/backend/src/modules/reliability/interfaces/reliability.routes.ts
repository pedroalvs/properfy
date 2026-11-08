import type { FastifyInstance } from 'fastify';
import {
  inspectorReliabilityParamsSchema,
  inspectorReliabilityResponseSchema,
  reliabilityRankingResponseSchema,
  successResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { success } from '../../../shared/interfaces/response';
import type { JwtService } from '../../auth/application/services/jwt.service';
import type { GetReliabilityRankingUseCase } from '../application/use-cases/get-reliability-ranking.use-case';
import type { GetInspectorReliabilityUseCase } from '../application/use-cases/get-inspector-reliability.use-case';

export interface ReliabilityRouteContainer {
  getRankingUseCase: Pick<GetReliabilityRankingUseCase, 'execute'>;
  getInspectorReliabilityUseCase: Pick<GetInspectorReliabilityUseCase, 'execute'>;
  jwtService: JwtService;
  tenantRepo: {
    findById(id: string): Promise<{ isActive(): boolean } | null>;
  };
}

/**
 * Reliability index routes (F07-2, AM/OP only — action `reliability.view`). Thin
 * handlers: authenticate, then call the use case (which asserts the role before any
 * read) and map the response. The `response` schema strips undeclared fields as a
 * privacy barrier (no coordinate/email/phone key reaches the client).
 */
export async function registerReliabilityRoutes(
  app: FastifyInstance,
  container: ReliabilityRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  // GET /v1/dashboard/inspector-performance — 200 ranking (AM/OP)
  app.get(
    '/v1/dashboard/inspector-performance',
    {
      preHandler: authenticate,
      schema: { response: { 200: successResponseSchema(reliabilityRankingResponseSchema) } },
    },
    async (request, reply) => {
      const result = await container.getRankingUseCase.execute({ actor: request.authContext! });
      return reply.status(200).send(success(result));
    },
  );

  // GET /v1/dashboard/inspector-performance/:inspectorId — 200 detail (AM/OP)
  app.get(
    '/v1/dashboard/inspector-performance/:inspectorId',
    {
      preHandler: authenticate,
      schema: {
        params: inspectorReliabilityParamsSchema,
        response: { 200: successResponseSchema(inspectorReliabilityResponseSchema) },
      },
    },
    async (request, reply) => {
      const { inspectorId } = request.params as { inspectorId: string };
      const result = await container.getInspectorReliabilityUseCase.execute({
        actor: request.authContext!,
        inspectorId,
      });
      return reply.status(200).send(success(result));
    },
  );
}
