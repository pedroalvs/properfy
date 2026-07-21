import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  addressSuggestionQuerySchema,
  addressSuggestionSchema,
  createPropertySchema,
  updatePropertySchema,
  listPropertiesQuerySchema,
  propertySummaryQuerySchema,
  propertySummaryResponseSchema,
  propertyResponseSchema,
  successResponseSchema,
  paginatedResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { success, paginated } from '../../../shared/interfaces/response';
import type { CreatePropertyUseCase } from '../application/use-cases/create-property.use-case';
import type { GetPropertyUseCase } from '../application/use-cases/get-property.use-case';
import type { ListPropertiesUseCase } from '../application/use-cases/list-properties.use-case';
import type { GetPropertySummaryUseCase } from '../application/use-cases/get-property-summary.use-case';
import type { UpdatePropertyUseCase } from '../application/use-cases/update-property.use-case';
import type { DeletePropertyUseCase } from '../application/use-cases/delete-property.use-case';
import type { GeocodePropertyUseCase } from '../application/use-cases/geocode-property.use-case';
import type { SearchAddressesUseCase } from '../application/use-cases/search-addresses.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface PropertyRouteContainer {
  createPropertyUseCase: CreatePropertyUseCase;
  getPropertyUseCase: GetPropertyUseCase;
  listPropertiesUseCase: ListPropertiesUseCase;
  getPropertySummaryUseCase: GetPropertySummaryUseCase;
  updatePropertyUseCase: UpdatePropertyUseCase;
  deletePropertyUseCase: DeletePropertyUseCase;
  geocodePropertyUseCase: GeocodePropertyUseCase;
  searchAddressesUseCase: SearchAddressesUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean; settingsJson?: Record<string, unknown> } | null> };
}

const propertyIdParam = z.object({ propertyId: z.string().uuid() });

export async function registerPropertyRoutes(
  app: FastifyInstance,
  container: PropertyRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return (tenant?.settingsJson?.clUserPermissions as string[] | undefined) ?? [];
    },
  );

  app.get(
    '/v1/address/suggestions',
    {
      preHandler: authenticate,
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
      schema: {
        querystring: addressSuggestionQuerySchema,
        response: { 200: successResponseSchema(z.array(addressSuggestionSchema)) },
      },
    },
    async (request, reply) => {
      const parsed = addressSuggestionQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }

      const result = await container.searchAddressesUseCase.execute({
        query: parsed.data.q,
        limit: parsed.data.limit,
        country: parsed.data.country,
        actor: request.authContext!,
      });

      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/properties
  app.post(
    '/v1/properties',
    { preHandler: authenticate, schema: { body: createPropertySchema, response: { 201: successResponseSchema(propertyResponseSchema) } } },
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
    { preHandler: authenticate, schema: { querystring: listPropertiesQuerySchema, response: { 200: paginatedResponseSchema(propertyResponseSchema) } } },
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

  // GET /v1/properties/summary — counts by type, ignoring any type filter
  app.get(
    '/v1/properties/summary',
    { preHandler: authenticate, schema: { querystring: propertySummaryQuerySchema, response: { 200: successResponseSchema(propertySummaryResponseSchema) } } },
    async (request, reply) => {
      const parsed = propertySummaryQuerySchema.safeParse(request.query);
      if (!parsed.success)
        throw new ValidationError(
          'Invalid query parameters',
          parsed.error.errors,
        );
      const result = await container.getPropertySummaryUseCase.execute({
        filters: parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // GET /v1/properties/:propertyId
  app.get(
    '/v1/properties/:propertyId',
    { preHandler: authenticate, schema: { params: z.object({ propertyId: z.string().uuid() }), response: { 200: successResponseSchema(propertyResponseSchema) } } },
    async (request, reply) => {
      const params = propertyIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid property ID',
          params.error.errors,
        );
      const query = request.query as Record<string, string>;
      const result = await container.getPropertyUseCase.execute({
        propertyId: params.data.propertyId,
        tenantId: query.tenantId || undefined,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // PATCH /v1/properties/:propertyId
  app.patch(
    '/v1/properties/:propertyId',
    { preHandler: authenticate, schema: { params: z.object({ propertyId: z.string().uuid() }), body: updatePropertySchema, response: { 200: successResponseSchema(propertyResponseSchema) } } },
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
    { preHandler: authenticate, schema: { params: z.object({ propertyId: z.string().uuid() }), response: { 204: z.null() } } },
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

  // POST /v1/properties/:propertyId/geocode — enqueue async geocoding
  app.post(
    '/v1/properties/:propertyId/geocode',
    { preHandler: authenticate, schema: { params: z.object({ propertyId: z.string().uuid() }) } },
    async (request, reply) => {
      const params = propertyIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid property ID',
          params.error.errors,
        );
      const result = await container.geocodePropertyUseCase.execute({
        propertyId: params.data.propertyId,
        actor: request.authContext!,
      });
      return reply.status(202).send(success(result));
    },
  );

}
