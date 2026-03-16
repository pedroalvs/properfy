import type { FastifyInstance } from 'fastify';
import { listAuditLogsQuerySchema } from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { paginated } from '../../../shared/interfaces/response';
import type { ListAuditLogsUseCase } from '../application/use-cases/list-audit-logs.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface AuditRouteContainer {
  listAuditLogsUseCase: ListAuditLogsUseCase;
  jwtService: JwtService;
}

export async function registerAuditRoutes(
  app: FastifyInstance,
  container: AuditRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware((token) =>
    container.jwtService.verify(token),
  );

  // GET /v1/audit-logs — paginated 200
  app.get(
    '/v1/audit-logs',
    { preHandler: authenticate },
    async (request, reply) => {
      const parsed = listAuditLogsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }
      const { page, pageSize, sortBy, sortOrder, ...filters } = parsed.data;
      const result = await container.listAuditLogsUseCase.execute({
        filters,
        pagination: { page, pageSize, sortBy, sortOrder },
        actor: request.authContext!,
      });
      return reply.status(200).send(paginated(result.data, result.total, page, pageSize));
    },
  );
}
