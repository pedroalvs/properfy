import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  inspectorScheduleMonthQuerySchema,
  inspectorScheduleQuerySchema,
  startInspectionSchema,
  finishInspectionSchema,
  reopenExecutionSchema,
  saveExecutionProgressSchema,
  requestAssetUploadSchema,
  inspectorScheduleResponseSchema,
  inspectorScheduleItemSchema,
  inspectorScheduleMonthResponseSchema,
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
import type { GetAvailablePeriodsUseCase } from '../../billing/application/use-cases/get-available-periods.use-case';
import type { GetInspectorEarningsSummaryUseCase } from '../../billing/application/use-cases/get-inspector-earnings-summary.use-case';
import type { PreviewInvoiceUseCase } from '../../billing/application/use-cases/preview-invoice.use-case';
import type { RequestInvoiceUseCase } from '../../billing/application/use-cases/request-invoice.use-case';
import type { ListAppointmentAssetsUseCase } from '../application/use-cases/list-appointment-assets.use-case';
import type { GetAppointmentAssetDownloadUrlUseCase } from '../application/use-cases/get-appointment-asset-download-url.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';
import {
  availablePeriodsQuerySchema,
  previewInvoiceQuerySchema,
  requestInvoiceSchema,
  availablePeriodsResponseSchema,
  invoicePreviewResponseSchema,
  requestInvoiceResponseSchema,
  inspectorEarningsSummaryQuerySchema,
  inspectorEarningsSummaryResponseSchema,
} from '@properfy/shared';

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
  getAvailablePeriodsUseCase: GetAvailablePeriodsUseCase;
  getInspectorEarningsSummaryUseCase: GetInspectorEarningsSummaryUseCase;
  previewInvoiceUseCase: PreviewInvoiceUseCase;
  requestInvoiceUseCase: RequestInvoiceUseCase;
  listAppointmentAssetsUseCase: ListAppointmentAssetsUseCase;
  getAppointmentAssetDownloadUrlUseCase: GetAppointmentAssetDownloadUrlUseCase;
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

  // GET /v1/inspector/schedule/month
  app.get(
    '/v1/inspector/schedule/month',
    {
      preHandler: authenticate,
      schema: {
        querystring: inspectorScheduleMonthQuerySchema,
        response: {
          200: successResponseSchema(inspectorScheduleMonthResponseSchema),
        },
      },
    },
    async (request, reply) => {
      const parsed = inspectorScheduleMonthQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }
      const result = await container.getInspectorScheduleUseCase.executeMonth({
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // GET /v1/inspector/schedule
  app.get(
    '/v1/inspector/schedule',
    {
      preHandler: authenticate,
      schema: {
        querystring: inspectorScheduleQuerySchema,
        response: {
          200: z.union([
            successResponseSchema(inspectorScheduleResponseSchema),
            paginatedResponseSchema(inspectorScheduleItemSchema),
          ]),
        },
      },
    },
    async (request, reply) => {
      const parsed = inspectorScheduleQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }
      const result = await container.getInspectorScheduleUseCase.execute({
        ...parsed.data,
        actor: request.authContext!,
      });
      // Range mode returns { data, total, page, pageSize }; single-day returns { date, appointments }
      if ('total' in result) {
        return reply.status(200).send(paginated(result.data, result.total, result.page, result.pageSize));
      }
      return reply.status(200).send(success(result));
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

  // GET /v1/appointments/:appointmentId/assets — AM/OP only (evidence view)
  app.get(
    '/v1/appointments/:appointmentId/assets',
    {
      preHandler: authenticate,
      schema: {
        params: appointmentIdParam,
        response: {
          200: z.object({
            data: z.array(
              z.object({
                id: z.string().uuid(),
                storageKey: z.string(),
                mimeType: z.string(),
                sizeBytes: z.number().nullable(),
                kind: z.string(),
                status: z.string(),
                originalFilename: z.string().nullable(),
                createdAt: z.string(),
              }),
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const params = appointmentIdParam.safeParse(request.params);
      if (!params.success) throw new ValidationError('Invalid appointment ID', params.error.errors);
      const result = await container.listAppointmentAssetsUseCase.execute(
        params.data.appointmentId,
        request.authContext!,
      );
      return reply.status(200).send({ data: result });
    },
  );

  // GET /v1/appointments/:appointmentId/assets/:assetId/download — AM/OP only
  app.get(
    '/v1/appointments/:appointmentId/assets/:assetId/download',
    {
      preHandler: authenticate,
      schema: {
        params: assetIdParam,
        response: {
          200: z.object({
            downloadUrl: z.string().url(),
            fileName: z.string().nullable(),
            mimeType: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const params = assetIdParam.safeParse(request.params);
      if (!params.success) throw new ValidationError('Invalid params', params.error.errors);
      const result = await container.getAppointmentAssetDownloadUrlUseCase.execute(
        params.data.appointmentId,
        params.data.assetId,
        request.authContext!,
      );
      return reply.status(200).send(result);
    },
  );

  // ─── Inspector Property Invoice request flow (spec 032) — INSP own-only ───
  // (The legacy free-form /v1/inspector/invoices/draft route was removed in favour of the
  // closed-period request flow below.)

  /**
   * Guards an INSP-only, must-be-linked route: sends the matching error response and returns null
   * when the actor is not a linked inspector, otherwise returns the inspector id. Keeps the three
   * invoice routes below thin and their authorization identical.
   */
  const requireLinkedInspector = (
    auth: { role: string; inspectorId: string | null },
    reply: FastifyReply,
    action: string,
  ): string | null => {
    if (auth.role !== 'INSP') {
      reply.status(403).send({ error: { code: 'FORBIDDEN', message: `Only inspectors can ${action}` } });
      return null;
    }
    if (!auth.inspectorId) {
      reply.status(400).send({ error: { code: 'INSPECTOR_NOT_LINKED', message: 'Inspector not linked to user account' } });
      return null;
    }
    return auth.inspectorId;
  };

  // GET /v1/inspector/invoices/available-periods — selectable closed periods for the inspector cycle
  app.get(
    '/v1/inspector/invoices/available-periods',
    { preHandler: authenticate, schema: { response: { 200: availablePeriodsResponseSchema } } },
    async (request, reply) => {
      const auth = request.authContext!;
      const inspectorId = requireLinkedInspector(auth, reply, 'list invoice periods');
      if (inspectorId === null) return reply;
      const parsed = availablePeriodsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: parsed.error.errors } });
      }
      const result = await container.getAvailablePeriodsUseCase.execute({
        inspectorId,
        count: parsed.data.count,
      });
      return reply.status(200).send(result);
    },
  );

  // GET /v1/inspector/invoices/preview — live preview (count/total/currency) for a chosen period
  app.get(
    '/v1/inspector/invoices/preview',
    { preHandler: authenticate, schema: { response: { 200: invoicePreviewResponseSchema } } },
    async (request, reply) => {
      const auth = request.authContext!;
      const inspectorId = requireLinkedInspector(auth, reply, 'preview invoices');
      if (inspectorId === null) return reply;
      const parsed = previewInvoiceQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: parsed.error.errors } });
      }
      const result = await container.previewInvoiceUseCase.execute({
        inspectorId,
        periodStart: parsed.data.periodStart,
        periodEnd: parsed.data.periodEnd,
      });
      return reply.status(200).send(result);
    },
  );

  // POST /v1/inspector/invoices/request — confirm a request for a chosen closed period
  app.post(
    '/v1/inspector/invoices/request',
    { preHandler: authenticate, schema: { response: { 201: requestInvoiceResponseSchema } } },
    async (request, reply) => {
      const auth = request.authContext!;
      const inspectorId = requireLinkedInspector(auth, reply, 'request invoices');
      if (inspectorId === null) return reply;
      const parsed = requestInvoiceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request invoice payload', details: parsed.error.errors } });
      }
      const result = await container.requestInvoiceUseCase.execute({
        inspectorId,
        periodStart: parsed.data.periodStart,
        periodEnd: parsed.data.periodEnd,
      });
      return reply.status(201).send(result);
    },
  );

  // GET /v1/inspector/earnings/summary — own earnings totals + monthly series for the PWA
  app.get(
    '/v1/inspector/earnings/summary',
    { preHandler: authenticate, schema: { response: { 200: inspectorEarningsSummaryResponseSchema } } },
    async (request, reply) => {
      const auth = request.authContext!;
      const inspectorId = requireLinkedInspector(auth, reply, 'view earnings');
      if (inspectorId === null) return reply;
      const parsed = inspectorEarningsSummaryQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: parsed.error.errors } });
      }
      const result = await container.getInspectorEarningsSummaryUseCase.execute({
        inspectorId,
        months: parsed.data.months,
      });
      return reply.status(200).send(result);
    },
  );
}
