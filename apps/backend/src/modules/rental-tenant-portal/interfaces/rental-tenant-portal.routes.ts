import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  confirmAppointmentPortalSchema,
  confirmAppointmentPortalResponseSchema,
  updateContactPortalSchema,
  reportUnavailabilityPortalSchema,
  reportUnavailabilityPortalResponseSchema,
  portalDataResponseSchema,
  portalTokenResponseSchema,
  generatePortalTokenBodySchema,
  portalActivitiesResponseSchema,
  availableGroupsResponseSchema,
  joinGroupRequestSchema,
  joinGroupResponseSchema,
  submitSatisfactionSurveySchema,
  satisfactionSurveyResponseSchema,
  appointmentSurveyResponseSchema,
  portalPresignIssuePhotoSchema,
  portalPresignIssuePhotoResponseSchema,
  portalConfirmIssuePhotoSchema,
  portalIssuePhotoResponseSchema,
  portalCreatePropertyIssueSchema,
  portalPropertyIssueResponseSchema,
  portalPropertyIssuesResponseSchema,
  paginationSchema,
  successResponseSchema,
} from '@properfy/shared';
import { success } from '../../../shared/interfaces/response';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { createPortalTokenMiddleware } from './portal-token-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { PortalActionBlockedError } from '../domain/rental-tenant-portal.errors';
import type { PresignPortalIssuePhotoUseCase } from '../application/use-cases/presign-portal-issue-photo.use-case';
import type { ConfirmPortalIssuePhotoUseCase } from '../application/use-cases/confirm-portal-issue-photo.use-case';
import type { CreatePortalIssueUseCase } from '../application/use-cases/create-portal-issue.use-case';
import type { ListPortalIssuesUseCase } from '../application/use-cases/list-portal-issues.use-case';
import type { GetPortalDataUseCase } from '../application/use-cases/get-portal-data.use-case';
import type { ConfirmAppointmentUseCase } from '../application/use-cases/confirm-appointment.use-case';
import type { UpdateContactUseCase } from '../application/use-cases/update-contact.use-case';
import type { ReportUnavailabilityUseCase } from '../application/use-cases/report-unavailability.use-case';
import type { GeneratePortalTokenUseCase } from '../application/use-cases/generate-portal-token.use-case';
import type { ListPortalActivitiesUseCase } from '../application/use-cases/list-portal-activities.use-case';
import type { GetAvailableGroupsUseCase } from '../application/use-cases/get-available-groups.use-case';
import type { JoinGroupUseCase } from '../application/use-cases/join-group.use-case';
import type { SubmitSatisfactionSurveyUseCase } from '../../satisfaction-survey/application/use-cases/submit-satisfaction-survey.use-case';
import type { GetAppointmentSurveyUseCase } from '../../satisfaction-survey/application/use-cases/get-appointment-survey.use-case';
import type { IRentalTenantPortalTokenRepository } from '../domain/rental-tenant-portal-token.repository';
import type { TokenService } from '../domain/token.service';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface RentalTenantPortalRouteContainer {
  getPortalDataUseCase: GetPortalDataUseCase;
  confirmAppointmentUseCase: ConfirmAppointmentUseCase;
  updateContactUseCase: UpdateContactUseCase;
  reportUnavailabilityUseCase: ReportUnavailabilityUseCase;
  generatePortalTokenUseCase: GeneratePortalTokenUseCase;
  listPortalActivitiesUseCase: ListPortalActivitiesUseCase;
  getAvailableGroupsUseCase: GetAvailableGroupsUseCase;
  joinGroupUseCase: JoinGroupUseCase;
  submitSatisfactionSurveyUseCase: SubmitSatisfactionSurveyUseCase;
  getAppointmentSurveyUseCase: GetAppointmentSurveyUseCase;
  presignPortalIssuePhotoUseCase: Pick<PresignPortalIssuePhotoUseCase, 'execute'>;
  confirmPortalIssuePhotoUseCase: Pick<ConfirmPortalIssuePhotoUseCase, 'execute'>;
  createPortalIssueUseCase: Pick<CreatePortalIssueUseCase, 'execute'>;
  listPortalIssuesUseCase: Pick<ListPortalIssuesUseCase, 'execute'>;
  tokenRepo: IRentalTenantPortalTokenRepository;
  tokenService: TokenService;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

const appointmentIdParam = z.object({ appointmentId: z.string().uuid() });
const tokenParam = z.object({ token: z.string() });

/** Extract the `Idempotency-Key` header for critical portal commands (D24). */
function idempotencyKeyHeader(request: FastifyRequest): string | undefined {
  const value = request.headers['idempotency-key'];
  return typeof value === 'string' ? value : undefined;
}

// Concrete response shape of UpdateContactUseCase.execute — modelled on the code
// (update-contact.use-case.ts), not the finding text. All three are nullable:
// the serializer strips undeclared fields and 500s (post-commit) on a null under
// a non-nullable declaration, so the contract must match the handler exactly.
const portalContactResponseSchema = z.object({
  rentalTenantName: z.string().nullable(),
  primaryEmail: z.string().nullable(),
  primaryPhone: z.string().nullable(),
});

export async function registerRentalTenantPortalRoutes(
  app: FastifyInstance,
  container: RentalTenantPortalRouteContainer,
): Promise<void> {
  const portalAuth = createPortalTokenMiddleware(
    container.tokenRepo,
    (raw) => container.tokenService.hashToken(raw),
    app.log,
  );
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  // Per-token rate limit for issue-photo presigns (F10-4 D21): 12 presigns per
  // token per hour, so one tenant cannot flood storage. The key is the hashed
  // token (as stored in the DB), with an IP fallback for a missing token. This
  // overrides the generic 30/min-per-IP limit on this one route; the other issue
  // routes keep it. Route params are populated before the onRequest hook runs.
  const presignIssuePhotoRateLimit = {
    max: 12,
    timeWindow: '1 hour',
    keyGenerator: (request: FastifyRequest) => {
      const token = (request.params as { token?: string }).token;
      return token
        ? `portal-issue-presign:${container.tokenService.hashToken(token)}`
        : `portal-issue-presign:ip:${request.ip}`;
    },
  };

  // --- Portal routes (token-authenticated, no JWT) ---

  // GET /v1/rental-tenant-portal/:token
  app.get(
    '/v1/rental-tenant-portal/:token',
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
        isPastConfirmCutoff: ctx.isPastConfirmCutoff,
        tokenStatus: ctx.tokenStatus,
        expiresAt: ctx.expiresAt,
        ipAddress,
        userAgent,
      });
      return reply.status(200).send(result);
    },
  );

  // POST /v1/rental-tenant-portal/:token/confirm
  app.post(
    '/v1/rental-tenant-portal/:token/confirm',
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
        isPastConfirmCutoff: ctx.isPastConfirmCutoff,
        isUsed: ctx.isUsed,
        restrictions: parsed.data.restrictions
          ? {
              isHome: parsed.data.restrictions.isHome ?? false,
              unavailableDaysJson: parsed.data.restrictions.unavailableDaysJson ?? null,
              unavailableHoursJson: parsed.data.restrictions.unavailableHoursJson
                ? parsed.data.restrictions.unavailableHoursJson.map((h) => `${h.start}-${h.end}`)
                : null,
              availableSlotsJson: parsed.data.restrictions.availableSlotsJson ?? null,
              notes: parsed.data.restrictions.notes ?? null,
            }
          : undefined,
        rentalTenantNote: parsed.data.rentalTenantNote,
        ipAddress,
        userAgent,
      });
      return reply.status(200).send(result);
    },
  );

  // POST /v1/rental-tenant-portal/:token/survey
  app.post(
    '/v1/rental-tenant-portal/:token/survey',
    { preHandler: portalAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { params: z.object({ token: z.string() }), body: submitSatisfactionSurveySchema, response: { 200: satisfactionSurveyResponseSchema } } },
    async (request, reply) => {
      const ctx = request.portalContext!;
      const parsed = submitSatisfactionSurveySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }

      const ipAddress =
        (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
        request.ip ??
        null;
      const userAgent = request.headers['user-agent'] ?? null;

      // Note: `ctx.isUsed` is deliberately NOT forwarded. It is set by join-group
      // (confirm and decline hand the claim back on success), so gating the survey
      // on it would lock out every tenant who rescheduled via the portal.
      const result = await container.submitSatisfactionSurveyUseCase.execute({
        tokenId: ctx.tokenId,
        appointmentId: ctx.appointmentId,
        isReadOnly: ctx.isReadOnly,
        rating: parsed.data.rating,
        comment: parsed.data.comment,
        ipAddress,
        userAgent,
      });
      return reply.status(200).send(result);
    },
  );

  // PATCH /v1/rental-tenant-portal/:token/contact
  app.patch(
    '/v1/rental-tenant-portal/:token/contact',
    { preHandler: portalAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { params: z.object({ token: z.string() }), body: updateContactPortalSchema, response: { 200: z.object({ contact: portalContactResponseSchema }) } } },
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

  // POST /v1/rental-tenant-portal/:token/unavailable
  app.post(
    '/v1/rental-tenant-portal/:token/unavailable',
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
        isPastConfirmCutoff: ctx.isPastConfirmCutoff,
        isUsed: ctx.isUsed,
        restrictions: parsed.data.restrictions
          ? {
              isHome: parsed.data.restrictions.isHome ?? false,
              unavailableDaysJson: parsed.data.restrictions.unavailableDaysJson ?? null,
              unavailableHoursJson: parsed.data.restrictions.unavailableHoursJson
                ? parsed.data.restrictions.unavailableHoursJson.map((h) => `${h.start}-${h.end}`)
                : null,
              availableSlotsJson: parsed.data.restrictions.availableSlotsJson ?? null,
              notes: parsed.data.restrictions.notes ?? null,
            }
          : undefined,
        rentalTenantNote: parsed.data.rentalTenantNote,
        ipAddress,
        userAgent,
      });
      return reply.status(200).send(result);
    },
  );

  // GET /v1/rental-tenant-portal/:token/available-groups
  app.get(
    '/v1/rental-tenant-portal/:token/available-groups',
    { preHandler: portalAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { params: z.object({ token: z.string() }), response: { 200: availableGroupsResponseSchema } } },
    async (request, reply) => {
      const ctx = request.portalContext!;
      const result = await container.getAvailableGroupsUseCase.execute({
        appointmentId: ctx.appointmentId,
      });
      return reply.status(200).send(result);
    },
  );

  // POST /v1/rental-tenant-portal/:token/join-group
  app.post(
    '/v1/rental-tenant-portal/:token/join-group',
    { preHandler: portalAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { params: z.object({ token: z.string() }), body: joinGroupRequestSchema, response: { 200: joinGroupResponseSchema } } },
    async (request, reply) => {
      const ctx = request.portalContext!;
      const parsed = joinGroupRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }

      const ipAddress =
        (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
        request.ip ??
        null;
      const userAgent = request.headers['user-agent'] ?? null;

      const result = await container.joinGroupUseCase.execute({
        tokenId: ctx.tokenId,
        appointmentId: ctx.appointmentId,
        groupId: parsed.data.groupId,
        scheduledDate: parsed.data.scheduledDate,
        timeSlotStart: parsed.data.timeSlotStart,
        timeSlotEnd: parsed.data.timeSlotEnd,
        isUsed: ctx.isUsed,
        rentalTenantNote: parsed.data.rentalTenantNote,
        ipAddress,
        userAgent,
      });
      return reply.status(200).send(result);
    },
  );

  // --- Portal property-issue routes (F10-4, token-authenticated) ---

  // POST /v1/rental-tenant-portal/:token/property-issues/presign
  app.post(
    '/v1/rental-tenant-portal/:token/property-issues/presign',
    {
      preHandler: portalAuth,
      config: { rateLimit: presignIssuePhotoRateLimit },
      schema: {
        params: tokenParam,
        body: portalPresignIssuePhotoSchema,
        response: { 201: portalPresignIssuePhotoResponseSchema },
      },
    },
    async (request, reply) => {
      const ctx = request.portalContext!;
      if (ctx.isReadOnly) throw new PortalActionBlockedError();
      const parsed = portalPresignIssuePhotoSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.presignPortalIssuePhotoUseCase.execute({
        appointmentId: ctx.appointmentId,
        input: parsed.data,
      });
      return reply.status(201).send(result);
    },
  );

  // POST /v1/rental-tenant-portal/:token/property-issues/confirm-upload
  app.post(
    '/v1/rental-tenant-portal/:token/property-issues/confirm-upload',
    {
      preHandler: portalAuth,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        params: tokenParam,
        body: portalConfirmIssuePhotoSchema,
        response: { 200: portalIssuePhotoResponseSchema },
      },
    },
    async (request, reply) => {
      const ctx = request.portalContext!;
      if (ctx.isReadOnly) throw new PortalActionBlockedError();
      const parsed = portalConfirmIssuePhotoSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.confirmPortalIssuePhotoUseCase.execute({
        appointmentId: ctx.appointmentId,
        fileId: parsed.data.fileId,
        idempotencyKey: idempotencyKeyHeader(request),
      });
      return reply.status(200).send(result);
    },
  );

  // POST /v1/rental-tenant-portal/:token/property-issues
  app.post(
    '/v1/rental-tenant-portal/:token/property-issues',
    {
      preHandler: portalAuth,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        params: tokenParam,
        body: portalCreatePropertyIssueSchema,
        response: { 201: portalPropertyIssueResponseSchema },
      },
    },
    async (request, reply) => {
      const ctx = request.portalContext!;
      if (ctx.isReadOnly) throw new PortalActionBlockedError();
      const parsed = portalCreatePropertyIssueSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.createPortalIssueUseCase.execute({
        appointmentId: ctx.appointmentId,
        input: parsed.data,
        idempotencyKey: idempotencyKeyHeader(request),
        requestId: request.id,
      });
      return reply.status(201).send(result);
    },
  );

  // GET /v1/rental-tenant-portal/:token/property-issues
  // The tenant's own submitted reports for this appointment (read-only allowed).
  app.get(
    '/v1/rental-tenant-portal/:token/property-issues',
    {
      preHandler: portalAuth,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        params: tokenParam,
        response: { 200: portalPropertyIssuesResponseSchema },
      },
    },
    async (request, reply) => {
      const ctx = request.portalContext!;
      const result = await container.listPortalIssuesUseCase.execute({
        appointmentId: ctx.appointmentId,
      });
      return reply.status(200).send(result);
    },
  );

  // --- Admin route (JWT-authenticated) ---

  // POST /v1/appointments/:appointmentId/portal-token
  app.post(
    '/v1/appointments/:appointmentId/portal-token',
    { preHandler: authenticate, schema: { params: z.object({ appointmentId: z.string().uuid() }), body: generatePortalTokenBodySchema, response: { 201: successResponseSchema(portalTokenResponseSchema) } } },
    async (request, reply) => {
      const params = appointmentIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid appointment ID', params.error.errors);
      }
      const body = generatePortalTokenBodySchema.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError('Request payload is invalid', body.error.errors);
      }

      const result = await container.generatePortalTokenUseCase.execute({
        appointmentId: params.data.appointmentId,
        actor: request.authContext!,
        notify: body.data?.notify,
      });
      return reply.status(201).send(success(result));
    },
  );

  // GET /v1/appointments/:appointmentId/survey
  //
  // Returns 200 with a null body when there is nothing to show — either the
  // inspection has no response yet, or the caller's agency does not own it. The
  // two cases are deliberately indistinguishable: a 403 or a 404 would confirm
  // that someone else's appointment exists.
  app.get(
    '/v1/appointments/:appointmentId/survey',
    { preHandler: authenticate, schema: { params: z.object({ appointmentId: z.string().uuid() }), response: { 200: successResponseSchema(appointmentSurveyResponseSchema) } } },
    async (request, reply) => {
      const params = appointmentIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid appointment ID', params.error.errors);
      }

      const result = await container.getAppointmentSurveyUseCase.execute({
        appointmentId: params.data.appointmentId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
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
