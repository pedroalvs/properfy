import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createServiceRegionSchema,
  updateServiceRegionSchema,
  listServiceRegionsQuerySchema,
  resolveRegionsSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { success, paginated } from '../../../shared/interfaces/response';
import type { CreateServiceRegionUseCase } from '../application/use-cases/create-service-region.use-case';
import type { UpdateServiceRegionUseCase } from '../application/use-cases/update-service-region.use-case';
import type { GetServiceRegionUseCase } from '../application/use-cases/get-service-region.use-case';
import type { ListServiceRegionsUseCase } from '../application/use-cases/list-service-regions.use-case';
import type { DeactivateServiceRegionUseCase } from '../application/use-cases/deactivate-service-region.use-case';
import type { DeleteServiceRegionUseCase } from '../application/use-cases/delete-service-region.use-case';
import type { ResolveRegionsUseCase } from '../application/use-cases/resolve-regions.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface ServiceRegionRouteContainer {
  createServiceRegionUseCase: CreateServiceRegionUseCase;
  updateServiceRegionUseCase: UpdateServiceRegionUseCase;
  getServiceRegionUseCase: GetServiceRegionUseCase;
  listServiceRegionsUseCase: ListServiceRegionsUseCase;
  deactivateServiceRegionUseCase: DeactivateServiceRegionUseCase;
  deleteServiceRegionUseCase: DeleteServiceRegionUseCase;
  resolveRegionsUseCase: ResolveRegionsUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

const regionIdParam = z.object({ id: z.string().uuid() });

export async function registerServiceRegionRoutes(
  app: FastifyInstance,
  container: ServiceRegionRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  // GET /v1/service-regions — paginated list
  app.get(
    '/v1/service-regions',
    { preHandler: authenticate },
    async (request, reply) => {
      const parsed = listServiceRegionsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }
      const { page, pageSize, sortBy, sortOrder, ...filters } = parsed.data;
      const result = await container.listServiceRegionsUseCase.execute({
        filters,
        pagination: { page, pageSize, sortBy, sortOrder },
        actor: request.authContext!,
      });
      return reply.status(200).send(paginated(result.data, result.total, page, pageSize));
    },
  );

  // POST /v1/service-regions — create
  app.post(
    '/v1/service-regions',
    { preHandler: authenticate },
    async (request, reply) => {
      const parsed = createServiceRegionSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.createServiceRegionUseCase.execute({
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(201).send(success(result));
    },
  );

  // GET /v1/service-regions/:id — detail
  app.get(
    '/v1/service-regions/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const params = regionIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid region ID', params.error.errors);
      }
      const result = await container.getServiceRegionUseCase.execute({
        regionId: params.data.id,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // PATCH /v1/service-regions/:id — update
  app.patch(
    '/v1/service-regions/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const params = regionIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid region ID', params.error.errors);
      }
      const parsed = updateServiceRegionSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.updateServiceRegionUseCase.execute({
        regionId: params.data.id,
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/service-regions/:id/deactivate — deactivate
  app.post(
    '/v1/service-regions/:id/deactivate',
    { preHandler: authenticate },
    async (request, reply) => {
      const params = regionIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid region ID', params.error.errors);
      }
      const body = z.object({ reason: z.string().min(1) }).safeParse(request.body);
      if (!body.success) {
        throw new ValidationError('Request payload is invalid', body.error.errors);
      }
      const result = await container.deactivateServiceRegionUseCase.execute({
        regionId: params.data.id,
        reason: body.data.reason,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // DELETE /v1/service-regions/:id — delete (must be INACTIVE)
  app.delete(
    '/v1/service-regions/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const params = regionIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid region ID', params.error.errors);
      }
      await container.deleteServiceRegionUseCase.execute({
        regionId: params.data.id,
        actor: request.authContext!,
      });
      return reply.status(204).send();
    },
  );

  // POST /v1/service-regions/resolve — resolve regions for appointments
  app.post(
    '/v1/service-regions/resolve',
    { preHandler: authenticate },
    async (request, reply) => {
      const parsed = resolveRegionsSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.resolveRegionsUseCase.execute({
        appointmentIds: parsed.data.appointmentIds,
        tenantId: parsed.data.tenantId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );
}
