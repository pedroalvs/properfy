import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createServiceGroupSchema,
  updateServiceGroupSchema,
  assignInspectorSchema,
  cancelServiceGroupSchema,
  rejectServiceGroupSchema,
  republishServiceGroupSchema,
  listServiceGroupsQuerySchema,
  serviceGroupResponseSchema,
  successResponseSchema,
  paginatedResponseSchema,
  addAppointmentsToGroupRequestSchema,
  eligibilityCheckRequestSchema,
  eligibilityCheckResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { success, paginated } from '../../../shared/interfaces/response';
import type { CreateServiceGroupUseCase } from '../application/use-cases/create-service-group.use-case';
import type { GetServiceGroupUseCase } from '../application/use-cases/get-service-group.use-case';
import type { ListServiceGroupsUseCase } from '../application/use-cases/list-service-groups.use-case';
import type { PublishServiceGroupUseCase } from '../application/use-cases/publish-service-group.use-case';
import type { AssignInspectorManuallyUseCase } from '../application/use-cases/assign-inspector-manually.use-case';
import type { CancelServiceGroupUseCase } from '../application/use-cases/cancel-service-group.use-case';
import type { RejectServiceGroupUseCase } from '../application/use-cases/reject-service-group.use-case';
import type { UpdateServiceGroupUseCase } from '../application/use-cases/update-service-group.use-case';
import type { RepublishServiceGroupUseCase } from '../application/use-cases/republish-service-group.use-case';
import type { AddAppointmentsToGroupUseCase } from '../application/use-cases/add-appointments-to-group.use-case';
import type { CheckAppointmentsEligibilityForGroupUseCase } from '../application/use-cases/check-appointments-eligibility-for-group.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface ServiceGroupRouteContainer {
  createServiceGroupUseCase: CreateServiceGroupUseCase;
  getServiceGroupUseCase: GetServiceGroupUseCase;
  listServiceGroupsUseCase: ListServiceGroupsUseCase;
  publishServiceGroupUseCase: PublishServiceGroupUseCase;
  assignInspectorManuallyUseCase: AssignInspectorManuallyUseCase;
  cancelServiceGroupUseCase: CancelServiceGroupUseCase;
  rejectServiceGroupUseCase: RejectServiceGroupUseCase;
  updateServiceGroupUseCase: UpdateServiceGroupUseCase;
  republishServiceGroupUseCase: RepublishServiceGroupUseCase;
  addAppointmentsToGroupUseCase: AddAppointmentsToGroupUseCase;
  checkAppointmentsEligibilityForGroupUseCase: CheckAppointmentsEligibilityForGroupUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

const groupIdParam = z.object({ groupId: z.string().uuid() });

export async function registerServiceGroupRoutes(
  app: FastifyInstance,
  container: ServiceGroupRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  // POST /v1/service-groups — 201
  app.post(
    '/v1/service-groups',
    {
      preHandler: authenticate,
      schema: {
        body: createServiceGroupSchema,
        response: { 201: successResponseSchema(serviceGroupResponseSchema) },
      },
    },
    async (request, reply) => {
      const parsed = createServiceGroupSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.createServiceGroupUseCase.execute({
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(201).send(success(result));
    },
  );

  // GET /v1/service-groups — paginated 200
  app.get(
    '/v1/service-groups',
    {
      preHandler: authenticate,
      schema: {
        querystring: listServiceGroupsQuerySchema,
        response: { 200: paginatedResponseSchema(serviceGroupResponseSchema) },
      },
    },
    async (request, reply) => {
      const parsed = listServiceGroupsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }
      const { page, pageSize, sortBy, sortOrder, ...filters } = parsed.data;
      const result = await container.listServiceGroupsUseCase.execute({
        filters,
        pagination: { page, pageSize, sortBy, sortOrder },
        actor: request.authContext!,
      });
      return reply.status(200).send(paginated(result.data, result.total, page, pageSize));
    },
  );

  // GET /v1/service-groups/:groupId — 200
  app.get(
    '/v1/service-groups/:groupId',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ groupId: z.string().uuid() }),
        response: { 200: successResponseSchema(serviceGroupResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = groupIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid group ID', params.error.errors);
      }
      const result = await container.getServiceGroupUseCase.execute({
        groupId: params.data.groupId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/service-groups/:groupId/publish — 200
  app.post(
    '/v1/service-groups/:groupId/publish',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ groupId: z.string().uuid() }),
        response: { 200: successResponseSchema(serviceGroupResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = groupIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid group ID', params.error.errors);
      }
      const result = await container.publishServiceGroupUseCase.execute({
        groupId: params.data.groupId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/service-groups/:groupId/assign — 200
  app.post(
    '/v1/service-groups/:groupId/assign',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ groupId: z.string().uuid() }),
        body: assignInspectorSchema,
        response: { 200: successResponseSchema(serviceGroupResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = groupIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid group ID', params.error.errors);
      }
      const parsed = assignInspectorSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.assignInspectorManuallyUseCase.execute({
        groupId: params.data.groupId,
        inspectorId: parsed.data.inspectorId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // PATCH /v1/service-groups/:groupId — 200
  app.patch(
    '/v1/service-groups/:groupId',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ groupId: z.string().uuid() }),
        body: updateServiceGroupSchema,
        response: { 200: successResponseSchema(serviceGroupResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = groupIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid group ID', params.error.errors);
      }
      const parsed = updateServiceGroupSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.updateServiceGroupUseCase.execute({
        groupId: params.data.groupId,
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/service-groups/:groupId/cancel — 200
  app.post(
    '/v1/service-groups/:groupId/cancel',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ groupId: z.string().uuid() }),
        body: cancelServiceGroupSchema,
        response: { 200: successResponseSchema(z.object({ id: z.string().uuid(), status: z.string() })) },
      },
    },
    async (request, reply) => {
      const params = groupIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid group ID', params.error.errors);
      }
      const parsed = cancelServiceGroupSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.cancelServiceGroupUseCase.execute({
        groupId: params.data.groupId,
        reason: parsed.data.reason,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/service-groups/:groupId/reject — 200
  app.post(
    '/v1/service-groups/:groupId/reject',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ groupId: z.string().uuid() }),
        body: rejectServiceGroupSchema,
        response: { 200: successResponseSchema(z.object({ id: z.string().uuid(), status: z.string() })) },
      },
    },
    async (request, reply) => {
      const params = groupIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid group ID', params.error.errors);
      }
      const parsed = rejectServiceGroupSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.rejectServiceGroupUseCase.execute({
        groupId: params.data.groupId,
        reason: parsed.data.reason,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/service-groups/:groupId/republish — 200
  app.post(
    '/v1/service-groups/:groupId/republish',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ groupId: z.string().uuid() }),
        body: republishServiceGroupSchema,
        response: { 200: successResponseSchema(z.object({ id: z.string().uuid(), status: z.string() })) },
      },
    },
    async (request, reply) => {
      const params = groupIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid group ID', params.error.errors);
      }
      const parsed = republishServiceGroupSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.republishServiceGroupUseCase.execute({
        groupId: params.data.groupId,
        reason: parsed.data.reason,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // 026 §FR-510 — POST /v1/service-groups/:groupId/appointments
  // Add appointments to an existing group. Per-item mixed-result envelope;
  // RBAC enforced at the use-case layer (AM/OP only).
  const addToGroupResultSchema = z.object({
    appointmentId: z.string().uuid(),
    status: z.enum([
      'OK', 'INVALID_STATUS', 'ALREADY_GROUPED', 'INVALID_TENANT',
      'INVALID_SERVICE_TYPE', 'INVALID_DATE', 'INVALID_TIME_WINDOW',
      'GROUP_IN_TERMINAL_STATE', 'GROUP_CAPACITY_EXCEEDED',
      'NOT_FOUND', 'ERROR',
    ]),
    error: z.object({ code: z.string(), message: z.string() }).optional(),
  });
  app.post(
    '/v1/service-groups/:groupId/appointments',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ groupId: z.string().uuid() }),
        body: addAppointmentsToGroupRequestSchema,
        response: { 200: successResponseSchema(z.object({ results: z.array(addToGroupResultSchema) })) },
      },
    },
    async (request, reply) => {
      const auth = request.authContext!;
      if (auth.role !== 'AM' && auth.role !== 'OP') {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'AM or OP role required' } });
      }
      const params = groupIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid group ID', params.error.errors);
      }
      const parsed = addAppointmentsToGroupRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.addAppointmentsToGroupUseCase.execute({
        groupId: params.data.groupId,
        appointmentIds: parsed.data.appointmentIds,
        actor: auth,
      });
      return reply.status(200).send(success(result));
    },
  );

  // 026 §FR-510 — POST /v1/service-groups/:groupId/eligibility-check
  // Read-only preview powering the Add-to-group sub-modal. Same RBAC as add.
  app.post(
    '/v1/service-groups/:groupId/eligibility-check',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ groupId: z.string().uuid() }),
        body: eligibilityCheckRequestSchema,
        response: { 200: successResponseSchema(eligibilityCheckResponseSchema) },
      },
    },
    async (request, reply) => {
      const auth = request.authContext!;
      if (auth.role !== 'AM' && auth.role !== 'OP') {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'AM or OP role required' } });
      }
      const params = groupIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid group ID', params.error.errors);
      }
      const parsed = eligibilityCheckRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.checkAppointmentsEligibilityForGroupUseCase.execute({
        groupId: params.data.groupId,
        appointmentIds: parsed.data.appointmentIds,
        actor: auth,
      });
      return reply.status(200).send(success(result));
    },
  );
}
