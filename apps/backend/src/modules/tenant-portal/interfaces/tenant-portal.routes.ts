import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  confirmAppointmentPortalSchema,
  confirmAppointmentPortalResponseSchema,
  rescheduleRequestPortalSchema,
  rescheduleRequestPortalResponseSchema,
  updateContactPortalSchema,
  reportUnavailabilityPortalSchema,
  reportUnavailabilityPortalResponseSchema,
  portalDataResponseSchema,
  portalTokenResponseSchema,
  portalActivitiesResponseSchema,
  paginationSchema,
  successResponseSchema,
} from '@properfy/shared';
import { success } from '../../../shared/interfaces/response';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { createPortalTokenMiddleware } from './portal-token-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import type { GetPortalDataUseCase } from '../application/use-cases/get-portal-data.use-case';
import type { ConfirmAppointmentUseCase } from '../application/use-cases/confirm-appointment.use-case';
import type { RescheduleRequestUseCase } from '../application/use-cases/reschedule-request.use-case';
import type { UpdateContactUseCase } from '../application/use-cases/update-contact.use-case';
import type { ReportUnavailabilityUseCase } from '../application/use-cases/report-unavailability.use-case';
import type { GeneratePortalTokenUseCase } from '../application/use-cases/generate-portal-token.use-case';
import type { ListPortalActivitiesUseCase } from '../application/use-cases/list-portal-activities.use-case';
import type { ITenantPortalTokenRepository } from '../domain/tenant-portal-token.repository';
import type { TokenService } from '../domain/token.service';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface TenantPortalRouteContainer {
  getPortalDataUseCase: GetPortalDataUseCase;
  confirmAppointmentUseCase: ConfirmAppointmentUseCase;
  rescheduleRequestUseCase: RescheduleRequestUseCase;
  updateContactUseCase: UpdateContactUseCase;
  reportUnavailabilityUseCase: ReportUnavailabilityUseCase;
  generatePortalTokenUseCase: GeneratePortalTokenUseCase;
  listPortalActivitiesUseCase: ListPortalActivitiesUseCase;
  tokenRepo: ITenantPortalTokenRepository;
  tokenService: TokenService;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

const appointmentIdParam = z.object({ appointmentId: z.string().uuid() });

export async function registerTenantPortalRoutes(
  app: FastifyInstance,
  container: TenantPortalRouteContainer,
): Promise<void> {
  const portalAuth = createPortalTokenMiddleware(container.tokenRepo, (raw) =>
    container.tokenService.hashToken(raw),
  );
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  // --- Portal routes (token-authenticated, no JWT) ---

  // GET /v1/tenant-portal/:token
  app.get(
    '/v1/tenant-portal/:token',
    { preHandler: portalAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { params: z.object({ token: z.string() }), response: { 200: portalDataResponseSchema } } },
    async (request, reply) => {
      const ctx = request.portalContext!;
      const ipAddress =
        (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
        request.ip ??
        null;
      const userAgent = request.headers['user-agent'] ?? null;

      const result = await container.getPortalDataUseCase.execute({
        tokenId: ctx.tokenId,
        appointmentId: ctx.appointmentId,
        isReadOnly: ctx.isReadOnly,
        tokenStatus: ctx.tokenStatus,
        expiresAt: ctx.expiresAt,
        ipAddress,
        userAgent,
      });
      return reply.status(200).send(result);
    },
  );

  // POST /v1/tenant-portal/:token/confirm
  app.post(
    '/v1/tenant-portal/:token/confirm',
    { preHandler: portalAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { params: z.object({ token: z.string() }), body: confirmAppointmentPortalSchema, response: { 200: confirmAppointmentPortalResponseSchema } } },
    async (request, reply) => {
      const ctx = request.portalContext!;
      const parsed = confirmAppointmentPortalSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }

      const ipAddress =
        (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
        request.ip ??
        null;
      const userAgent = request.headers['user-agent'] ?? null;

      const result = await container.confirmAppointmentUseCase.execute({
        tokenId: ctx.tokenId,
        appointmentId: ctx.appointmentId,
        isReadOnly: ctx.isReadOnly,
        isUsed: ctx.isUsed,
        restrictions: parsed.data.restrictions
          ? {
              isHome: parsed.data.restrictions.isHome ?? false,
              unavailableDaysJson: parsed.data.restrictions.unavailableDaysJson ?? null,
              unavailableHoursJson: parsed.data.restrictions.unavailableHoursJson
                ? parsed.data.restrictions.unavailableHoursJson.map((h) => `${h.start}-${h.end}`)
                : null,
              notes: parsed.data.restrictions.notes ?? null,
            }
          : undefined,
        tenantNote: parsed.data.tenantNote,
        ipAddress,
        userAgent,
      });
      return reply.status(200).send(result);
    },
  );

  // POST /v1/tenant-portal/:token/reschedule
  app.post(
    '/v1/tenant-portal/:token/reschedule',
    { preHandler: portalAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { params: z.object({ token: z.string() }), body: rescheduleRequestPortalSchema, response: { 200: rescheduleRequestPortalResponseSchema } } },
    async (request, reply) => {
      const ctx = request.portalContext!;
      const parsed = rescheduleRequestPortalSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }

      const ipAddress =
        (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
        request.ip ??
        null;
      const userAgent = request.headers['user-agent'] ?? null;

      const result = await container.rescheduleRequestUseCase.execute({
        tokenId: ctx.tokenId,
        appointmentId: ctx.appointmentId,
        isReadOnly: ctx.isReadOnly,
        isUsed: ctx.isUsed,
        newDate: parsed.data.newDate,
        newTimeSlot: parsed.data.newTimeSlot,
        restrictions: parsed.data.restrictions
          ? {
              isHome: parsed.data.restrictions.isHome ?? false,
              unavailableDaysJson: parsed.data.restrictions.unavailableDaysJson ?? null,
              unavailableHoursJson: parsed.data.restrictions.unavailableHoursJson
                ? parsed.data.restrictions.unavailableHoursJson.map((h) => `${h.start}-${h.end}`)
                : null,
              notes: parsed.data.restrictions.notes ?? null,
            }
          : undefined,
        tenantNote: parsed.data.tenantNote,
        ipAddress,
        userAgent,
      });
      return reply.status(200).send(result);
    },
  );

  // PATCH /v1/tenant-portal/:token/contact
  app.patch(
    '/v1/tenant-portal/:token/contact',
    { preHandler: portalAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { params: z.object({ token: z.string() }), body: updateContactPortalSchema, response: { 200: z.object({ contact: z.unknown() }) } } },
    async (request, reply) => {
      const ctx = request.portalContext!;
      const parsed = updateContactPortalSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }

      const ipAddress =
        (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
        request.ip ??
        null;
      const userAgent = request.headers['user-agent'] ?? null;

      const result = await container.updateContactUseCase.execute({
        tokenId: ctx.tokenId,
        appointmentId: ctx.appointmentId,
        isReadOnly: ctx.isReadOnly,
        contact: parsed.data,
        ipAddress,
        userAgent,
      });
      return reply.status(200).send({ contact: result });
    },
  );

  // POST /v1/tenant-portal/:token/unavailable
  app.post(
    '/v1/tenant-portal/:token/unavailable',
    { preHandler: portalAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { params: z.object({ token: z.string() }), body: reportUnavailabilityPortalSchema, response: { 200: reportUnavailabilityPortalResponseSchema } } },
    async (request, reply) => {
      const ctx = request.portalContext!;
      const parsed = reportUnavailabilityPortalSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }

      const ipAddress =
        (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
        request.ip ??
        null;
      const userAgent = request.headers['user-agent'] ?? null;

      const result = await container.reportUnavailabilityUseCase.execute({
        tokenId: ctx.tokenId,
        appointmentId: ctx.appointmentId,
        isReadOnly: ctx.isReadOnly,
        isUsed: ctx.isUsed,
        restrictions: parsed.data.restrictions
          ? {
              isHome: parsed.data.restrictions.isHome ?? false,
              unavailableDaysJson: parsed.data.restrictions.unavailableDaysJson ?? null,
              unavailableHoursJson: parsed.data.restrictions.unavailableHoursJson
                ? parsed.data.restrictions.unavailableHoursJson.map((h) => `${h.start}-${h.end}`)
                : null,
              notes: parsed.data.restrictions.notes ?? null,
            }
          : undefined,
        tenantNote: parsed.data.tenantNote,
        ipAddress,
        userAgent,
      });
      return reply.status(200).send(result);
    },
  );

  // --- Admin route (JWT-authenticated) ---

  // POST /v1/appointments/:appointmentId/portal-token
  app.post(
    '/v1/appointments/:appointmentId/portal-token',
    { preHandler: authenticate, schema: { params: z.object({ appointmentId: z.string().uuid() }), response: { 201: successResponseSchema(portalTokenResponseSchema) } } },
    async (request, reply) => {
      const params = appointmentIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid appointment ID', params.error.errors);
      }

      const result = await container.generatePortalTokenUseCase.execute({
        appointmentId: params.data.appointmentId,
        actor: request.authContext!,
      });
      return reply.status(201).send(success(result));
    },
  );

  // GET /v1/appointments/:appointmentId/portal-activities
  app.get(
    '/v1/appointments/:appointmentId/portal-activities',
    { preHandler: authenticate, schema: { params: z.object({ appointmentId: z.string().uuid() }), querystring: paginationSchema, response: { 200: portalActivitiesResponseSchema } } },
    async (request, reply) => {
      const params = appointmentIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid appointment ID', params.error.errors);
      }

      const query = paginationSchema.safeParse(request.query);
      if (!query.success) {
        throw new ValidationError('Invalid pagination parameters', query.error.errors);
      }

      const result = await container.listPortalActivitiesUseCase.execute({
        appointmentId: params.data.appointmentId,
        actor: request.authContext!,
        page: query.data.page,
        pageSize: query.data.pageSize,
      });
      return reply.status(200).send(result);
    },
  );
}
