import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  FY_AGENT_SCOPE,
  fyAgencySchema,
  fyAppointmentDetailSchema,
  fyAppointmentsByPhoneSchema,
  fyAvailableDatesQuerySchema,
  fyAvailableDatesSchema,
  fyContactUpdateSchema,
  fyContactUpdatedSchema,
  fyNoteCreateSchema,
  fyNoteCreatedSchema,
  fyPhoneQuerySchema,
  fyResendNoticeSchema,
  successResponseSchema,
} from '@properfy/shared';

import { API_KEY_HEADER } from '../../../shared/interfaces/api-key-auth-middleware';
import { requireScope } from '../../../shared/interfaces/require-scope';
import { success } from '../../../shared/interfaces/response';
import type { FindFyAppointmentsByPhoneUseCase } from '../application/use-cases/find-fy-appointments-by-phone.use-case';
import type { GetFyAppointmentUseCase } from '../application/use-cases/get-fy-appointment.use-case';
import type { GetFyAgencyUseCase } from '../application/use-cases/get-fy-agency.use-case';
import type { GetFyAvailableDatesUseCase } from '../application/use-cases/get-fy-available-dates.use-case';
import type { AddFyAppointmentNoteUseCase } from '../application/use-cases/add-fy-appointment-note.use-case';
import type { UpdateFyAppointmentContactUseCase } from '../application/use-cases/update-fy-appointment-contact.use-case';
import type { ResendFyNoticeUseCase } from '../application/use-cases/resend-fy-notice.use-case';

type PreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export interface FyRouteContainer {
  /** Composite auth: X-API-Key first, JWT fallback (which then fails the scope gate). */
  apiKeyAuthenticate: PreHandler;
  findFyAppointmentsByPhoneUseCase: FindFyAppointmentsByPhoneUseCase;
  getFyAppointmentUseCase: GetFyAppointmentUseCase;
  getFyAgencyUseCase: GetFyAgencyUseCase;
  getFyAvailableDatesUseCase: GetFyAvailableDatesUseCase;
  addFyAppointmentNoteUseCase: AddFyAppointmentNoteUseCase;
  updateFyAppointmentContactUseCase: UpdateFyAppointmentContactUseCase;
  resendFyNoticeUseCase: ResendFyNoticeUseCase;
}

const idParam = z.object({ id: z.string().uuid() });

/**
 * External machine surface for the Fy WhatsApp agent (AutoLabs). Machine-only:
 * every route requires an API key carrying the `bot:fy` scope — JWT principals
 * never carry scopes, so they are rejected by the scope gate.
 */
export async function registerFyRoutes(
  app: FastifyInstance,
  container: FyRouteContainer,
): Promise<void> {
  // Deref the container lazily (request time) — route registration must not
  // touch it, matching the other route modules' contract with test mocks.
  const preHandler: PreHandler[] = [
    (request, reply) => container.apiKeyAuthenticate(request, reply),
    requireScope(FY_AGENT_SCOPE),
  ];

  // Per-key limit on top of the global per-IP limit.
  const rateLimit = {
    max: 60,
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest) => {
      const header = request.headers[API_KEY_HEADER];
      const key = Array.isArray(header) ? header[0] : header;
      return key ?? request.ip;
    },
  };

  app.get(
    '/v1/integrations/fy/appointments/by-contact-phone',
    {
      preHandler,
      config: { rateLimit },
      schema: {
        querystring: fyPhoneQuerySchema,
        response: { 200: successResponseSchema(fyAppointmentsByPhoneSchema) },
      },
    },
    async (request, reply) => {
      const query = request.query as z.infer<typeof fyPhoneQuerySchema>;
      const result = await container.findFyAppointmentsByPhoneUseCase.execute({
        phone: query.phone,
        statusIn: query.statusIn,
      });
      return reply.send(success(result));
    },
  );

  app.get(
    '/v1/integrations/fy/appointments/:id',
    {
      preHandler,
      config: { rateLimit },
      schema: {
        params: idParam,
        response: { 200: successResponseSchema(fyAppointmentDetailSchema) },
      },
    },
    async (request, reply) => {
      const { id } = request.params as z.infer<typeof idParam>;
      const result = await container.getFyAppointmentUseCase.execute({ appointmentId: id });
      return reply.send(success(result));
    },
  );

  app.get(
    '/v1/integrations/fy/agencies/:id',
    {
      preHandler,
      config: { rateLimit },
      schema: {
        params: idParam,
        response: { 200: successResponseSchema(fyAgencySchema) },
      },
    },
    async (request, reply) => {
      const { id } = request.params as z.infer<typeof idParam>;
      const result = await container.getFyAgencyUseCase.execute({ agencyId: id });
      return reply.send(success(result));
    },
  );

  app.get(
    '/v1/integrations/fy/appointments/:id/available-dates',
    {
      preHandler,
      config: { rateLimit },
      schema: {
        params: idParam,
        querystring: fyAvailableDatesQuerySchema,
        response: { 200: successResponseSchema(fyAvailableDatesSchema) },
      },
    },
    async (request, reply) => {
      const { id } = request.params as z.infer<typeof idParam>;
      const { limit } = request.query as z.infer<typeof fyAvailableDatesQuerySchema>;
      const result = await container.getFyAvailableDatesUseCase.execute({
        appointmentId: id,
        limit,
      });
      return reply.send(success(result));
    },
  );

  app.post(
    '/v1/integrations/fy/appointments/:id/notes',
    {
      preHandler,
      config: { rateLimit },
      schema: {
        params: idParam,
        body: fyNoteCreateSchema,
        response: { 201: successResponseSchema(fyNoteCreatedSchema) },
      },
    },
    async (request, reply) => {
      const { id } = request.params as z.infer<typeof idParam>;
      const body = request.body as z.infer<typeof fyNoteCreateSchema>;
      const result = await container.addFyAppointmentNoteUseCase.execute({
        appointmentId: id,
        content: body.content,
        actor: request.authContext!,
      });
      return reply.status(201).send(success(result));
    },
  );

  app.patch(
    '/v1/integrations/fy/appointments/:id/contact',
    {
      preHandler,
      config: { rateLimit },
      schema: {
        params: idParam,
        body: fyContactUpdateSchema,
        response: { 200: successResponseSchema(fyContactUpdatedSchema) },
      },
    },
    async (request, reply) => {
      const { id } = request.params as z.infer<typeof idParam>;
      const body = request.body as z.infer<typeof fyContactUpdateSchema>;
      const result = await container.updateFyAppointmentContactUseCase.execute({
        appointmentId: id,
        ...body,
        actor: request.authContext!,
      });
      return reply.send(success(result));
    },
  );

  app.post(
    '/v1/integrations/fy/appointments/:id/resend-notice',
    {
      preHandler,
      config: { rateLimit },
      schema: {
        params: idParam,
        response: { 202: successResponseSchema(fyResendNoticeSchema) },
      },
    },
    async (request, reply) => {
      const { id } = request.params as z.infer<typeof idParam>;
      const result = await container.resendFyNoticeUseCase.execute({
        appointmentId: id,
        actor: request.authContext!,
      });
      return reply.status(202).send(success(result));
    },
  );
}
