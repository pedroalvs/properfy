import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Country, State, City } from 'country-state-city';
import {
  createServiceRegionSchema,
  updateServiceRegionSchema,
  listServiceRegionsQuerySchema,
  listSuburbsQuerySchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { success, paginated } from '../../../shared/interfaces/response';
import type { CreateServiceRegionUseCase } from '../application/use-cases/create-service-region.use-case';
import type { UpdateServiceRegionUseCase } from '../application/use-cases/update-service-region.use-case';
import type { GetServiceRegionUseCase } from '../application/use-cases/get-service-region.use-case';
import type { ListServiceRegionsUseCase } from '../application/use-cases/list-service-regions.use-case';
import type { ListSuburbsUseCase } from '../application/use-cases/list-suburbs.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface ServiceRegionRouteContainer {
  createServiceRegionUseCase: CreateServiceRegionUseCase;
  updateServiceRegionUseCase: UpdateServiceRegionUseCase;
  getServiceRegionUseCase: GetServiceRegionUseCase;
  listServiceRegionsUseCase: ListServiceRegionsUseCase;
  listSuburbsUseCase: ListSuburbsUseCase;
  suburbRepo: {
    findOrCreate(data: { name: string; city: string; state: string; country: string; postcode?: string | null }): Promise<{ id: string; name: string; city: string; state: string; country: string; postcode: string | null; status: string }>;
  };
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

  // GET /v1/geography/countries — all countries (static data from country-state-city)
  app.get(
    '/v1/geography/countries',
    { preHandler: authenticate },
    async (_request, reply) => {
      const data = Country.getAllCountries().map((c) => ({
        code: c.isoCode,
        name: c.name,
      }));
      return reply.status(200).send(success(data));
    },
  );

  // GET /v1/geography/states — states for a country (static data from country-state-city)
  app.get(
    '/v1/geography/states',
    { preHandler: authenticate },
    async (request, reply) => {
      const query = request.query as Record<string, string>;
      const country = query.country;
      if (!country) {
        throw new ValidationError('country query parameter is required');
      }
      const data = State.getStatesOfCountry(country).map((s) => ({
        code: s.isoCode,
        name: s.name,
      }));
      return reply.status(200).send(success(data));
    },
  );

  // GET /v1/geography/cities — cities for a country + state (static data from country-state-city)
  app.get(
    '/v1/geography/cities',
    { preHandler: authenticate },
    async (request, reply) => {
      const query = request.query as Record<string, string>;
      const country = query.country;
      const state = query.state;
      if (!country || !state) {
        throw new ValidationError('country and state query parameters are required');
      }
      const data = City.getCitiesOfState(country, state).map((c) => ({
        name: c.name,
        latitude: c.latitude ?? null,
        longitude: c.longitude ?? null,
      }));
      return reply.status(200).send(success(data));
    },
  );

  // POST /v1/suburbs/resolve — findOrCreate a suburb from address lookup data
  app.post(
    '/v1/suburbs/resolve',
    { preHandler: authenticate },
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const city = typeof body.city === 'string' ? body.city.trim() : '';
      const state = typeof body.state === 'string' ? body.state.trim() : '';
      const country = typeof body.country === 'string' ? body.country.trim() : '';
      const postcode = typeof body.postcode === 'string' ? body.postcode.trim() : null;

      if (!name || !city || !state || !country) {
        throw new ValidationError('name, city, state, and country are required');
      }

      const suburb = await container.suburbRepo.findOrCreate({ name, city, state, country, postcode });
      return reply.status(200).send(success(suburb));
    },
  );

  // GET /v1/suburbs — list suburbs (with orphanOnly filter)
  app.get(
    '/v1/suburbs',
    { preHandler: authenticate },
    async (request, reply) => {
      const parsed = listSuburbsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }
      const { page, pageSize, sortBy, sortOrder, orphanOnly, ...filters } = parsed.data;
      const result = await container.listSuburbsUseCase.execute({
        filters,
        orphanOnly,
        pagination: { page, pageSize, sortBy, sortOrder },
        actor: request.authContext!,
      });
      return reply.status(200).send(paginated(result.data, result.total, page, pageSize));
    },
  );
}
