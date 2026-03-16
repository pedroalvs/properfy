import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  inspectorScheduleQuerySchema,
  startInspectionSchema,
  finishInspectionSchema,
  requestAssetUploadSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { IdempotencyKeyMissingError } from '../domain/inspection-execution.errors';
import { success } from '../../../shared/interfaces/response';
import type { GetInspectorScheduleUseCase } from '../application/use-cases/get-inspector-schedule.use-case';
import type { GetAppointmentDetailUseCase } from '../application/use-cases/get-appointment-detail.use-case';
import type { StartInspectionUseCase } from '../application/use-cases/start-inspection.use-case';
import type { FinishInspectionUseCase } from '../application/use-cases/finish-inspection.use-case';
import type { RequestAssetUploadUseCase } from '../application/use-cases/request-asset-upload.use-case';
import type { ConfirmAssetUploadUseCase } from '../application/use-cases/confirm-asset-upload.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface InspectorExecutionRouteContainer {
  getInspectorScheduleUseCase: GetInspectorScheduleUseCase;
  getAppointmentDetailUseCase: GetAppointmentDetailUseCase;
  startInspectionUseCase: StartInspectionUseCase;
  finishInspectionUseCase: FinishInspectionUseCase;
  requestAssetUploadUseCase: RequestAssetUploadUseCase;
  confirmAssetUploadUseCase: ConfirmAssetUploadUseCase;
  jwtService: JwtService;
}

const appointmentIdParam = z.object({ appointmentId: z.string().uuid() });
const assetIdParam = z.object({ appointmentId: z.string().uuid(), assetId: z.string().uuid() });

export async function registerInspectorExecutionRoutes(
  app: FastifyInstance,
  container: InspectorExecutionRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware((token) =>
    container.jwtService.verify(token),
  );

  // GET /v1/inspector/schedule
  app.get(
    '/v1/inspector/schedule',
    { preHandler: authenticate },
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
    { preHandler: authenticate },
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
    { preHandler: authenticate },
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
    { preHandler: authenticate },
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

  // POST /v1/inspector/appointments/:appointmentId/assets
  app.post(
    '/v1/inspector/appointments/:appointmentId/assets',
    { preHandler: authenticate },
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
    { preHandler: authenticate },
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
}
