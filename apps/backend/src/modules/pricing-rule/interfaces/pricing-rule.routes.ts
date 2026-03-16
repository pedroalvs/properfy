import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createPricingRuleSchema,
  updatePricingRuleSchema,
  listPricingRulesQuerySchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { success, paginated } from '../../../shared/interfaces/response';
import type { CreatePricingRuleUseCase } from '../application/use-cases/create-pricing-rule.use-case';
import type { ListPricingRulesUseCase } from '../application/use-cases/list-pricing-rules.use-case';
import type { UpdatePricingRuleUseCase } from '../application/use-cases/update-pricing-rule.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface PricingRuleRouteContainer {
  createPricingRuleUseCase: CreatePricingRuleUseCase;
  listPricingRulesUseCase: ListPricingRulesUseCase;
  updatePricingRuleUseCase: UpdatePricingRuleUseCase;
  jwtService: JwtService;
}

const pricingRuleIdParam = z.object({ pricingRuleId: z.string().uuid() });

export async function registerPricingRuleRoutes(
  app: FastifyInstance,
  container: PricingRuleRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware((token) =>
    container.jwtService.verify(token),
  );

  // POST /v1/pricing-rules
  app.post(
    '/v1/pricing-rules',
    { preHandler: authenticate },
    async (request, reply) => {
      const parsed = createPricingRuleSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      const result = await container.createPricingRuleUseCase.execute({
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(201).send(success(result));
    },
  );

  // GET /v1/pricing-rules
  app.get(
    '/v1/pricing-rules',
    { preHandler: authenticate },
    async (request, reply) => {
      const parsed = listPricingRulesQuerySchema.safeParse(request.query);
      if (!parsed.success)
        throw new ValidationError(
          'Invalid query parameters',
          parsed.error.errors,
        );
      const { page, pageSize, sortBy, sortOrder, ...filters } = parsed.data;
      const result = await container.listPricingRulesUseCase.execute({
        filters,
        pagination: { page, pageSize, sortBy, sortOrder },
        actor: request.authContext!,
      });
      return reply
        .status(200)
        .send(paginated(result.data, result.total, page, pageSize));
    },
  );

  // PATCH /v1/pricing-rules/:pricingRuleId
  app.patch(
    '/v1/pricing-rules/:pricingRuleId',
    { preHandler: authenticate },
    async (request, reply) => {
      const params = pricingRuleIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid pricing rule ID',
          params.error.errors,
        );
      const parsed = updatePricingRuleSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      const result = await container.updatePricingRuleUseCase.execute({
        pricingRuleId: params.data.pricingRuleId,
        data: parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );
}
