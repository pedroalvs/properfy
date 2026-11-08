import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  UserRole,
  createGoalSchema,
  updateGoalSchema,
  voidAwardSchema,
  listGoalsQuerySchema,
  listAwardsQuerySchema,
  programPeriodsQuerySchema,
  programPeriodsResponseSchema,
  programPeriodSummaryQuerySchema,
  programPeriodSummaryResponseSchema,
  goalResponseSchema,
  rewardAwardResponseSchema,
  inspectorProgramResponseSchema,
  successResponseSchema,
  paginatedResponseSchema,
  type CreateGoalInput,
  type UpdateGoalInput,
  type ListGoalsQuery,
  type ListAwardsQuery,
  type ProgramPeriodsQuery,
  type ProgramPeriodSummaryQuery,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { requireRoles } from '../../../shared/interfaces/role-guard';
import { success, paginated } from '../../../shared/interfaces/response';
import type { JwtService } from '../../auth/application/services/jwt.service';
import type { CreateGoalUseCase } from '../application/use-cases/create-goal.use-case';
import type { UpdateGoalUseCase } from '../application/use-cases/update-goal.use-case';
import type { ListGoalsUseCase } from '../application/use-cases/list-goals.use-case';
import type { GetGoalUseCase } from '../application/use-cases/get-goal.use-case';
import type { ListProgramPeriodsUseCase } from '../application/use-cases/list-program-periods.use-case';
import type { ListRewardAwardsUseCase } from '../application/use-cases/list-reward-awards.use-case';
import type { GetProgramPeriodSummaryUseCase } from '../application/use-cases/get-program-period-summary.use-case';
import type { ApproveRewardAwardUseCase } from '../application/use-cases/approve-reward-award.use-case';
import type { VoidRewardAwardUseCase } from '../application/use-cases/void-reward-award.use-case';
import type { GetInspectorProgramUseCase } from '../application/use-cases/get-inspector-program.use-case';
import { RewardAwardIdempotencyKeyRequiredError } from '../domain/inspector-program.errors';
import { toRewardAwardResponse } from '../application/mappers';

export interface InspectorProgramRouteContainer {
  createGoalUseCase: CreateGoalUseCase;
  updateGoalUseCase: UpdateGoalUseCase;
  listGoalsUseCase: ListGoalsUseCase;
  getGoalUseCase: GetGoalUseCase;
  listProgramPeriodsUseCase: ListProgramPeriodsUseCase;
  listRewardAwardsUseCase: ListRewardAwardsUseCase;
  getProgramPeriodSummaryUseCase: GetProgramPeriodSummaryUseCase;
  approveRewardAwardUseCase: ApproveRewardAwardUseCase;
  voidRewardAwardUseCase: VoidRewardAwardUseCase;
  getInspectorProgramUseCase: GetInspectorProgramUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

const goalIdParam = z.object({ goalId: z.string().uuid() });
const awardIdParam = z.object({ awardId: z.string().uuid() });

// The void route tightens the shared `reason` minimum to 5 characters (FR-009),
// keeping `.strict()` so a stray `recoveryNote` (Q12) is still rejected.
const voidAwardBodySchema = voidAwardSchema.extend({ reason: z.string().trim().min(5).max(500) });

function requireIdempotencyKey(request: FastifyRequest): string {
  const value = request.headers['idempotency-key'];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RewardAwardIdempotencyKeyRequiredError();
  }
  return value;
}

/**
 * Inspector program admin routes (F08-1, AM/OP only). Thin handlers: authenticate,
 * then call the use case (which asserts the role before any read) and map the
 * response. Agencies, inspectors and the portal get `403` (Q18/D8). The response
 * schema strips undeclared fields; goals/awards carry no agency/coordinate data.
 */
export async function registerInspectorProgramRoutes(
  app: FastifyInstance,
  container: InspectorProgramRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );
  const adminOnly = [authenticate, requireRoles([UserRole.AM, UserRole.OP])];

  // Local INSP guard (same codes/messages as inspector-execution): 403 for a
  // non-inspector, 400 when the inspector user has no linked inspector profile.
  const requireLinkedInspector = (
    auth: { role: string; inspectorId: string | null },
    reply: FastifyReply,
    action: string,
  ): string | null => {
    if (auth.role !== UserRole.INSP) {
      reply.status(403).send({ error: { code: 'FORBIDDEN', message: `Only inspectors can ${action}` } });
      return null;
    }
    if (!auth.inspectorId) {
      reply.status(400).send({ error: { code: 'INSPECTOR_NOT_LINKED', message: 'Inspector not linked to user account' } });
      return null;
    }
    return auth.inspectorId;
  };

  // ── Inspector-facing program (INSP only; own data) ─────────────────────────

  app.get(
    '/v1/inspector/program',
    {
      preHandler: authenticate,
      schema: { response: { 200: successResponseSchema(inspectorProgramResponseSchema) } },
    },
    async (request, reply) => {
      const inspectorId = requireLinkedInspector(request.authContext!, reply, 'view their program');
      if (inspectorId === null) return reply;
      const result = await container.getInspectorProgramUseCase.execute({ inspectorId });
      return reply.status(200).send(success(result));
    },
  );

  // ── Goals ────────────────────────────────────────────────────────────────

  app.get(
    '/v1/inspector-program/goals',
    {
      preHandler: adminOnly,
      schema: {
        querystring: listGoalsQuerySchema,
        response: { 200: paginatedResponseSchema(goalResponseSchema) },
      },
    },
    async (request, reply) => {
      const query = request.query as ListGoalsQuery;
      const result = await container.listGoalsUseCase.execute({ actor: request.authContext!, query });
      return reply.status(200).send(paginated(result.data, result.total, query.page, query.pageSize));
    },
  );

  app.post(
    '/v1/inspector-program/goals',
    {
      preHandler: adminOnly,
      schema: {
        body: createGoalSchema,
        response: { 201: successResponseSchema(goalResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await container.createGoalUseCase.execute({
        data: request.body as CreateGoalInput,
        actor: request.authContext!,
        requestId: request.id,
      });
      return reply.status(201).send(success(result));
    },
  );

  app.get(
    '/v1/inspector-program/goals/:goalId',
    {
      preHandler: adminOnly,
      schema: {
        params: goalIdParam,
        response: { 200: successResponseSchema(goalResponseSchema) },
      },
    },
    async (request, reply) => {
      const { goalId } = request.params as z.infer<typeof goalIdParam>;
      const result = await container.getGoalUseCase.execute({ goalId, actor: request.authContext! });
      return reply.status(200).send(success(result));
    },
  );

  app.patch(
    '/v1/inspector-program/goals/:goalId',
    {
      preHandler: adminOnly,
      schema: {
        params: goalIdParam,
        body: updateGoalSchema,
        response: { 200: successResponseSchema(goalResponseSchema) },
      },
    },
    async (request, reply) => {
      const { goalId } = request.params as z.infer<typeof goalIdParam>;
      const result = await container.updateGoalUseCase.execute({
        goalId,
        data: request.body as UpdateGoalInput,
        actor: request.authContext!,
        requestId: request.id,
      });
      return reply.status(200).send(success(result));
    },
  );

  app.get(
    '/v1/inspector-program/periods',
    {
      preHandler: adminOnly,
      schema: {
        querystring: programPeriodsQuerySchema,
        response: { 200: programPeriodsResponseSchema },
      },
    },
    async (request, reply) => {
      const query = request.query as ProgramPeriodsQuery;
      const result = await container.listProgramPeriodsUseCase.execute({ actor: request.authContext!, query });
      return reply.status(200).send(result);
    },
  );

  // ── Rewards ──────────────────────────────────────────────────────────────

  app.get(
    '/v1/inspector-program/awards',
    {
      preHandler: adminOnly,
      schema: {
        querystring: listAwardsQuerySchema,
        response: { 200: paginatedResponseSchema(rewardAwardResponseSchema) },
      },
    },
    async (request, reply) => {
      const query = request.query as ListAwardsQuery;
      const result = await container.listRewardAwardsUseCase.execute(request.authContext!, {
        status: query.status,
        periodType: query.periodType,
        periodStart: query.periodStart,
        goalId: query.goalId,
        inspectorId: query.inspectorId,
        page: query.page,
        pageSize: query.pageSize,
      });
      return reply
        .status(200)
        .send(paginated(result.data.map(toRewardAwardResponse), result.total, query.page, query.pageSize));
    },
  );

  app.get(
    '/v1/inspector-program/summary',
    {
      preHandler: adminOnly,
      schema: {
        querystring: programPeriodSummaryQuerySchema,
        response: { 200: successResponseSchema(programPeriodSummaryResponseSchema) },
      },
    },
    async (request, reply) => {
      const query = request.query as ProgramPeriodSummaryQuery;
      const result = await container.getProgramPeriodSummaryUseCase.execute(request.authContext!, {
        periodType: query.periodType,
        periodStart: query.periodStart,
      });
      return reply.status(200).send(success(result));
    },
  );

  app.post(
    '/v1/inspector-program/awards/:awardId/approve',
    {
      preHandler: adminOnly,
      schema: {
        params: awardIdParam,
        response: { 200: successResponseSchema(rewardAwardResponseSchema) },
      },
    },
    async (request, reply) => {
      const { awardId } = request.params as z.infer<typeof awardIdParam>;
      const result = await container.approveRewardAwardUseCase.execute({
        awardId,
        idempotencyKey: requireIdempotencyKey(request),
        actor: request.authContext!,
        requestId: request.id,
      });
      return reply.status(200).send(success(result));
    },
  );

  app.post(
    '/v1/inspector-program/awards/:awardId/void',
    {
      preHandler: adminOnly,
      schema: {
        params: awardIdParam,
        body: voidAwardBodySchema,
        response: { 200: successResponseSchema(rewardAwardResponseSchema) },
      },
    },
    async (request, reply) => {
      const { awardId } = request.params as z.infer<typeof awardIdParam>;
      const body = request.body as z.infer<typeof voidAwardBodySchema>;
      const result = await container.voidRewardAwardUseCase.execute({
        awardId,
        idempotencyKey: requireIdempotencyKey(request),
        reason: body.reason,
        inspectorNote: body.inspectorNote,
        actor: request.authContext!,
        requestId: request.id,
      });
      return reply.status(200).send(success(result));
    },
  );
}
