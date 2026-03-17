import type { FastifyInstance } from 'fastify';
import { dashboardStatsResponseSchema, successResponseSchema } from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { success } from '../../../shared/interfaces/response';
import type { GetDashboardStatsUseCase } from '../application/use-cases/get-dashboard-stats.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface DashboardRouteContainer {
  getDashboardStatsUseCase: GetDashboardStatsUseCase;
  jwtService: JwtService;
}

export async function registerDashboardRoutes(
  app: FastifyInstance,
  container: DashboardRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware((token) =>
    container.jwtService.verify(token),
  );

  // GET /v1/dashboard/stats — 200
  app.get(
    '/v1/dashboard/stats',
    {
      preHandler: authenticate,
      schema: {
        response: { 200: successResponseSchema(dashboardStatsResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await container.getDashboardStatsUseCase.execute({
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );
}
