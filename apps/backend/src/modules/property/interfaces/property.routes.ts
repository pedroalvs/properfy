import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createPropertySchema,
  updatePropertySchema,
  listPropertiesQuerySchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { success, paginated } from '../../../shared/interfaces/response';
import type { CreatePropertyUseCase } from '../application/use-cases/create-property.use-case';
import type { GetPropertyUseCase } from '../application/use-cases/get-property.use-case';
import type { ListPropertiesUseCase } from '../application/use-cases/list-properties.use-case';
import type { UpdatePropertyUseCase } from '../application/use-cases/update-property.use-case';
import type { DeletePropertyUseCase } from '../application/use-cases/delete-property.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface PropertyRouteContainer {
  createPropertyUseCase: CreatePropertyUseCase;
  getPropertyUseCase: GetPropertyUseCase;
  listPropertiesUseCase: ListPropertiesUseCase;
  updatePropertyUseCase: UpdatePropertyUseCase;
  deletePropertyUseCase: DeletePropertyUseCase;
  jwtService: JwtService;
}

const propertyIdParam = z.object({ propertyId: z.string().uuid() });

export async function registerPropertyRoutes(
  app: FastifyInstance,
  container: PropertyRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware((token) =>
    container.jwtService.verify(token),
  );

  // POST /v1/properties
  app.post(
    '/v1/properties',
    { preHandler: authenticate },
    async (request, reply) => {
      const parsed = createPropertySchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      const result = await container.createPropertyUseCase.execute({
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(201).send(success(result));
    },
  );

  // GET /v1/properties
  app.get(
    '/v1/properties',
    { preHandler: authenticate },
    async (request, reply) => {
      const parsed = listPropertiesQuerySchema.safeParse(request.query);
      if (!parsed.success)
        throw new ValidationError(
          'Invalid query parameters',
          parsed.error.errors,
        );
      const { page, pageSize, sortBy, sortOrder, ...filters } = parsed.data;
      const result = await container.listPropertiesUseCase.execute({
        filters,
        pagination: { page, pageSize, sortBy, sortOrder },
        actor: request.authContext!,
      });
      return reply
        .status(200)
        .send(paginated(result.data, result.total, page, pageSize));
    },
  );

  // GET /v1/properties/:propertyId
  app.get(
    '/v1/properties/:propertyId',
    { preHandler: authenticate },
    async (request, reply) => {
      const params = propertyIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid property ID',
          params.error.errors,
        );
      const result = await container.getPropertyUseCase.execute({
        propertyId: params.data.propertyId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // PATCH /v1/properties/:propertyId
  app.patch(
    '/v1/properties/:propertyId',
    { preHandler: authenticate },
    async (request, reply) => {
      const params = propertyIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid property ID',
          params.error.errors,
        );
      const parsed = updatePropertySchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      const result = await container.updatePropertyUseCase.execute({
        propertyId: params.data.propertyId,
        data: parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // DELETE /v1/properties/:propertyId
  app.delete(
    '/v1/properties/:propertyId',
    { preHandler: authenticate },
    async (request, reply) => {
      const params = propertyIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid property ID',
          params.error.errors,
        );
      await container.deletePropertyUseCase.execute({
        propertyId: params.data.propertyId,
        actor: request.authContext!,
      });
      return reply.status(204).send();
    },
  );
}
