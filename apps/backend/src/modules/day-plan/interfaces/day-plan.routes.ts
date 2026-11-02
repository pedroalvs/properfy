import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  civilDateSchema,
  dayPlanResponseSchema,
  dayPlanSheetQuerySchema,
  routeEtaAccuracyQuerySchema,
  routeEtaAccuracySchema,
  saveDayPlanOrderRequestSchema,
  setDayPlanOriginRequestSchema,
  successResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ForbiddenError } from '../../../shared/domain/errors';
import { success } from '../../../shared/interfaces/response';
import type { JwtService } from '../../auth/application/services/jwt.service';
import type { ITenantRepository } from '../../tenant/domain/tenant.repository';
import type { GetMyDayPlanUseCase } from '../application/use-cases/get-my-day-plan.use-case';
import type { GetDayPlanForOperatorUseCase } from '../application/use-cases/get-day-plan-for-operator.use-case';
import type { SaveDayPlanOrderUseCase } from '../application/use-cases/save-day-plan-order.use-case';
import type { RecalculateDayPlanUseCase } from '../application/use-cases/recalculate-day-plan.use-case';
import type {
  SetDayPlanOriginUseCase,
  ClearDayPlanOriginUseCase,
} from '../application/use-cases/day-plan-origin.use-case';
import type { GetRouteEtaAccuracyUseCase } from '../application/use-cases/get-route-eta-accuracy.use-case';
import type { GetDayPlanSheetUseCase } from '../application/use-cases/get-day-plan-sheet.use-case';

export interface DayPlanRouteContainer {
  getMyDayPlanUseCase: GetMyDayPlanUseCase;
  getDayPlanForOperatorUseCase: GetDayPlanForOperatorUseCase;
  saveDayPlanOrderUseCase: SaveDayPlanOrderUseCase;
  recalculateDayPlanUseCase: RecalculateDayPlanUseCase;
  setDayPlanOriginUseCase: SetDayPlanOriginUseCase;
  clearDayPlanOriginUseCase: ClearDayPlanOriginUseCase;
  getRouteEtaAccuracyUseCase: GetRouteEtaAccuracyUseCase;
  getDayPlanSheetUseCase: GetDayPlanSheetUseCase;
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

/** AM/OP-only platform routes (operator read, sheet, metric). */
function requireOperator(role: string): void {
  if (role !== 'AM' && role !== 'OP') {
    throw new ForbiddenError('FORBIDDEN', `Role ${role} is not permitted to perform day_plan.view`);
  }
}

const sheetQuery = dayPlanSheetQuerySchema;

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

  // PUT /v1/inspector/day-plans/:date/order — the inspector saves a stop order (30/min).
  app.put(
    '/v1/inspector/day-plans/:date/order',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        params: dateParam,
        body: saveDayPlanOrderRequestSchema,
        response: { 200: successResponseSchema(dayPlanResponseSchema) },
      },
    },
    async (request, reply) => {
      const inspectorId = requireInspector(request.authContext!.role, request.authContext!.inspectorId);
      const { date } = dateParam.parse(request.params);
      const body = saveDayPlanOrderRequestSchema.parse(request.body);
      const result = await container.saveDayPlanOrderUseCase.execute({
        inspectorId,
        actorUserId: request.authContext!.userId,
        date,
        appointmentIds: body.appointmentIds,
        basedOnVersion: body.basedOnVersion,
      });
      return reply.status(200).send(success(result));
    },
  );

  // PUT /v1/inspector/day-plans/:date/origin — set a day-origin override (10/min).
  app.put(
    '/v1/inspector/day-plans/:date/origin',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { params: dateParam, body: setDayPlanOriginRequestSchema, response: { 200: successResponseSchema(dayPlanResponseSchema) } },
    },
    async (request, reply) => {
      const inspectorId = requireInspector(request.authContext!.role, request.authContext!.inspectorId);
      const { date } = dateParam.parse(request.params);
      const { address } = setDayPlanOriginRequestSchema.parse(request.body);
      const result = await container.setDayPlanOriginUseCase.execute({
        inspectorId,
        actorUserId: request.authContext!.userId,
        date,
        address,
      });
      return reply.status(200).send(success(result));
    },
  );

  // DELETE /v1/inspector/day-plans/:date/origin — clear the day-origin override (10/min).
  app.delete(
    '/v1/inspector/day-plans/:date/origin',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { params: dateParam, response: { 200: successResponseSchema(dayPlanResponseSchema) } },
    },
    async (request, reply) => {
      const inspectorId = requireInspector(request.authContext!.role, request.authContext!.inspectorId);
      const { date } = dateParam.parse(request.params);
      const result = await container.clearDayPlanOriginUseCase.execute({
        inspectorId,
        actorUserId: request.authContext!.userId,
        date,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/inspector/day-plans/:date/recalculate — the inspector resets to the suggested order (6/min).
  app.post(
    '/v1/inspector/day-plans/:date/recalculate',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
      schema: { params: dateParam, response: { 200: successResponseSchema(dayPlanResponseSchema) } },
    },
    async (request, reply) => {
      requireInspector(request.authContext!.role, request.authContext!.inspectorId);
      const { date } = dateParam.parse(request.params);
      const result = await container.recalculateDayPlanUseCase.execute({
        actor: request.authContext!,
        inspectorId: request.authContext!.inspectorId!,
        date,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/day-plans/:inspectorId/:date/recalculate — AM/OP recalc (ROUTE_CHANGED on change, 30/min).
  app.post(
    '/v1/day-plans/:inspectorId/:date/recalculate',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { params: operatorParams, response: { 200: successResponseSchema(dayPlanResponseSchema) } },
    },
    async (request, reply) => {
      const { inspectorId, date } = operatorParams.parse(request.params);
      const result = await container.recalculateDayPlanUseCase.execute({
        actor: request.authContext!,
        inspectorId,
        date,
      });
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

  // GET /v1/inspector/day-plans/:date/sheet — the inspector downloads their sheet (20/min, L-F04-10).
  app.get(
    '/v1/inspector/day-plans/:date/sheet',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: { params: dateParam, querystring: sheetQuery },
    },
    async (request, reply) => {
      requireInspector(request.authContext!.role, request.authContext!.inspectorId);
      const { date } = dateParam.parse(request.params);
      const { format } = sheetQuery.parse(request.query);
      const result = await container.getDayPlanSheetUseCase.execute({
        actor: request.authContext!,
        date,
        format,
      });
      return sendSheet(reply, result);
    },
  );

  // GET /v1/day-plans/:inspectorId/:date/sheet — AM/OP download any inspector's sheet (20/min, no date limit).
  app.get(
    '/v1/day-plans/:inspectorId/:date/sheet',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: { params: operatorParams, querystring: sheetQuery },
    },
    async (request, reply) => {
      requireOperator(request.authContext!.role);
      const { inspectorId, date } = operatorParams.parse(request.params);
      const { format } = sheetQuery.parse(request.query);
      const result = await container.getDayPlanSheetUseCase.execute({
        actor: request.authContext!,
        inspectorId,
        date,
        format,
      });
      return sendSheet(reply, result);
    },
  );

  // GET /v1/day-plans/eta-accuracy — AM/OP read the "Route ETA accuracy" metric (60/min).
  // Static path; Fastify's radix router prefers it over `/:inspectorId/:date` (test 24).
  app.get(
    '/v1/day-plans/eta-accuracy',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        querystring: routeEtaAccuracyQuerySchema,
        response: { 200: successResponseSchema(routeEtaAccuracySchema) },
      },
    },
    async (request, reply) => {
      requireOperator(request.authContext!.role);
      const { days } = routeEtaAccuracyQuerySchema.parse(request.query);
      const result = await container.getRouteEtaAccuracyUseCase.execute({ days });
      return reply.status(200).send(success(result));
    },
  );
}

/** Streams a rendered route sheet with its download headers (binary, no response schema). */
function sendSheet(
  reply: FastifyReply,
  result: { buffer: Buffer; contentType: string; filename: string },
) {
  return reply
    .header('Content-Type', result.contentType)
    .header('Content-Disposition', `attachment; filename="${result.filename}"`)
    .status(200)
    .send(result.buffer);
}
