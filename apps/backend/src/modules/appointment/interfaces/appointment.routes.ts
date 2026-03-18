import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  statusTransitionSchema,
  listAppointmentsQuerySchema,
  forceManualConfirmationSchema,
  appointmentResponseSchema,
  successResponseSchema,
  paginatedResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { success, paginated } from '../../../shared/interfaces/response';
import type { CreateAppointmentUseCase } from '../application/use-cases/create-appointment.use-case';
import type { GetAppointmentUseCase } from '../application/use-cases/get-appointment.use-case';
import type { ListAppointmentsUseCase } from '../application/use-cases/list-appointments.use-case';
import type { UpdateAppointmentUseCase } from '../application/use-cases/update-appointment.use-case';
import type { ExecuteStatusTransitionUseCase } from '../application/use-cases/execute-status-transition.use-case';
import type { ForceManualTenantConfirmationUseCase } from '../application/use-cases/force-manual-confirmation.use-case';
import type { ImportAppointmentsUseCase } from '../application/use-cases/import-appointments.use-case';
import type { GetImportStatusUseCase } from '../application/use-cases/get-import-status.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

const importIdParam = z.object({ importId: z.string().uuid() });

export interface AppointmentRouteContainer {
  createAppointmentUseCase: CreateAppointmentUseCase;
  getAppointmentUseCase: GetAppointmentUseCase;
  listAppointmentsUseCase: ListAppointmentsUseCase;
  updateAppointmentUseCase: UpdateAppointmentUseCase;
  executeStatusTransitionUseCase: ExecuteStatusTransitionUseCase;
  forceManualConfirmationUseCase: ForceManualTenantConfirmationUseCase;
  importAppointmentsUseCase: ImportAppointmentsUseCase;
  getImportStatusUseCase: GetImportStatusUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

const appointmentIdParam = z.object({ appointmentId: z.string().uuid() });

export async function registerAppointmentRoutes(
  app: FastifyInstance,
  container: AppointmentRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  // POST /v1/appointments — 201
  app.post(
    '/v1/appointments',
    {
      preHandler: authenticate,
      schema: {
        body: createAppointmentSchema,
        response: { 201: successResponseSchema(appointmentResponseSchema) },
      },
    },
    async (request, reply) => {
      const parsed = createAppointmentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.createAppointmentUseCase.execute({
        ...parsed.data,
        keyRequired: parsed.data.keyRequired ?? false,
        actor: request.authContext!,
      });
      return reply.status(201).send(success(result));
    },
  );

  // GET /v1/appointments — paginated 200
  app.get(
    '/v1/appointments',
    {
      preHandler: authenticate,
      schema: {
        querystring: listAppointmentsQuerySchema,
        response: { 200: paginatedResponseSchema(appointmentResponseSchema) },
      },
    },
    async (request, reply) => {
      const parsed = listAppointmentsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }
      const { page, pageSize, sortBy, sortOrder, ...filters } = parsed.data;
      const result = await container.listAppointmentsUseCase.execute({
        filters,
        pagination: { page, pageSize, sortBy, sortOrder },
        actor: request.authContext!,
      });
      return reply.status(200).send(paginated(result.data, result.total, page, pageSize));
    },
  );

  // GET /v1/appointments/:appointmentId — 200
  app.get(
    '/v1/appointments/:appointmentId',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ appointmentId: z.string().uuid() }),
        response: { 200: successResponseSchema(appointmentResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = appointmentIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid appointment ID', params.error.errors);
      }
      const result = await container.getAppointmentUseCase.execute({
        appointmentId: params.data.appointmentId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // PATCH /v1/appointments/:appointmentId — 200
  app.patch(
    '/v1/appointments/:appointmentId',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ appointmentId: z.string().uuid() }),
        body: updateAppointmentSchema,
        response: { 200: successResponseSchema(appointmentResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = appointmentIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid appointment ID', params.error.errors);
      }
      const parsed = updateAppointmentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.updateAppointmentUseCase.execute({
        appointmentId: params.data.appointmentId,
        data: parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/appointments/:appointmentId/status-transitions — 200
  app.post(
    '/v1/appointments/:appointmentId/status-transitions',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ appointmentId: z.string().uuid() }),
        body: statusTransitionSchema,
        response: { 200: successResponseSchema(appointmentResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = appointmentIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid appointment ID', params.error.errors);
      }
      const parsed = statusTransitionSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
      const result = await container.executeStatusTransitionUseCase.execute({
        appointmentId: params.data.appointmentId,
        ...parsed.data,
        idempotencyKey,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/appointments/:appointmentId/force-confirmation — 200
  app.post(
    '/v1/appointments/:appointmentId/force-confirmation',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ appointmentId: z.string().uuid() }),
        body: forceManualConfirmationSchema,
        response: { 200: successResponseSchema(appointmentResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = appointmentIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid appointment ID', params.error.errors);
      }
      const parsed = forceManualConfirmationSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.forceManualConfirmationUseCase.execute({
        appointmentId: params.data.appointmentId,
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/appointments/import — 202 (multipart file upload)
  app.post(
    '/v1/appointments/import',
    {
      preHandler: authenticate,
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
      if (!idempotencyKey) {
        throw new ValidationError('Idempotency-Key header is required for import');
      }

      const data = await request.file();
      if (!data) {
        throw new ValidationError('File upload is required');
      }

      const fileBuffer = await data.toBuffer();
      const result = await container.importAppointmentsUseCase.execute({
        fileBuffer,
        filename: data.filename,
        idempotencyKey,
        actor: request.authContext!,
      });
      return reply.status(202).send(success(result));
    },
  );

  // GET /v1/appointments/import/:importId — 200
  app.get(
    '/v1/appointments/import/:importId',
    {
      preHandler: authenticate,
      schema: {
        params: importIdParam,
      },
    },
    async (request, reply) => {
      const params = importIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid import ID', params.error.errors);
      }
      const result = await container.getImportStatusUseCase.execute({
        importId: params.data.importId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );
}
