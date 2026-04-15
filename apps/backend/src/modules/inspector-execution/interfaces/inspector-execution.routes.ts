import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  inspectorScheduleQuerySchema,
  startInspectionSchema,
  finishInspectionSchema,
  reopenExecutionSchema,
  saveExecutionProgressSchema,
  requestAssetUploadSchema,
  inspectorScheduleResponseSchema,
  inspectionExecutionResponseSchema,
  inspectionAssetResponseSchema,
  inspectorAppointmentDetailResponseSchema,
  successResponseSchema,
  listMarketplaceOffersQuerySchema,
  marketplaceOfferResponseSchema,
  paginatedResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { IdempotencyKeyMissingError } from '../domain/inspection-execution.errors';
import { success, paginated } from '../../../shared/interfaces/response';
import type { GetInspectorScheduleUseCase } from '../application/use-cases/get-inspector-schedule.use-case';
import type { GetAppointmentDetailUseCase } from '../application/use-cases/get-appointment-detail.use-case';
import type { StartInspectionUseCase } from '../application/use-cases/start-inspection.use-case';
import type { FinishInspectionUseCase } from '../application/use-cases/finish-inspection.use-case';
import type { RequestAssetUploadUseCase } from '../application/use-cases/request-asset-upload.use-case';
import type { ConfirmAssetUploadUseCase } from '../application/use-cases/confirm-asset-upload.use-case';
import type { SaveExecutionProgressUseCase } from '../application/use-cases/save-execution-progress.use-case';
import type { ReopenExecutionUseCase } from '../application/use-cases/reopen-execution.use-case';
import type { GetMarketplaceOffersUseCase } from '../../service-group/application/use-cases/get-marketplace-offers.use-case';
import type { DraftInspectorInvoiceUseCase } from '../../billing/application/use-cases/draft-inspector-invoice.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';
import { draftInvoiceSchema } from '@properfy/shared';

export interface InspectorExecutionRouteContainer {
  getInspectorScheduleUseCase: GetInspectorScheduleUseCase;
  getAppointmentDetailUseCase: GetAppointmentDetailUseCase;
  startInspectionUseCase: StartInspectionUseCase;
  finishInspectionUseCase: FinishInspectionUseCase;
  saveExecutionProgressUseCase: SaveExecutionProgressUseCase;
  reopenExecutionUseCase: ReopenExecutionUseCase;
  requestAssetUploadUseCase: RequestAssetUploadUseCase;
  confirmAssetUploadUseCase: ConfirmAssetUploadUseCase;
  getMarketplaceOffersUseCase: GetMarketplaceOffersUseCase;
  draftInspectorInvoiceUseCase: DraftInspectorInvoiceUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

const appointmentIdParam = z.object({ appointmentId: z.string().uuid() });
const assetIdParam = z.object({ appointmentId: z.string().uuid(), assetId: z.string().uuid() });

export async function registerInspectorExecutionRoutes(
  app: FastifyInstance,
  container: InspectorExecutionRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  // GET /v1/inspector/schedule
  app.get(
    '/v1/inspector/schedule',
    { preHandler: authenticate, schema: { querystring: inspectorScheduleQuerySchema, response: { 200: inspectorScheduleResponseSchema } } },
    async (request, reply) => {
      const parsed = inspectorScheduleQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }
      const result = await container.getInspectorScheduleUseCase.execute({
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(result);
    },
  );

  // GET /v1/inspector/appointments/:appointmentId
  app.get(
    '/v1/inspector/appointments/:appointmentId',
    { preHandler: authenticate, schema: { params: z.object({ appointmentId: z.string().uuid() }), response: { 200: successResponseSchema(inspectorAppointmentDetailResponseSchema) } } },
    async (request, reply) => {
      const params = appointmentIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid appointment ID', params.error.errors);
      }
      const result = await container.getAppointmentDetailUseCase.execute({
        appointmentId: params.data.appointmentId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/inspector/appointments/:appointmentId/start
  app.post(
    '/v1/inspector/appointments/:appointmentId/start',
    { preHandler: authenticate, schema: { params: z.object({ appointmentId: z.string().uuid() }), body: startInspectionSchema, response: { 201: successResponseSchema(inspectionExecutionResponseSchema) } } },
    async (request, reply) => {
      const params = appointmentIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid appointment ID', params.error.errors);
      }
      const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
      if (!idempotencyKey) throw new IdempotencyKeyMissingError();

      const parsed = startInspectionSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.startInspectionUseCase.execute({
        appointmentId: params.data.appointmentId,
        ...parsed.data,
        idempotencyKey,
        actor: request.authContext!,
      });
      return reply.status(201).send(success(result));
    },
  );

  // POST /v1/inspector/appointments/:appointmentId/finish
  app.post(
    '/v1/inspector/appointments/:appointmentId/finish',
    { preHandler: authenticate, schema: { params: z.object({ appointmentId: z.string().uuid() }), body: finishInspectionSchema, response: { 200: successResponseSchema(inspectionExecutionResponseSchema) } } },
    async (request, reply) => {
      const params = appointmentIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid appointment ID', params.error.errors);
      }
      const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
      if (!idempotencyKey) throw new IdempotencyKeyMissingError();

      const parsed = finishInspectionSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.finishInspectionUseCase.execute({
        appointmentId: params.data.appointmentId,
        ...parsed.data,
        idempotencyKey,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/inspector/appointments/:appointmentId/execution/reopen
  app.post(
    '/v1/inspector/appointments/:appointmentId/execution/reopen',
    { preHandler: authenticate, schema: { params: z.object({ appointmentId: z.string().uuid() }), body: reopenExecutionSchema } },
    async (request, reply) => {
      const params = appointmentIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid appointment ID', params.error.errors);
      }
      const parsed = reopenExecutionSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.reopenExecutionUseCase.execute({
        appointmentId: params.data.appointmentId,
        reason: parsed.data.reason,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // PATCH /v1/inspector/appointments/:appointmentId/execution
  app.patch(
    '/v1/inspector/appointments/:appointmentId/execution',
    { preHandler: authenticate, schema: { params: z.object({ appointmentId: z.string().uuid() }) } },
    async (request, reply) => {
      const params = appointmentIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid appointment ID', params.error.errors);
      }
      const parsed = saveExecutionProgressSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.saveExecutionProgressUseCase.execute({
        appointmentId: params.data.appointmentId,
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/inspector/appointments/:appointmentId/assets
  app.post(
    '/v1/inspector/appointments/:appointmentId/assets',
    { preHandler: authenticate, schema: { params: z.object({ appointmentId: z.string().uuid() }), body: requestAssetUploadSchema, response: { 201: successResponseSchema(inspectionAssetResponseSchema) } } },
    async (request, reply) => {
      const params = appointmentIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid appointment ID', params.error.errors);
      }
      const parsed = requestAssetUploadSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.requestAssetUploadUseCase.execute({
        appointmentId: params.data.appointmentId,
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(201).send(success(result));
    },
  );

  // PATCH /v1/inspector/appointments/:appointmentId/assets/:assetId/confirm
  app.patch(
    '/v1/inspector/appointments/:appointmentId/assets/:assetId/confirm',
    { preHandler: authenticate, schema: { params: z.object({ appointmentId: z.string().uuid(), assetId: z.string().uuid() }), response: { 200: successResponseSchema(inspectionAssetResponseSchema) } } },
    async (request, reply) => {
      const params = assetIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid parameters', params.error.errors);
      }
      const result = await container.confirmAssetUploadUseCase.execute({
        appointmentId: params.data.appointmentId,
        assetId: params.data.assetId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // GET /v1/inspector/offers — paginated 200
  app.get(
    '/v1/inspector/offers',
    {
      preHandler: authenticate,
      schema: {
        querystring: listMarketplaceOffersQuerySchema,
        response: { 200: paginatedResponseSchema(marketplaceOfferResponseSchema) },
      },
    },
    async (request, reply) => {
      const parsed = listMarketplaceOffersQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }
      const { page, pageSize, sortBy, sortOrder } = parsed.data;
      const result = await container.getMarketplaceOffersUseCase.execute({
        inspectorId: request.authContext!.inspectorId!,
        pagination: { page, pageSize, sortBy, sortOrder },
        actor: request.authContext!,
      });
      return reply.status(200).send(paginated(result.data, result.total, page, pageSize));
    },
  );

  // POST /v1/inspector/invoices/draft — thin delegation to billing (FR-060)
  app.post(
    '/v1/inspector/invoices/draft',
    { preHandler: authenticate },
    async (request, reply) => {
      const auth = request.authContext!;
      if (auth.role !== 'INSP') {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only inspectors can draft invoices' } });
      }
      if (!auth.inspectorId) {
        return reply.status(400).send({ error: { code: 'INSPECTOR_NOT_LINKED', message: 'Inspector not linked to user account' } });
      }

      const parsed = draftInvoiceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid draft invoice payload', details: parsed.error.errors },
        });
      }

      const result = await container.draftInspectorInvoiceUseCase.execute({
        inspectorId: auth.inspectorId,
        periodStart: parsed.data.periodStart,
        periodEnd: parsed.data.periodEnd,
      });

      return reply.status(201).send(success(result));
    },
  );
}
