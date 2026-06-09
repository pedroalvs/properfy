import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  appCredentialCreateSchema,
  appCredentialUpdateSchema,
  appCredentialResponseSchema,
  appCredentialListItemSchema,
  successResponseSchema,
  paginatedResponseSchema,
  type AppCredentialResponse,
  type AppCredentialListItem,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../../shared/interfaces/auth-middleware';
import { success, paginated } from '../../../../shared/interfaces/response';
import type { CreateAppCredentialUseCase } from '../../application/use-cases/create-app-credential.use-case';
import type { UpdateAppCredentialUseCase } from '../../application/use-cases/update-app-credential.use-case';
import type { GetAppCredentialUseCase } from '../../application/use-cases/get-app-credential.use-case';
import type { ListAppCredentialsUseCase } from '../../application/use-cases/list-app-credentials.use-case';
import type { JwtService } from '../../../auth/application/services/jwt.service';
import type { AppCredentialEntity } from '../../domain/app-credential.entity';
import type { AppCredentialListRow } from '../../domain/app-credential.repository';

export interface AppCredentialRouteContainer {
  createAppCredentialUseCase: CreateAppCredentialUseCase;
  updateAppCredentialUseCase: UpdateAppCredentialUseCase;
  getAppCredentialUseCase: GetAppCredentialUseCase;
  listAppCredentialsUseCase: ListAppCredentialsUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

const idParam = z.object({ id: z.string().uuid() });

const listQuerySchema = z.object({
  search: z.string().optional(),
  tenantId: z.string().uuid().optional(),
  isActive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'username', 'createdAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

// App credentials are an operational, AM/OP-only registry (CLAUDE.md §6).
const ALLOWED_ROLES = ['AM', 'OP'] as const;

export async function registerAppCredentialRoutes(
  app: FastifyInstance,
  container: AppCredentialRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  const forbidden = (reply: { status: (n: number) => { send: (b: unknown) => unknown } }) =>
    reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

  // POST /v1/app-credentials — create
  app.post(
    '/v1/app-credentials',
    {
      preHandler: authenticate,
      schema: {
        body: appCredentialCreateSchema,
        response: { 201: successResponseSchema(appCredentialResponseSchema) },
      },
    },
    async (request, reply) => {
      const auth = (request as any).authContext;
      if (!ALLOWED_ROLES.includes(auth.role)) return forbidden(reply);

      const parsed = appCredentialCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Request payload is invalid', details: parsed.error.errors } });
      }

      const credential = await container.createAppCredentialUseCase.execute({
        tenantId: parsed.data.tenantId,
        name: parsed.data.name,
        username: parsed.data.username,
        password: parsed.data.password,
        actorId: auth.userId,
        actorTenantId: auth.tenantId ?? null,
      });

      return reply.status(201).send(success(formatCredential(credential)));
    },
  );

  // PATCH /v1/app-credentials/:id — update / deactivate / reactivate
  app.patch(
    '/v1/app-credentials/:id',
    {
      preHandler: authenticate,
      schema: {
        params: idParam,
        body: appCredentialUpdateSchema,
        response: { 200: successResponseSchema(appCredentialResponseSchema) },
      },
    },
    async (request, reply) => {
      const auth = (request as any).authContext;
      if (!ALLOWED_ROLES.includes(auth.role)) return forbidden(reply);

      const paramsParsed = idParam.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid app credential ID', details: paramsParsed.error.errors } });
      }
      const bodyParsed = appCredentialUpdateSchema.safeParse(request.body);
      if (!bodyParsed.success) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Request payload is invalid', details: bodyParsed.error.errors } });
      }

      const updated = await container.updateAppCredentialUseCase.execute({
        id: paramsParsed.data.id,
        actorId: auth.userId,
        actorTenantId: auth.tenantId ?? null,
        data: bodyParsed.data,
      });

      return reply.status(200).send(success(formatCredential(updated)));
    },
  );

  // POST /v1/app-credentials/:id/deactivate — alias for PATCH { isActive: false }
  app.post(
    '/v1/app-credentials/:id/deactivate',
    {
      preHandler: authenticate,
      schema: {
        params: idParam,
        response: { 200: successResponseSchema(appCredentialResponseSchema) },
      },
    },
    async (request, reply) => {
      const auth = (request as any).authContext;
      if (!ALLOWED_ROLES.includes(auth.role)) return forbidden(reply);

      const paramsParsed = idParam.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid app credential ID', details: paramsParsed.error.errors } });
      }

      const updated = await container.updateAppCredentialUseCase.execute({
        id: paramsParsed.data.id,
        actorId: auth.userId,
        actorTenantId: auth.tenantId ?? null,
        data: { isActive: false },
      });

      return reply.status(200).send(success(formatCredential(updated)));
    },
  );

  // GET /v1/app-credentials — list
  app.get(
    '/v1/app-credentials',
    {
      preHandler: authenticate,
      schema: {
        querystring: listQuerySchema,
        response: { 200: paginatedResponseSchema(appCredentialListItemSchema) },
      },
    },
    async (request, reply) => {
      const auth = (request as any).authContext;
      if (!ALLOWED_ROLES.includes(auth.role)) return forbidden(reply);

      const query = request.query as z.infer<typeof listQuerySchema>;
      const result = await container.listAppCredentialsUseCase.execute({
        tenantId: query.tenantId ?? null,
        isActive: query.isActive,
        search: query.search,
        page: query.page,
        pageSize: query.pageSize,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      });

      return reply.status(200).send(
        paginated(result.data.map(formatListItem), result.total, result.page, result.pageSize),
      );
    },
  );

  // GET /v1/app-credentials/:id — detail
  app.get(
    '/v1/app-credentials/:id',
    {
      preHandler: authenticate,
      schema: {
        params: idParam,
        response: { 200: successResponseSchema(appCredentialResponseSchema) },
      },
    },
    async (request, reply) => {
      const auth = (request as any).authContext;
      if (!ALLOWED_ROLES.includes(auth.role)) return forbidden(reply);

      const { id } = request.params as z.infer<typeof idParam>;
      const credential = await container.getAppCredentialUseCase.execute(id);
      return reply.status(200).send(success(formatCredential(credential)));
    },
  );
}

function formatCredential(c: AppCredentialEntity): AppCredentialResponse {
  return {
    id: c.id,
    tenantId: c.tenantId,
    name: c.name,
    username: c.username,
    password: c.password,
    isActive: c.isActive,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function formatListItem(row: AppCredentialListRow): AppCredentialListItem {
  return {
    ...formatCredential(row.credential),
    tenantName: row.tenantName,
  };
}
