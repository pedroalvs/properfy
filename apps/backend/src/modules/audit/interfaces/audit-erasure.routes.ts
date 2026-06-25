import type { FastifyInstance } from 'fastify';
import { dataSubjectErasureRequestInputSchema, paginationSchema } from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { paginated } from '../../../shared/interfaces/response';
import type { PreviewDataSubjectErasureUseCase } from '../application/use-cases/preview-data-subject-erasure.use-case';
import type { ExecuteDataSubjectErasureUseCase } from '../application/use-cases/execute-data-subject-erasure.use-case';
import type { GetDataSubjectErasureRequestUseCase } from '../application/use-cases/get-data-subject-erasure-request.use-case';
import type { ListDataSubjectErasureRequestsUseCase } from '../application/use-cases/list-data-subject-erasure-requests.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

/**
 * Feature 020: AM-only data subject erasure routes. Deliberately isolated
 * from `audit.routes.ts` for security visibility — every endpoint here is a
 * high-privilege LGPD operation.
 */
export interface AuditErasureRouteContainer {
  previewDataSubjectErasureUseCase: PreviewDataSubjectErasureUseCase;
  executeDataSubjectErasureUseCase: ExecuteDataSubjectErasureUseCase;
  getDataSubjectErasureRequestUseCase: GetDataSubjectErasureRequestUseCase;
  listDataSubjectErasureRequestsUseCase: ListDataSubjectErasureRequestsUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

export async function registerAuditErasureRoutes(
  app: FastifyInstance,
  container: AuditErasureRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  // POST /v1/audit-erasure-requests — create + preview
  app.post(
    '/v1/audit-erasure-requests',
    { preHandler: authenticate },
    async (request, reply) => {
      const parsed = dataSubjectErasureRequestInputSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid erasure request input', parsed.error.errors);
      }
      const result = await container.previewDataSubjectErasureUseCase.execute({
        subjectIdentifierType: parsed.data.subjectIdentifierType,
        subjectIdentifierValue: parsed.data.subjectIdentifierValue,
        actor: request.authContext!,
      });
      return reply.status(201).send(result);
    },
  );

  // GET /v1/audit-erasure-requests/:id — fetch single
  app.get(
    '/v1/audit-erasure-requests/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await container.getDataSubjectErasureRequestUseCase.execute({
        requestId: id,
        actor: request.authContext!,
      });
      return reply.status(200).send(result);
    },
  );

  // POST /v1/audit-erasure-requests/:id/confirm — execute the erasure
  app.post(
    '/v1/audit-erasure-requests/:id/confirm',
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await container.executeDataSubjectErasureUseCase.execute({
        requestId: id,
        actor: request.authContext!,
      });
      return reply.status(200).send(result);
    },
  );

  // GET /v1/audit-erasure-requests — paginated list
  app.get(
    '/v1/audit-erasure-requests',
    { preHandler: authenticate },
    async (request, reply) => {
      const parsed = paginationSchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid pagination params', parsed.error.errors);
      }
      const result = await container.listDataSubjectErasureRequestsUseCase.execute({
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        actor: request.authContext!,
      });
      return reply
        .status(200)
        .send(paginated(result.data, result.total, parsed.data.page, parsed.data.pageSize));
    },
  );
}
