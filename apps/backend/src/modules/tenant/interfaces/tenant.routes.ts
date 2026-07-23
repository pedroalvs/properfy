import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  activateSchema,
  createTenantSchema,
  updateTenantSchema,
  deactivateSchema,
  createBranchSchema,
  updateBranchSchema,
  listTenantsQuerySchema,
  listBranchesQuerySchema,
  tenantResponseSchema,
  branchResponseSchema,
  successResponseSchema,
  paginatedResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { success, paginated } from '../../../shared/interfaces/response';
import type { CreateTenantUseCase } from '../application/use-cases/create-tenant.use-case';
import type { GetTenantUseCase } from '../application/use-cases/get-tenant.use-case';
import type { ListTenantsUseCase } from '../application/use-cases/list-tenants.use-case';
import type { UpdateTenantUseCase } from '../application/use-cases/update-tenant.use-case';
import type { ActivateTenantUseCase } from '../application/use-cases/activate-tenant.use-case';
import type { DeactivateTenantUseCase } from '../application/use-cases/deactivate-tenant.use-case';
import type { CreateBranchUseCase } from '../application/use-cases/create-branch.use-case';
import type { GetBranchUseCase } from '../application/use-cases/get-branch.use-case';
import type { ListBranchesUseCase } from '../application/use-cases/list-branches.use-case';
import type { UpdateBranchUseCase } from '../application/use-cases/update-branch.use-case';
import type { DeactivateBranchUseCase } from '../application/use-cases/deactivate-branch.use-case';
import type { ActivateBranchUseCase } from '../application/use-cases/activate-branch.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface TenantRouteContainer {
  createTenantUseCase: CreateTenantUseCase;
  getTenantUseCase: GetTenantUseCase;
  listTenantsUseCase: ListTenantsUseCase;
  updateTenantUseCase: UpdateTenantUseCase;
  activateTenantUseCase: ActivateTenantUseCase;
  deactivateTenantUseCase: DeactivateTenantUseCase;
  createBranchUseCase: CreateBranchUseCase;
  getBranchUseCase: GetBranchUseCase;
  listBranchesUseCase: ListBranchesUseCase;
  updateBranchUseCase: UpdateBranchUseCase;
  deactivateBranchUseCase: DeactivateBranchUseCase;
  activateBranchUseCase: ActivateBranchUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

const tenantIdParam = z.object({ tenantId: z.string().uuid() });
const branchIdParam = z.object({
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
});

export async function registerTenantRoutes(
  app: FastifyInstance,
  container: TenantRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  // POST /v1/tenants
  app.post(
    '/v1/tenants',
    {
      preHandler: authenticate,
      schema: {
        body: createTenantSchema,
        response: { 201: successResponseSchema(tenantResponseSchema) },
      },
    },
    async (request, reply) => {
      const parsed = createTenantSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      const result = await container.createTenantUseCase.execute({
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(201).send(success(result));
    },
  );

  // GET /v1/tenants
  app.get(
    '/v1/tenants',
    {
      preHandler: authenticate,
      schema: {
        querystring: listTenantsQuerySchema,
        response: { 200: paginatedResponseSchema(tenantResponseSchema) },
      },
    },
    async (request, reply) => {
      const parsed = listTenantsQuerySchema.safeParse(request.query);
      if (!parsed.success)
        throw new ValidationError(
          'Invalid query parameters',
          parsed.error.errors,
        );
      const { page, pageSize, sortBy, sortOrder, ...filters } = parsed.data;
      const result = await container.listTenantsUseCase.execute({
        filters,
        pagination: { page, pageSize, sortBy, sortOrder },
        actor: request.authContext!,
      });
      return reply
        .status(200)
        .send(paginated(result.data, result.total, page, pageSize));
    },
  );

  // GET /v1/tenants/:tenantId
  app.get(
    '/v1/tenants/:tenantId',
    {
      preHandler: authenticate,
      schema: {
        params: tenantIdParam,
        response: { 200: successResponseSchema(tenantResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = tenantIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid tenant ID',
          params.error.errors,
        );
      const result = await container.getTenantUseCase.execute({
        tenantId: params.data.tenantId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // PATCH /v1/tenants/:tenantId
  app.patch(
    '/v1/tenants/:tenantId',
    {
      preHandler: authenticate,
      schema: {
        params: tenantIdParam,
        body: updateTenantSchema,
        response: { 200: successResponseSchema(tenantResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = tenantIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid tenant ID',
          params.error.errors,
        );
      const parsed = updateTenantSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      const result = await container.updateTenantUseCase.execute({
        tenantId: params.data.tenantId,
        data: parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/tenants/:tenantId/deactivate
  app.post(
    '/v1/tenants/:tenantId/deactivate',
    {
      preHandler: authenticate,
      schema: {
        params: tenantIdParam,
        body: deactivateSchema,
      },
    },
    async (request, reply) => {
      const params = tenantIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid tenant ID',
          params.error.errors,
        );
      const parsed = deactivateSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      const result = await container.deactivateTenantUseCase.execute({
        tenantId: params.data.tenantId,
        reason: parsed.data.reason,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/tenants/:tenantId/activate
  app.post(
    '/v1/tenants/:tenantId/activate',
    {
      preHandler: authenticate,
      schema: {
        params: tenantIdParam,
        body: activateSchema,
      },
    },
    async (request, reply) => {
      const params = tenantIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid tenant ID',
          params.error.errors,
        );
      const parsed = activateSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      const result = await container.activateTenantUseCase.execute({
        tenantId: params.data.tenantId,
        reason: parsed.data.reason,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/tenants/:tenantId/branches
  app.post(
    '/v1/tenants/:tenantId/branches',
    {
      preHandler: authenticate,
      schema: {
        params: tenantIdParam,
        body: createBranchSchema,
        response: { 201: successResponseSchema(branchResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = tenantIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid tenant ID',
          params.error.errors,
        );
      const parsed = createBranchSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      const result = await container.createBranchUseCase.execute({
        tenantId: params.data.tenantId,
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(201).send(success(result));
    },
  );

  // GET /v1/branches — flat route; tenantId from JWT (CL roles) or query param (AM/OP)
  app.get(
    '/v1/branches',
    {
      preHandler: authenticate,
      schema: {
        querystring: listBranchesQuerySchema.extend({ tenantId: z.string().uuid().optional() }),
        response: { 200: paginatedResponseSchema(branchResponseSchema) },
      },
    },
    async (request, reply) => {
      const parsed = listBranchesQuerySchema.extend({ tenantId: z.string().uuid().optional() }).safeParse(request.query);
      if (!parsed.success)
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      const { page, pageSize, sortBy, sortOrder, tenantId: queryTenantId, ...filters } = parsed.data;
      const actor = request.authContext!;
      // AM and OP are both cross-tenant per DEC-003; CL roles are pinned to JWT tenantId
      // and ignore any incoming `?tenantId=` to prevent cross-tenant leakage.
      const resolvedTenantId = (actor.role === 'AM' || actor.role === 'OP')
        ? queryTenantId
        : actor.tenantId ?? undefined;
      // AM/OP without selected tenantId: return empty list (no tenant context to scope by).
      if (!resolvedTenantId)
        return reply.status(200).send(paginated([], 0, page, pageSize));
      const result = await container.listBranchesUseCase.execute({
        tenantId: resolvedTenantId,
        filters,
        pagination: { page, pageSize, sortBy, sortOrder },
        actor,
      });
      return reply.status(200).send(paginated(result.data, result.total, page, pageSize));
    },
  );

  // GET /v1/tenants/:tenantId/branches
  app.get(
    '/v1/tenants/:tenantId/branches',
    {
      preHandler: authenticate,
      schema: {
        params: tenantIdParam,
        querystring: listBranchesQuerySchema,
        response: { 200: paginatedResponseSchema(branchResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = tenantIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid tenant ID',
          params.error.errors,
        );
      const parsed = listBranchesQuerySchema.safeParse(request.query);
      if (!parsed.success)
        throw new ValidationError(
          'Invalid query parameters',
          parsed.error.errors,
        );
      const { page, pageSize, sortBy, sortOrder, ...filters } = parsed.data;
      const result = await container.listBranchesUseCase.execute({
        tenantId: params.data.tenantId,
        filters,
        pagination: { page, pageSize, sortBy, sortOrder },
        actor: request.authContext!,
      });
      return reply
        .status(200)
        .send(paginated(result.data, result.total, page, pageSize));
    },
  );

  // GET /v1/tenants/:tenantId/branches/:branchId
  app.get(
    '/v1/tenants/:tenantId/branches/:branchId',
    {
      preHandler: authenticate,
      schema: {
        params: branchIdParam,
        response: { 200: successResponseSchema(branchResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = branchIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid parameters',
          params.error.errors,
        );
      const result = await container.getBranchUseCase.execute({
        tenantId: params.data.tenantId,
        branchId: params.data.branchId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // PATCH /v1/tenants/:tenantId/branches/:branchId
  app.patch(
    '/v1/tenants/:tenantId/branches/:branchId',
    {
      preHandler: authenticate,
      schema: {
        params: branchIdParam,
        body: updateBranchSchema,
        response: { 200: successResponseSchema(branchResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = branchIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid parameters',
          params.error.errors,
        );
      const parsed = updateBranchSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      const result = await container.updateBranchUseCase.execute({
        tenantId: params.data.tenantId,
        branchId: params.data.branchId,
        data: parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/tenants/:tenantId/branches/:branchId/deactivate
  app.post(
    '/v1/tenants/:tenantId/branches/:branchId/deactivate',
    {
      preHandler: authenticate,
      schema: {
        params: branchIdParam,
        body: deactivateSchema,
      },
    },
    async (request, reply) => {
      const params = branchIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid parameters',
          params.error.errors,
        );
      const parsed = deactivateSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      const result = await container.deactivateBranchUseCase.execute({
        tenantId: params.data.tenantId,
        branchId: params.data.branchId,
        reason: parsed.data.reason,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/tenants/:tenantId/branches/:branchId/activate
  app.post(
    '/v1/tenants/:tenantId/branches/:branchId/activate',
    {
      preHandler: authenticate,
      schema: {
        params: branchIdParam,
      },
    },
    async (request, reply) => {
      const params = branchIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid parameters',
          params.error.errors,
        );
      const result = await container.activateBranchUseCase.execute({
        tenantId: params.data.tenantId,
        branchId: params.data.branchId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

}
