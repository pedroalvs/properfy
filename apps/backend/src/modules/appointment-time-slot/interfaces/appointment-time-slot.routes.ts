import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createAppointmentTimeSlotSchema,
  updateAppointmentTimeSlotSchema,
  listAppointmentTimeSlotsQuerySchema,
  listEffectiveTimeSlotsQuerySchema,
  appointmentTimeSlotResponseSchema,
  effectiveTimeSlotSchema,
  successResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ForbiddenError, ValidationError } from '../../../shared/domain/errors';
import { success } from '../../../shared/interfaces/response';
import type { CreateAppointmentTimeSlotUseCase } from '../application/use-cases/create-appointment-time-slot.use-case';
import type { UpdateAppointmentTimeSlotUseCase } from '../application/use-cases/update-appointment-time-slot.use-case';
import type { ListAppointmentTimeSlotsUseCase } from '../application/use-cases/list-appointment-time-slots.use-case';
import type { ListEffectiveTimeSlotsUseCase } from '../application/use-cases/list-effective-time-slots.use-case';
import type { DeleteAppointmentTimeSlotUseCase } from '../application/use-cases/delete-appointment-time-slot.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface AppointmentTimeSlotRouteContainer {
  createAppointmentTimeSlotUseCase: CreateAppointmentTimeSlotUseCase;
  updateAppointmentTimeSlotUseCase: UpdateAppointmentTimeSlotUseCase;
  listAppointmentTimeSlotsUseCase: ListAppointmentTimeSlotsUseCase;
  listEffectiveTimeSlotsUseCase: ListEffectiveTimeSlotsUseCase;
  deleteAppointmentTimeSlotUseCase: DeleteAppointmentTimeSlotUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

const timeSlotIdParam = z.object({ id: z.string().uuid() });

export async function registerAppointmentTimeSlotRoutes(
  app: FastifyInstance,
  container: AppointmentTimeSlotRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  // GET /v1/time-slots
  app.get(
    '/v1/time-slots',
    {
      preHandler: authenticate,
      schema: {
        querystring: listAppointmentTimeSlotsQuerySchema,
        response: { 200: successResponseSchema(z.array(appointmentTimeSlotResponseSchema)) },
      },
    },
    async (request, reply) => {
      const result = await container.listAppointmentTimeSlotsUseCase.execute({
        ...(request.query as z.infer<typeof listAppointmentTimeSlotsQuerySchema>),
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // GET /v1/time-slots/effective
  app.get(
    '/v1/time-slots/effective',
    {
      preHandler: authenticate,
      schema: {
        querystring: listEffectiveTimeSlotsQuerySchema,
        response: { 200: successResponseSchema(z.array(effectiveTimeSlotSchema)) },
      },
    },
    async (request, reply) => {
      const parsed = listEffectiveTimeSlotsQuerySchema.safeParse(request.query);
      if (!parsed.success)
        throw new ValidationError('Invalid query parameters', parsed.error.errors);

      const result = await container.listEffectiveTimeSlotsUseCase.execute({
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/time-slots
  app.post(
    '/v1/time-slots',
    {
      preHandler: authenticate,
      schema: {
        body: createAppointmentTimeSlotSchema,
        response: { 201: successResponseSchema(appointmentTimeSlotResponseSchema) },
      },
    },
    async (request, reply) => {
      const actor = request.authContext!;
      if (!['AM', 'OP'].includes(actor.role)) {
        throw new ForbiddenError('FORBIDDEN', 'Only AM and OP can manage time slot configuration');
      }

      const parsed = createAppointmentTimeSlotSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError('Request payload is invalid', parsed.error.errors);

      const result = await container.createAppointmentTimeSlotUseCase.execute({
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(201).send(success(result));
    },
  );

  // PATCH /v1/time-slots/:id
  app.patch(
    '/v1/time-slots/:id',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: updateAppointmentTimeSlotSchema,
        response: { 200: successResponseSchema(appointmentTimeSlotResponseSchema) },
      },
    },
    async (request, reply) => {
      const actor = request.authContext!;
      if (!['AM', 'OP'].includes(actor.role)) {
        throw new ForbiddenError('FORBIDDEN', 'Only AM and OP can manage time slot configuration');
      }

      const params = timeSlotIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError('Invalid time slot ID', params.error.errors);

      const parsed = updateAppointmentTimeSlotSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError('Request payload is invalid', parsed.error.errors);

      const result = await container.updateAppointmentTimeSlotUseCase.execute({
        timeSlotId: params.data.id,
        data: parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // DELETE /v1/time-slots/:id
  app.delete(
    '/v1/time-slots/:id',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const actor = request.authContext!;
      if (!['AM', 'OP'].includes(actor.role)) {
        throw new ForbiddenError('FORBIDDEN', 'Only AM and OP can manage time slot configuration');
      }

      const params = timeSlotIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError('Invalid time slot ID', params.error.errors);

      await container.deleteAppointmentTimeSlotUseCase.execute({
        timeSlotId: params.data.id,
        actor: request.authContext!,
      });
      return reply.status(204).send();
    },
  );
}
