import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  statusTransitionSchema,
  listAppointmentsQuerySchema,
  forceManualConfirmationSchema,
  bulkEditAppointmentSchema,
  appointmentResponseSchema,
  forceManualConfirmationResponseSchema,
  bulkResendReminderRequestSchema,
  bulkResendReminderResponseSchema,
  bulkCancelRequestSchema,
  bulkRescheduleRequestSchema,
  bulkStatusTransitionRequestSchema,
  bulkAssignInspectorRequestSchema,
  bulkReopenForRescheduleRequestSchema,
  bulkActionResponseSchema,
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
import type { PerformCrossCheckUseCase } from '../application/use-cases/perform-cross-check.use-case';
import type { ForceManualTenantConfirmationUseCase } from '../application/use-cases/force-manual-confirmation.use-case';
import type { ImportAppointmentsUseCase } from '../application/use-cases/import-appointments.use-case';
import type { GetImportStatusUseCase } from '../application/use-cases/get-import-status.use-case';
import type { DeleteAppointmentUseCase } from '../application/use-cases/delete-appointment.use-case';
import type { BulkEditAppointmentsUseCase } from '../application/use-cases/bulk-edit-appointments.use-case';
import type { BulkResendReminderUseCase } from '../application/use-cases/bulk-resend-reminder.use-case';
import type { BulkCancelAppointmentsUseCase } from '../application/use-cases/bulk-cancel-appointments.use-case';
import type { BulkRescheduleAppointmentsUseCase } from '../application/use-cases/bulk-reschedule-appointments.use-case';
import type { BulkStatusTransitionUseCase } from '../application/use-cases/bulk-status-transition.use-case';
import type { BulkAssignInspectorUseCase } from '../application/use-cases/bulk-assign-inspector.use-case';
import type { BulkReopenForRescheduleUseCase } from '../application/use-cases/bulk-reopen-for-reschedule.use-case';
import type { ReopenForRescheduleUseCase } from '../application/use-cases/reopen-for-reschedule.use-case';
import type { GetPortalLinkUseCase } from '../../tenant-portal/application/use-cases/get-portal-link.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';
import type { IIdempotencyService } from '../../../shared/domain/idempotency.service';
import { GetPortalLinkResponse } from '@properfy/shared';

const importIdParam = z.object({ importId: z.string().uuid() });

export interface AppointmentRouteContainer {
  createAppointmentUseCase: CreateAppointmentUseCase;
  getAppointmentUseCase: GetAppointmentUseCase;
  listAppointmentsUseCase: ListAppointmentsUseCase;
  updateAppointmentUseCase: UpdateAppointmentUseCase;
  executeStatusTransitionUseCase: ExecuteStatusTransitionUseCase;
  performCrossCheckUseCase: PerformCrossCheckUseCase;
  forceManualConfirmationUseCase: ForceManualTenantConfirmationUseCase;
  reopenForRescheduleUseCase: ReopenForRescheduleUseCase;
  importAppointmentsUseCase: ImportAppointmentsUseCase;
  getImportStatusUseCase: GetImportStatusUseCase;
  deleteAppointmentUseCase: DeleteAppointmentUseCase;
  bulkEditAppointmentsUseCase: BulkEditAppointmentsUseCase;
  bulkResendReminderUseCase: BulkResendReminderUseCase;
  bulkCancelAppointmentsUseCase: BulkCancelAppointmentsUseCase;
  bulkRescheduleAppointmentsUseCase: BulkRescheduleAppointmentsUseCase;
  bulkStatusTransitionUseCase: BulkStatusTransitionUseCase;
  bulkAssignInspectorUseCase: BulkAssignInspectorUseCase;
  bulkReopenForRescheduleUseCase: BulkReopenForRescheduleUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean; settingsJson?: Record<string, unknown> } | null> };
  idempotencyService?: IIdempotencyService;
  getPortalLinkUseCase?: GetPortalLinkUseCase;
}

const appointmentIdParam = z.object({ appointmentId: z.string().uuid() });
const statusActionResponseSchema = successResponseSchema(z.object({
  id: z.string().uuid(),
  status: z.string(),
  previousStatus: z.string(),
  reason: z.string().nullable(),
  inspectorId: z.string().uuid().nullable(),
  doneCheckedByUserId: z.string().uuid().nullable(),
  doneCheckedAt: z.unknown().nullable(),
  updatedAt: z.unknown(),
}));

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
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return (tenant?.settingsJson?.clUserPermissions as string[] | undefined) ?? [];
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
      const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
      const result = await container.createAppointmentUseCase.execute({
        ...parsed.data,
        keyRequired: parsed.data.keyRequired ?? false,
        idempotencyKey,
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

  // GET /v1/appointments/:appointmentId/portal-link — 200 (AM/OP: Copy Portal Link)
  app.get(
    '/v1/appointments/:appointmentId/portal-link',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ appointmentId: z.string().uuid() }),
        response: { 200: successResponseSchema(GetPortalLinkResponse) },
      },
    },
    async (request, reply) => {
      const params = appointmentIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid appointment ID', params.error.errors);
      }
      if (!container.getPortalLinkUseCase) {
        throw new ValidationError('Portal link feature not available', []);
      }
      const result = await container.getPortalLinkUseCase.execute({
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
        actorTimezone: parsed.data.actorTimezone,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // DELETE /v1/appointments/:appointmentId — 204 (soft-delete, AM only, DRAFT only)
  app.delete(
    '/v1/appointments/:appointmentId',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ appointmentId: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const params = appointmentIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid appointment ID', params.error.errors);
      }
      await container.deleteAppointmentUseCase.execute({
        appointmentId: params.data.appointmentId,
        actor: request.authContext!,
      });
      return reply.status(204).send();
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
        response: { 200: statusActionResponseSchema },
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

  // POST /v1/appointments/:appointmentId/cross-check-done — 200
  app.post(
    '/v1/appointments/:appointmentId/cross-check-done',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ appointmentId: z.string().uuid() }),
        body: z.object({}).optional(),
        response: { 200: statusActionResponseSchema },
      },
    },
    async (request, reply) => {
      const params = appointmentIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid appointment ID', params.error.errors);
      }

      const result = await container.performCrossCheckUseCase.execute({
        appointmentId: params.data.appointmentId,
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
        response: { 200: successResponseSchema(forceManualConfirmationResponseSchema) },
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

  // POST /v1/appointments/bulk-resend-reminder — 200 (023 §FR-241..245)
  // AM/OP only. Per-item idempotency keyed by `(appointmentId, dayInActorTz)`.
  // Per-item statuses: SENT | NO_PRIMARY_CONTACT | IDEMPOTENT_REPLAY | ERROR.
  app.post(
    '/v1/appointments/bulk-resend-reminder',
    {
      preHandler: authenticate,
      schema: {
        body: bulkResendReminderRequestSchema,
        // Review fix — Issue 2: wrap in `successResponseSchema` so the
        // response carries the canonical `{ data: { results: [...] } }`
        // envelope matching every other route. The frontend
        // `useCreateMutation` reads `response.data.results`; pre-fix the
        // bare `{ results }` made it `undefined` and threw downstream.
        response: { 200: successResponseSchema(bulkResendReminderResponseSchema) },
      },
    },
    async (request, reply) => {
      const auth = request.authContext!;
      if (auth.role !== 'AM' && auth.role !== 'OP') {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'AM or OP role required' } });
      }
      const parsed = bulkResendReminderRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.bulkResendReminderUseCase.execute({
        appointmentIds: parsed.data.appointmentIds,
        actor: auth,
        actorTimezone: parsed.data.actorTimezone,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/appointments/bulk-cancel — 200 (025 §FR-411)
  // AM / OP / CL_ADMIN / CL_USER (with cancel_appointments flag).
  // Delegates per-item to ExecuteStatusTransitionUseCase with CANCELLED.
  app.post(
    '/v1/appointments/bulk-cancel',
    {
      preHandler: authenticate,
      schema: {
        body: bulkCancelRequestSchema,
        response: { 200: successResponseSchema(bulkActionResponseSchema) },
      },
    },
    async (request, reply) => {
      const auth = request.authContext!;
      if (auth.role === 'INSP') {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Inspectors cannot bulk cancel' } });
      }
      const parsed = bulkCancelRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.bulkCancelAppointmentsUseCase.execute({
        appointmentIds: parsed.data.appointmentIds,
        reason: parsed.data.reason,
        actor: auth,
        actorTimezone: parsed.data.actorTimezone,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/appointments/bulk-reschedule — 200 (025 §FR-421)
  // AM / OP / CL_ADMIN / CL_USER (with reschedule_appointments flag).
  // Delegates per-item to UpdateAppointmentUseCase with scheduledDate/timeSlot.
  app.post(
    '/v1/appointments/bulk-reschedule',
    {
      preHandler: authenticate,
      schema: {
        body: bulkRescheduleRequestSchema,
        response: { 200: successResponseSchema(bulkActionResponseSchema) },
      },
    },
    async (request, reply) => {
      const auth = request.authContext!;
      if (auth.role === 'INSP') {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Inspectors cannot bulk reschedule' } });
      }
      const parsed = bulkRescheduleRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.bulkRescheduleAppointmentsUseCase.execute({
        appointmentIds: parsed.data.appointmentIds,
        newDate: parsed.data.newDate,
        ...(parsed.data.newTimeSlotStart && parsed.data.newTimeSlotEnd
          ? { newTimeSlotStart: parsed.data.newTimeSlotStart, newTimeSlotEnd: parsed.data.newTimeSlotEnd }
          : {}),
        actor: auth,
        actorTimezone: parsed.data.actorTimezone,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/appointments/bulk-status-transition — 200 (025 §FR-431)
  // AM / OP only. State machine validates each transition; reason
  // requirements are enforced by the underlying ExecuteStatusTransitionUseCase.
  app.post(
    '/v1/appointments/bulk-status-transition',
    {
      preHandler: authenticate,
      schema: {
        body: bulkStatusTransitionRequestSchema,
        response: { 200: successResponseSchema(bulkActionResponseSchema) },
      },
    },
    async (request, reply) => {
      const auth = request.authContext!;
      if (auth.role !== 'AM' && auth.role !== 'OP') {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'AM or OP role required' } });
      }
      const parsed = bulkStatusTransitionRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.bulkStatusTransitionUseCase.execute({
        appointmentIds: parsed.data.appointmentIds,
        targetStatus: parsed.data.targetStatus,
        reason: parsed.data.reason,
        actor: auth,
        actorTimezone: parsed.data.actorTimezone,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/appointments/bulk-assign-inspector — 200 (025 §FR-441)
  // AM / OP only. Per-row eligibility checks handled by BulkEditAppointmentsUseCase.
  app.post(
    '/v1/appointments/bulk-assign-inspector',
    {
      preHandler: authenticate,
      schema: {
        body: bulkAssignInspectorRequestSchema,
        response: { 200: successResponseSchema(bulkActionResponseSchema) },
      },
    },
    async (request, reply) => {
      const auth = request.authContext!;
      if (auth.role !== 'AM' && auth.role !== 'OP') {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'AM or OP role required' } });
      }
      const parsed = bulkAssignInspectorRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.bulkAssignInspectorUseCase.execute({
        appointmentIds: parsed.data.appointmentIds,
        inspectorId: parsed.data.inspectorId,
        actor: auth,
        actorTimezone: parsed.data.actorTimezone,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/appointments/bulk-reopen-for-reschedule — 200 (026 §FR-540)
  // Same-group only (cross-group is GAP-501 future). Per-item delegates
  // to ReopenForRescheduleUseCase (which also revokes portal tokens since
  // 026 §FR-543). Mixed selections → INVALID_TRANSITION for every item.
  app.post(
    '/v1/appointments/bulk-reopen-for-reschedule',
    {
      preHandler: authenticate,
      schema: {
        body: bulkReopenForRescheduleRequestSchema,
        response: { 200: successResponseSchema(bulkActionResponseSchema) },
      },
    },
    async (request, reply) => {
      const auth = request.authContext!;
      // Matriz 2.2 — AM / OP / CL_ADMIN. CL_USER not allowed even with
      // reschedule_appointments flag (single-item path remains via PATCH).
      if (auth.role !== 'AM' && auth.role !== 'OP' && auth.role !== 'CL_ADMIN') {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'AM, OP, or CL_ADMIN role required' } });
      }
      const parsed = bulkReopenForRescheduleRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.bulkReopenForRescheduleUseCase.execute({
        appointmentIds: parsed.data.appointmentIds,
        newDate: parsed.data.newDate,
        newTimeSlotStart: parsed.data.newTimeSlotStart,
        newTimeSlotEnd: parsed.data.newTimeSlotEnd,
        ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
        actor: auth,
        ...(parsed.data.actorTimezone ? { actorTimezone: parsed.data.actorTimezone } : {}),
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

  // POST /v1/appointments/bulk-edit (FR-066..FR-069a)
  app.post(
    '/v1/appointments/bulk-edit',
    { preHandler: authenticate },
    async (request, reply) => {
      const auth = request.authContext!;
      const parsed = bulkEditAppointmentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid bulk edit payload', details: parsed.error.errors },
        });
      }

      const result = await container.bulkEditAppointmentsUseCase.execute({
        ids: parsed.data.ids,
        changes: parsed.data.changes,
        options: parsed.data.options,
        actorTimezone: parsed.data.actorTimezone,
        actor: auth,
        requestId: (request as any).requestId,
      });

      return reply.status(200).send(success(result));
    },
  );
}
