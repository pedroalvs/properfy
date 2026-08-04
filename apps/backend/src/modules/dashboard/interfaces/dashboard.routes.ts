import type { FastifyInstance } from 'fastify';
import {
  analyticsHeatmapResponseSchema,
  dashboardAnalyticsQuerySchema,
  dashboardAnalyticsResponseSchema,
  dashboardStatsResponseSchema,
  inspectorWorkloadQuerySchema,
  inspectorWorkloadResponseSchema,
  successResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { normalizeClUserPermissions } from '../../../shared/domain/cl-user-permissions';
import { ValidationError } from '../../../shared/domain/errors';
import { success } from '../../../shared/interfaces/response';
import type { GetDashboardStatsUseCase } from '../application/use-cases/get-dashboard-stats.use-case';
import type { GetDashboardAnalyticsUseCase } from '../application/use-cases/get-dashboard-analytics.use-case';
import type { GetAnalyticsHeatmapUseCase } from '../application/use-cases/get-analytics-heatmap.use-case';
import type { GetInspectorWorkloadUseCase } from '../application/use-cases/get-inspector-workload.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface DashboardRouteContainer {
  getDashboardStatsUseCase: GetDashboardStatsUseCase;
  getDashboardAnalyticsUseCase: GetDashboardAnalyticsUseCase;
  getAnalyticsHeatmapUseCase: GetAnalyticsHeatmapUseCase;
  getInspectorWorkloadUseCase: GetInspectorWorkloadUseCase;
  jwtService: JwtService;
  tenantRepo: {
    findById(id: string): Promise<{ isActive(): boolean; settingsJson?: Record<string, unknown> } | null>;
  };
}

export async function registerDashboardRoutes(
  app: FastifyInstance,
  container: DashboardRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
    // Without this resolver `authContext.clUserPermissions` is undefined and the
    // analytics revenue gate would read every CL_USER as flagless.
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return normalizeClUserPermissions(tenant?.settingsJson?.clUserPermissions);
    },
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

  // GET /v1/dashboard/analytics — 200
  app.get(
    '/v1/dashboard/analytics',
    {
      preHandler: authenticate,
      schema: {
        querystring: dashboardAnalyticsQuerySchema,
        response: { 200: successResponseSchema(dashboardAnalyticsResponseSchema) },
      },
    },
    async (request, reply) => {
      const parsed = dashboardAnalyticsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Query parameters are invalid', parsed.error.errors);
      }
      const result = await container.getDashboardAnalyticsUseCase.execute({
        actor: request.authContext!,
        query: parsed.data,
      });
      return reply.status(200).send(success(result));
    },
  );

  // GET /v1/dashboard/analytics/heatmap — 200
  app.get(
    '/v1/dashboard/analytics/heatmap',
    {
      preHandler: authenticate,
      schema: {
        querystring: dashboardAnalyticsQuerySchema,
        response: { 200: successResponseSchema(analyticsHeatmapResponseSchema) },
      },
    },
    async (request, reply) => {
      const parsed = dashboardAnalyticsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Query parameters are invalid', parsed.error.errors);
      }
      const result = await container.getAnalyticsHeatmapUseCase.execute({
        actor: request.authContext!,
        query: parsed.data,
      });
      return reply.status(200).send(success(result));
    },
  );

  // GET /v1/dashboard/inspector-workload — 200
  // `weekStart` is optional; omitted, the use case resolves the current Sydney week.
  app.get(
    '/v1/dashboard/inspector-workload',
    {
      preHandler: authenticate,
      schema: {
        querystring: inspectorWorkloadQuerySchema,
        response: { 200: successResponseSchema(inspectorWorkloadResponseSchema) },
      },
    },
    async (request, reply) => {
      const parsed = inspectorWorkloadQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Query parameters are invalid', parsed.error.errors);
      }
      const result = await container.getInspectorWorkloadUseCase.execute({
        actor: request.authContext!,
        query: parsed.data,
      });
      return reply.status(200).send(success(result));
    },
  );
}
