import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listMarketplaceOffersQuerySchema,
  marketplaceOfferResponseSchema,
  marketplaceOfferDetailResponseSchema,
  marketplaceOfferAcceptResponseSchema,
  successResponseSchema,
  paginatedResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { success, paginated } from '../../../shared/interfaces/response';
import type { GetMarketplaceOffersUseCase } from '../application/use-cases/get-marketplace-offers.use-case';
import type { GetMarketplaceOfferDetailUseCase } from '../application/use-cases/get-marketplace-offer-detail.use-case';
import type { AcceptOfferUseCase } from '../application/use-cases/accept-offer.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface MarketplaceRouteContainer {
  getMarketplaceOffersUseCase: GetMarketplaceOffersUseCase;
  getMarketplaceOfferDetailUseCase: GetMarketplaceOfferDetailUseCase;
  acceptOfferUseCase: AcceptOfferUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

const groupIdParam = z.object({ groupId: z.string().uuid() });

export async function registerMarketplaceRoutes(
  app: FastifyInstance,
  container: MarketplaceRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  // GET /v1/marketplace/offers — paginated 200
  app.get(
    '/v1/marketplace/offers',
    {
      preHandler: authenticate,
      schema: {
        querystring: listMarketplaceOffersQuerySchema,
        response: { 200: paginatedResponseSchema(marketplaceOfferResponseSchema) },
      },
    },
    async (request, reply) => {
      const parsed = listMarketplaceOffersQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }
      const { page, pageSize, sortBy, sortOrder } = parsed.data;
      const result = await container.getMarketplaceOffersUseCase.execute({
        inspectorId: request.authContext!.inspectorId!,
        pagination: { page, pageSize, sortBy, sortOrder },
        actor: request.authContext!,
      });
      return reply.status(200).send(paginated(result.data, result.total, page, pageSize));
    },
  );

  // GET /v1/marketplace/offers/:groupId — detail 200
  app.get(
    '/v1/marketplace/offers/:groupId',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ groupId: z.string().uuid() }),
        response: { 200: successResponseSchema(marketplaceOfferDetailResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = groupIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid group ID', params.error.errors);
      }
      const result = await container.getMarketplaceOfferDetailUseCase.execute({
        groupId: params.data.groupId,
        inspectorId: request.authContext!.inspectorId!,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/marketplace/offers/:groupId/accept — 200
  app.post(
    '/v1/marketplace/offers/:groupId/accept',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ groupId: z.string().uuid() }),
        response: { 200: successResponseSchema(marketplaceOfferAcceptResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = groupIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid group ID', params.error.errors);
      }
      const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
      const result = await container.acceptOfferUseCase.execute({
        groupId: params.data.groupId,
        inspectorId: request.authContext!.inspectorId!,
        actor: request.authContext!,
        idempotencyKey,
      });
      return reply.status(200).send(success(result));
    },
  );
}
