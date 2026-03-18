import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createServiceTypeSchema,
  updateServiceTypeSchema,
  listServiceTypesQuerySchema,
  serviceTypeResponseSchema,
  successResponseSchema,
  paginatedResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { success, paginated } from '../../../shared/interfaces/response';
import type { CreateServiceTypeUseCase } from '../application/use-cases/create-service-type.use-case';
import type { GetServiceTypeUseCase } from '../application/use-cases/get-service-type.use-case';
import type { ListServiceTypesUseCase } from '../application/use-cases/list-service-types.use-case';
import type { UpdateServiceTypeUseCase } from '../application/use-cases/update-service-type.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface ServiceTypeRouteContainer {
  createServiceTypeUseCase: CreateServiceTypeUseCase;
  getServiceTypeUseCase: GetServiceTypeUseCase;
  listServiceTypesUseCase: ListServiceTypesUseCase;
  updateServiceTypeUseCase: UpdateServiceTypeUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

const serviceTypeIdParam = z.object({ serviceTypeId: z.string().uuid() });

export async function registerServiceTypeRoutes(
  app: FastifyInstance,
  container: ServiceTypeRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  // POST /v1/service-types
  app.post(
    '/v1/service-types',
    { preHandler: authenticate, schema: { body: createServiceTypeSchema, response: { 201: successResponseSchema(serviceTypeResponseSchema) } } },
    async (request, reply) => {
      const parsed = createServiceTypeSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      const result = await container.createServiceTypeUseCase.execute({
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(201).send(success(result));
    },
  );

  // GET /v1/service-types
  app.get(
    '/v1/service-types',
    { preHandler: authenticate, schema: { querystring: listServiceTypesQuerySchema, response: { 200: paginatedResponseSchema(serviceTypeResponseSchema) } } },
    async (request, reply) => {
      const parsed = listServiceTypesQuerySchema.safeParse(request.query);
      if (!parsed.success)
        throw new ValidationError(
          'Invalid query parameters',
          parsed.error.errors,
        );
      const { page, pageSize, sortBy, sortOrder, ...filters } = parsed.data;
      const result = await container.listServiceTypesUseCase.execute({
        filters,
        pagination: { page, pageSize, sortBy, sortOrder },
        actor: request.authContext!,
      });
      return reply
        .status(200)
        .send(paginated(result.data, result.total, page, pageSize));
    },
  );

  // GET /v1/service-types/:serviceTypeId
  app.get(
    '/v1/service-types/:serviceTypeId',
    { preHandler: authenticate, schema: { params: z.object({ serviceTypeId: z.string().uuid() }), response: { 200: successResponseSchema(serviceTypeResponseSchema) } } },
    async (request, reply) => {
      const params = serviceTypeIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid service type ID',
          params.error.errors,
        );
      const result = await container.getServiceTypeUseCase.execute({
        serviceTypeId: params.data.serviceTypeId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // PATCH /v1/service-types/:serviceTypeId
  app.patch(
    '/v1/service-types/:serviceTypeId',
    { preHandler: authenticate, schema: { params: z.object({ serviceTypeId: z.string().uuid() }), body: updateServiceTypeSchema, response: { 200: successResponseSchema(serviceTypeResponseSchema) } } },
    async (request, reply) => {
      const params = serviceTypeIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid service type ID',
          params.error.errors,
        );
      const parsed = updateServiceTypeSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      const result = await container.updateServiceTypeUseCase.execute({
        serviceTypeId: params.data.serviceTypeId,
        data: parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );
}
