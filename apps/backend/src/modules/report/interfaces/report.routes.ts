import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  requestReportSchema,
  listReportsQuerySchema,
  createScheduledReportSchema,
  updateScheduledReportSchema,
  pauseScheduleSchema,
  reassignOwnershipSchema,
  listScheduledReportsQuerySchema,
  listScheduleRunsQuerySchema,
  reportResponseSchema,
  reportRequestedResponseSchema,
  reportDownloadResponseSchema,
  scheduledReportResponseSchema,
  scheduledReportCreatedResponseSchema,
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
import type { CreateScheduledReportUseCase } from '../application/use-cases/create-scheduled-report.use-case';
import type { ListScheduledReportsUseCase } from '../application/use-cases/list-scheduled-reports.use-case';
import type { GetScheduledReportUseCase } from '../application/use-cases/get-scheduled-report.use-case';
import type { UpdateScheduledReportUseCase } from '../application/use-cases/update-scheduled-report.use-case';
import type { PauseScheduledReportUseCase } from '../application/use-cases/pause-scheduled-report.use-case';
import type { ResumeScheduledReportUseCase } from '../application/use-cases/resume-scheduled-report.use-case';
import type { DeleteScheduledReportUseCase } from '../application/use-cases/delete-scheduled-report.use-case';
import type { ReassignScheduleOwnershipUseCase } from '../application/use-cases/reassign-schedule-ownership.use-case';
import type { ListScheduleRunsUseCase } from '../application/use-cases/list-schedule-runs.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface ReportRouteContainer {
  requestReportUseCase: RequestReportUseCase;
  getReportStatusUseCase: GetReportStatusUseCase;
  downloadReportUseCase: DownloadReportUseCase;
  listReportsUseCase: ListReportsUseCase;
  processReportJobUseCase: ProcessReportJobUseCase;
  createScheduledReportUseCase: CreateScheduledReportUseCase;
  listScheduledReportsUseCase: ListScheduledReportsUseCase;
  // Feature 019 additions
  getScheduledReportUseCase: GetScheduledReportUseCase;
  updateScheduledReportUseCase: UpdateScheduledReportUseCase;
  pauseScheduledReportUseCase: PauseScheduledReportUseCase;
  resumeScheduledReportUseCase: ResumeScheduledReportUseCase;
  deleteScheduledReportUseCase: DeleteScheduledReportUseCase;
  reassignScheduleOwnershipUseCase: ReassignScheduleOwnershipUseCase;
  listScheduleRunsUseCase: ListScheduleRunsUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean; settingsJson?: Record<string, unknown> } | null> };
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
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return (tenant?.settingsJson?.clUserPermissions as string[] | undefined) ?? [];
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

  // POST /v1/reports/schedules
  app.post(
    '/v1/reports/schedules',
    { preHandler: authenticate, schema: { body: createScheduledReportSchema, response: { 201: scheduledReportCreatedResponseSchema } } },
    async (request, reply) => {
      const parsed = createScheduledReportSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.createScheduledReportUseCase.execute(
        parsed.data,
        request.authContext!,
      );
      return reply.status(201).send({
        data: {
          id: result.id,
          reportType: result.reportType,
          cronExpression: result.cronExpression,
          deliveryEmail: result.deliveryEmail,
          isActive: result.isActive,
          nextRunAt: result.nextRunAt?.toISOString() ?? null,
          createdAt: result.createdAt.toISOString(),
        },
        message: 'Scheduled report created',
      });
    },
  );

  // GET /v1/reports/schedules
  app.get(
    '/v1/reports/schedules',
    { preHandler: authenticate, schema: { querystring: listScheduledReportsQuerySchema, response: { 200: paginatedResponseSchema(scheduledReportResponseSchema) } } },
    async (request, reply) => {
      const parsed = listScheduledReportsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }
      const { page, pageSize } = parsed.data;
      const result = await container.listScheduledReportsUseCase.execute(
        parsed.data,
        request.authContext!,
      );
      return reply.status(200).send(paginated(result.data, result.meta.total, page, pageSize));
    },
  );

  // Feature 019: GET /v1/reports/schedules/:id (detail)
  app.get(
    '/v1/reports/schedules/:scheduleId',
    { preHandler: authenticate },
    async (request, reply) => {
      const params = z.object({ scheduleId: z.string().uuid() }).safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid schedule id', params.error.errors);
      }
      const result = await container.getScheduledReportUseCase.execute(
        params.data.scheduleId,
        request.authContext!,
      );
      return reply.status(200).send(
        success({
          id: result.schedule.id,
          tenantId: result.schedule.tenantId,
          reportType: result.schedule.reportType,
          filtersJson: result.schedule.filtersJson,
          format: result.schedule.format,
          cronExpression: result.schedule.cronExpression,
          displayName: result.schedule.displayName,
          deliveryMode: result.schedule.deliveryMode,
          recipientUserIds: result.schedule.recipientUserIds,
          skipDeliveryWhenEmpty: result.schedule.skipDeliveryWhenEmpty,
          consecutiveFailureCount: result.schedule.consecutiveFailureCount,
          status: result.schedule.status,
          isActive: result.schedule.isActive,
          lastRunAt: result.schedule.lastRunAt?.toISOString() ?? null,
          nextRunAt: result.schedule.nextRunAt?.toISOString() ?? null,
          lastRunStatus: result.lastRunStatus,
          createdByUserId: result.schedule.createdByUserId,
          createdAt: result.schedule.createdAt.toISOString(),
          updatedAt: result.schedule.updatedAt.toISOString(),
        }),
      );
    },
  );

  // Feature 019: PUT /v1/reports/schedules/:id
  app.put(
    '/v1/reports/schedules/:scheduleId',
    { preHandler: authenticate },
    async (request, reply) => {
      const params = z.object({ scheduleId: z.string().uuid() }).safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid schedule id', params.error.errors);
      }
      const body = updateScheduledReportSchema.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError('Request payload is invalid', body.error.errors);
      }
      const updated = await container.updateScheduledReportUseCase.execute(
        { id: params.data.scheduleId, ...body.data },
        request.authContext!,
      );
      return reply.status(200).send(
        success({
          id: updated.id,
          displayName: updated.displayName,
          deliveryMode: updated.deliveryMode,
          recipientUserIds: updated.recipientUserIds,
          skipDeliveryWhenEmpty: updated.skipDeliveryWhenEmpty,
          cronExpression: updated.cronExpression,
          nextRunAt: updated.nextRunAt?.toISOString() ?? null,
          status: updated.status,
        }),
      );
    },
  );

  // Feature 019: POST /v1/reports/schedules/:id/pause
  app.post(
    '/v1/reports/schedules/:scheduleId/pause',
    { preHandler: authenticate },
    async (request, reply) => {
      const params = z.object({ scheduleId: z.string().uuid() }).safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid schedule id', params.error.errors);
      }
      const body = pauseScheduleSchema.safeParse(request.body ?? {});
      if (!body.success) {
        throw new ValidationError('Request payload is invalid', body.error.errors);
      }
      const updated = await container.pauseScheduledReportUseCase.execute(
        { id: params.data.scheduleId, reason: body.data.reason },
        request.authContext!,
      );
      return reply.status(200).send(success({ id: updated.id, status: updated.status }));
    },
  );

  // Feature 019: POST /v1/reports/schedules/:id/resume
  app.post(
    '/v1/reports/schedules/:scheduleId/resume',
    { preHandler: authenticate },
    async (request, reply) => {
      const params = z.object({ scheduleId: z.string().uuid() }).safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid schedule id', params.error.errors);
      }
      const updated = await container.resumeScheduledReportUseCase.execute(
        params.data.scheduleId,
        request.authContext!,
      );
      return reply.status(200).send(
        success({
          id: updated.id,
          status: updated.status,
          nextRunAt: updated.nextRunAt?.toISOString() ?? null,
        }),
      );
    },
  );

  // Feature 019: DELETE /v1/reports/schedules/:id (soft-delete)
  app.delete(
    '/v1/reports/schedules/:scheduleId',
    { preHandler: authenticate },
    async (request, reply) => {
      const params = z.object({ scheduleId: z.string().uuid() }).safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid schedule id', params.error.errors);
      }
      await container.deleteScheduledReportUseCase.execute(
        params.data.scheduleId,
        request.authContext!,
      );
      return reply.status(204).send();
    },
  );

  // Feature 019: POST /v1/reports/schedules/:id/reassign (AM only)
  app.post(
    '/v1/reports/schedules/:scheduleId/reassign',
    { preHandler: authenticate },
    async (request, reply) => {
      const params = z.object({ scheduleId: z.string().uuid() }).safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid schedule id', params.error.errors);
      }
      const body = reassignOwnershipSchema.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError('Request payload is invalid', body.error.errors);
      }
      const updated = await container.reassignScheduleOwnershipUseCase.execute(
        {
          scheduleId: params.data.scheduleId,
          newOwnerUserId: body.data.newOwnerUserId,
          reason: body.data.reason,
        },
        request.authContext!,
      );
      return reply.status(200).send(
        success({ id: updated.id, createdByUserId: updated.createdByUserId }),
      );
    },
  );

  // Feature 019: GET /v1/reports/schedules/:id/runs
  app.get(
    '/v1/reports/schedules/:scheduleId/runs',
    { preHandler: authenticate },
    async (request, reply) => {
      const params = z.object({ scheduleId: z.string().uuid() }).safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid schedule id', params.error.errors);
      }
      const query = listScheduleRunsQuerySchema.safeParse(request.query);
      if (!query.success) {
        throw new ValidationError('Invalid query parameters', query.error.errors);
      }
      const result = await container.listScheduleRunsUseCase.execute(
        {
          scheduleId: params.data.scheduleId,
          page: query.data.page,
          pageSize: query.data.pageSize,
        },
        request.authContext!,
      );
      const data = result.data.map((run) => ({
        id: run.id,
        scheduleId: run.scheduleId,
        reportId: run.reportId,
        status: run.status,
        scheduledFor: run.scheduledFor.toISOString(),
        startedAt: run.startedAt?.toISOString() ?? null,
        completedAt: run.completedAt?.toISOString() ?? null,
        errorMessage: run.errorMessage,
        recipientCount: run.recipientCount,
        deliveryStatusJson: run.deliveryStatusJson,
        createdAt: run.createdAt.toISOString(),
      }));
      return reply
        .status(200)
        .send(paginated(data, result.meta.total, query.data.page, query.data.pageSize));
    },
  );
}
