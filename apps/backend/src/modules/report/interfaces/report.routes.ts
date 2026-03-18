import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  requestReportSchema,
  listReportsQuerySchema,
  reportResponseSchema,
  reportRequestedResponseSchema,
  reportDownloadResponseSchema,
  successResponseSchema,
  paginatedResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { success, paginated } from '../../../shared/interfaces/response';
import type { RequestReportUseCase } from '../application/use-cases/request-report.use-case';
import type { GetReportStatusUseCase } from '../application/use-cases/get-report-status.use-case';
import type { DownloadReportUseCase } from '../application/use-cases/download-report.use-case';
import type { ListReportsUseCase } from '../application/use-cases/list-reports.use-case';
import type { ProcessReportJobUseCase } from '../application/use-cases/process-report-job.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface ReportRouteContainer {
  requestReportUseCase: RequestReportUseCase;
  getReportStatusUseCase: GetReportStatusUseCase;
  downloadReportUseCase: DownloadReportUseCase;
  listReportsUseCase: ListReportsUseCase;
  processReportJobUseCase: ProcessReportJobUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

const reportIdParam = z.object({ reportId: z.string().uuid() });

export async function registerReportRoutes(
  app: FastifyInstance,
  container: ReportRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  // POST /v1/reports
  app.post(
    '/v1/reports',
    { preHandler: authenticate, schema: { body: requestReportSchema, response: { 202: reportRequestedResponseSchema } } },
    async (request, reply) => {
      const parsed = requestReportSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.requestReportUseCase.execute(
        parsed.data,
        request.authContext!,
      );
      return reply.status(202).send({
        data: {
          reportId: result.reportId,
          status: result.status,
          reportType: result.reportType,
          createdAt: result.createdAt,
        },
        message: 'Report generation request accepted',
      });
    },
  );

  // GET /v1/reports
  app.get(
    '/v1/reports',
    { preHandler: authenticate, schema: { querystring: listReportsQuerySchema, response: { 200: paginatedResponseSchema(reportResponseSchema) } } },
    async (request, reply) => {
      const parsed = listReportsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }
      const { page, pageSize } = parsed.data;
      const result = await container.listReportsUseCase.execute(
        parsed.data,
        request.authContext!,
      );
      return reply.status(200).send(paginated(result.data, result.meta.total, page, pageSize));
    },
  );

  // GET /v1/reports/:reportId
  app.get(
    '/v1/reports/:reportId',
    { preHandler: authenticate, schema: { params: z.object({ reportId: z.string().uuid() }), response: { 200: successResponseSchema(reportResponseSchema) } } },
    async (request, reply) => {
      const params = reportIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid report ID', params.error.errors);
      }
      const result = await container.getReportStatusUseCase.execute(
        params.data.reportId,
        request.authContext!,
      );
      return reply.status(200).send(success(result));
    },
  );

  // GET /v1/reports/:reportId/download
  app.get(
    '/v1/reports/:reportId/download',
    { preHandler: authenticate, schema: { params: z.object({ reportId: z.string().uuid() }), response: { 200: successResponseSchema(reportDownloadResponseSchema) } } },
    async (request, reply) => {
      const params = reportIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid report ID', params.error.errors);
      }
      const result = await container.downloadReportUseCase.execute(
        params.data.reportId,
        request.authContext!,
      );
      return reply.status(200).send(success(result));
    },
  );
}
