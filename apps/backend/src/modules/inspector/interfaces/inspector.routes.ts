import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createInspectorSchema,
  updateInspectorSchema,
  listInspectorsQuerySchema,
  createAvailabilitySlotSchema,
  updateAvailabilitySlotSchema,
  listAvailabilitySlotsQuerySchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { success, paginated } from '../../../shared/interfaces/response';
import type { CreateInspectorUseCase } from '../application/use-cases/create-inspector.use-case';
import type { GetInspectorUseCase } from '../application/use-cases/get-inspector.use-case';
import type { ListInspectorsUseCase } from '../application/use-cases/list-inspectors.use-case';
import type { UpdateInspectorUseCase } from '../application/use-cases/update-inspector.use-case';
import type { CreateAvailabilitySlotUseCase } from '../application/use-cases/create-availability-slot.use-case';
import type { ListAvailabilitySlotsUseCase } from '../application/use-cases/list-availability-slots.use-case';
import type { UpdateAvailabilitySlotUseCase } from '../application/use-cases/update-availability-slot.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface InspectorRouteContainer {
  createInspectorUseCase: CreateInspectorUseCase;
  getInspectorUseCase: GetInspectorUseCase;
  listInspectorsUseCase: ListInspectorsUseCase;
  updateInspectorUseCase: UpdateInspectorUseCase;
  createAvailabilitySlotUseCase: CreateAvailabilitySlotUseCase;
  listAvailabilitySlotsUseCase: ListAvailabilitySlotsUseCase;
  updateAvailabilitySlotUseCase: UpdateAvailabilitySlotUseCase;
  jwtService: JwtService;
}

const inspectorIdParam = z.object({ inspectorId: z.string().uuid() });
const slotIdParam = z.object({
  inspectorId: z.string().uuid(),
  slotId: z.string().uuid(),
});

export async function registerInspectorRoutes(
  app: FastifyInstance,
  container: InspectorRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware((token) =>
    container.jwtService.verify(token),
  );

  // POST /v1/inspectors
  app.post(
    '/v1/inspectors',
    { preHandler: authenticate },
    async (request, reply) => {
      const parsed = createInspectorSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      const result = await container.createInspectorUseCase.execute({
        ...parsed.data,
        paymentSettings: parsed.data.paymentSettings,
        regions: parsed.data.regions,
        serviceTypes: parsed.data.serviceTypes,
        clientEligibility: parsed.data.clientEligibility,
        actor: request.authContext!,
      });
      return reply.status(201).send(success(result));
    },
  );

  // GET /v1/inspectors
  app.get(
    '/v1/inspectors',
    { preHandler: authenticate },
    async (request, reply) => {
      const parsed = listInspectorsQuerySchema.safeParse(request.query);
      if (!parsed.success)
        throw new ValidationError(
          'Invalid query parameters',
          parsed.error.errors,
        );
      const { page, pageSize, sortBy, sortOrder, ...filters } = parsed.data;
      const result = await container.listInspectorsUseCase.execute({
        filters,
        pagination: { page, pageSize, sortBy, sortOrder },
        actor: request.authContext!,
      });
      return reply
        .status(200)
        .send(paginated(result.data, result.total, page, pageSize));
    },
  );

  // GET /v1/inspectors/:inspectorId
  app.get(
    '/v1/inspectors/:inspectorId',
    { preHandler: authenticate },
    async (request, reply) => {
      const params = inspectorIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid inspector ID',
          params.error.errors,
        );
      const result = await container.getInspectorUseCase.execute({
        inspectorId: params.data.inspectorId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // PATCH /v1/inspectors/:inspectorId
  app.patch(
    '/v1/inspectors/:inspectorId',
    { preHandler: authenticate },
    async (request, reply) => {
      const params = inspectorIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid inspector ID',
          params.error.errors,
        );
      const parsed = updateInspectorSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      const result = await container.updateInspectorUseCase.execute({
        inspectorId: params.data.inspectorId,
        data: {
          ...parsed.data,
          paymentSettings: parsed.data.paymentSettings,
          regions: parsed.data.regions,
          serviceTypes: parsed.data.serviceTypes,
          clientEligibility: parsed.data.clientEligibility,
        },
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/inspectors/:inspectorId/availability-slots
  app.post(
    '/v1/inspectors/:inspectorId/availability-slots',
    { preHandler: authenticate },
    async (request, reply) => {
      const params = inspectorIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid inspector ID',
          params.error.errors,
        );
      const parsed = createAvailabilitySlotSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      const result = await container.createAvailabilitySlotUseCase.execute({
        inspectorId: params.data.inspectorId,
        date: new Date(parsed.data.date),
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        regionJson: parsed.data.regionJson,
        capacity: parsed.data.capacity,
        actor: request.authContext!,
      });
      return reply.status(201).send(success(result));
    },
  );

  // GET /v1/inspectors/:inspectorId/availability-slots
  app.get(
    '/v1/inspectors/:inspectorId/availability-slots',
    { preHandler: authenticate },
    async (request, reply) => {
      const params = inspectorIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid inspector ID',
          params.error.errors,
        );
      const parsed = listAvailabilitySlotsQuerySchema.safeParse(
        request.query,
      );
      if (!parsed.success)
        throw new ValidationError(
          'Invalid query parameters',
          parsed.error.errors,
        );
      const { page, pageSize, sortBy, sortOrder, ...filters } = parsed.data;
      const result = await container.listAvailabilitySlotsUseCase.execute({
        inspectorId: params.data.inspectorId,
        filters,
        pagination: { page, pageSize, sortBy, sortOrder },
        actor: request.authContext!,
      });
      return reply
        .status(200)
        .send(paginated(result.data, result.total, page, pageSize));
    },
  );

  // PATCH /v1/inspectors/:inspectorId/availability-slots/:slotId
  app.patch(
    '/v1/inspectors/:inspectorId/availability-slots/:slotId',
    { preHandler: authenticate },
    async (request, reply) => {
      const params = slotIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid parameters',
          params.error.errors,
        );
      const parsed = updateAvailabilitySlotSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      const updateData: Record<string, unknown> = { ...parsed.data };
      if (parsed.data.date) {
        updateData.date = new Date(parsed.data.date);
      }
      const result = await container.updateAvailabilitySlotUseCase.execute({
        inspectorId: params.data.inspectorId,
        slotId: params.data.slotId,
        data: updateData as Parameters<
          typeof container.updateAvailabilitySlotUseCase.execute
        >[0]['data'],
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );
}
