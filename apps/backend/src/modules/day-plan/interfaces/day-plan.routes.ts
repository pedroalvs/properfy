import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { civilDateSchema, dayPlanResponseSchema, successResponseSchema } from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ForbiddenError } from '../../../shared/domain/errors';
import { success } from '../../../shared/interfaces/response';
import type { JwtService } from '../../auth/application/services/jwt.service';
import type { ITenantRepository } from '../../tenant/domain/tenant.repository';
import type { GetMyDayPlanUseCase } from '../application/use-cases/get-my-day-plan.use-case';
import type { GetDayPlanForOperatorUseCase } from '../application/use-cases/get-day-plan-for-operator.use-case';

export interface DayPlanRouteContainer {
  getMyDayPlanUseCase: GetMyDayPlanUseCase;
  getDayPlanForOperatorUseCase: GetDayPlanForOperatorUseCase;
  jwtService: JwtService;
  tenantRepo: ITenantRepository;
}

const dateParam = z.object({ date: civilDateSchema });
const operatorParams = z.object({ inspectorId: z.string().uuid(), date: civilDateSchema });

/** An inspector acting on their own plan: role INSP with a linked inspector profile. */
function requireInspector(role: string, inspectorId: string | null | undefined): string {
  if (role !== 'INSP') {
    throw new ForbiddenError('INSP_ONLY', 'This endpoint is only accessible to inspectors');
  }
  if (!inspectorId) {
    throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Your account is not linked to an inspector profile');
  }
  return inspectorId;
}

export async function registerDayPlanRoutes(
  app: FastifyInstance,
  container: DayPlanRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  // GET /v1/inspector/day-plans/:date — the inspector's own plan (60/min).
  app.get(
    '/v1/inspector/day-plans/:date',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        params: dateParam,
        response: { 200: successResponseSchema(dayPlanResponseSchema) },
      },
    },
    async (request, reply) => {
      const inspectorId = requireInspector(
        request.authContext!.role,
        request.authContext!.inspectorId,
      );
      const { date } = dateParam.parse(request.params);
      const result = await container.getMyDayPlanUseCase.execute({ inspectorId, date });
      return reply.status(200).send(success(result));
    },
  );

  // GET /v1/day-plans/:inspectorId/:date — AM/OP read, never calls Mapbox (120/min).
  app.get(
    '/v1/day-plans/:inspectorId/:date',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        params: operatorParams,
        response: { 200: successResponseSchema(dayPlanResponseSchema) },
      },
    },
    async (request, reply) => {
      const { inspectorId, date } = operatorParams.parse(request.params);
      const result = await container.getDayPlanForOperatorUseCase.execute({
        actor: request.authContext!,
        inspectorId,
        date,
      });
      return reply.status(200).send(success(result));
    },
  );
}
