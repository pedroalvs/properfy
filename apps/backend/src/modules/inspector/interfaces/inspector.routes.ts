import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createInspectorSchema,
  updateInspectorSchema,
  listInspectorsQuerySchema,
  createAvailabilitySlotSchema,
  updateAvailabilitySlotSchema,
  listAvailabilitySlotsQuerySchema,
  linkInspectorToUserSchema,
  deactivateSchema,
  inspectorResponseSchema,
  availabilitySlotResponseSchema,
  successResponseSchema,
  paginatedResponseSchema,
  inspectorSelfUpdateSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ForbiddenError, ValidationError } from '../../../shared/domain/errors';
import { success, paginated } from '../../../shared/interfaces/response';
import type { CreateInspectorUseCase } from '../application/use-cases/create-inspector.use-case';
import type { GetInspectorUseCase } from '../application/use-cases/get-inspector.use-case';
import type { ListInspectorsUseCase } from '../application/use-cases/list-inspectors.use-case';
import type { UpdateInspectorUseCase } from '../application/use-cases/update-inspector.use-case';
import type { CreateAvailabilitySlotUseCase } from '../application/use-cases/create-availability-slot.use-case';
import type { ListAvailabilitySlotsUseCase } from '../application/use-cases/list-availability-slots.use-case';
import type { UpdateAvailabilitySlotUseCase } from '../application/use-cases/update-availability-slot.use-case';
import type { LinkInspectorToUserUseCase } from '../application/use-cases/link-inspector-to-user.use-case';
import type { DeactivateInspectorUseCase } from '../application/use-cases/deactivate-inspector.use-case';
import type { GenerateInspectorPhotoUploadUrlUseCase } from '../application/use-cases/generate-inspector-photo-upload-url.use-case';
import type { ConfirmInspectorPhotoUploadUseCase } from '../application/use-cases/confirm-inspector-photo-upload.use-case';
import type { UpdateInspectorSelfProfileUseCase } from '../application/use-cases/update-inspector-self-profile.use-case';
import type { GenerateInspectorDocumentUploadUrlUseCase } from '../application/use-cases/generate-inspector-document-upload-url.use-case';
import type { ConfirmInspectorDocumentUploadUseCase } from '../application/use-cases/confirm-inspector-document-upload.use-case';
import type { GetInspectorDocumentDownloadUrlUseCase } from '../application/use-cases/get-inspector-document-download-url.use-case';
import { DOCUMENT_KINDS } from '../application/use-cases/generate-inspector-document-upload-url.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface InspectorRouteContainer {
  createInspectorUseCase: CreateInspectorUseCase;
  getInspectorUseCase: GetInspectorUseCase;
  listInspectorsUseCase: ListInspectorsUseCase;
  updateInspectorUseCase: UpdateInspectorUseCase;
  createAvailabilitySlotUseCase: CreateAvailabilitySlotUseCase;
  listAvailabilitySlotsUseCase: ListAvailabilitySlotsUseCase;
  updateAvailabilitySlotUseCase: UpdateAvailabilitySlotUseCase;
  linkInspectorToUserUseCase: LinkInspectorToUserUseCase;
  deactivateInspectorUseCase: DeactivateInspectorUseCase;
  generateInspectorPhotoUploadUrlUseCase: GenerateInspectorPhotoUploadUrlUseCase;
  confirmInspectorPhotoUploadUseCase: ConfirmInspectorPhotoUploadUseCase;
  updateInspectorSelfProfileUseCase: UpdateInspectorSelfProfileUseCase;
  generateInspectorDocumentUploadUrlUseCase: GenerateInspectorDocumentUploadUrlUseCase;
  confirmInspectorDocumentUploadUseCase: ConfirmInspectorDocumentUploadUseCase;
  getInspectorDocumentDownloadUrlUseCase: GetInspectorDocumentDownloadUrlUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
  slotRepo: { findByIdAny(id: string): Promise<{ inspectorId: string } | null> };
}

const inspectorIdParam = z.object({ inspectorId: z.string().uuid() });
const slotIdParam = z.object({
  inspectorId: z.string().uuid(),
  slotId: z.string().uuid(),
});

function extractRegion(regionJson: Record<string, unknown> | null | undefined): string | null {
  if (!regionJson) return null;
  if (typeof regionJson['name'] === 'string') return regionJson['name'];
  return null;
}

export async function registerInspectorRoutes(
  app: FastifyInstance,
  container: InspectorRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  // POST /v1/inspectors
  app.post(
    '/v1/inspectors',
    { preHandler: authenticate, schema: { body: createInspectorSchema, response: { 201: successResponseSchema(inspectorResponseSchema) } } },
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
        regionIds: parsed.data.regionIds,
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
    { preHandler: authenticate, schema: { querystring: listInspectorsQuerySchema, response: { 200: paginatedResponseSchema(inspectorResponseSchema) } } },
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
    { preHandler: authenticate, schema: { params: z.object({ inspectorId: z.string().uuid() }), response: { 200: successResponseSchema(inspectorResponseSchema) } } },
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
    { preHandler: authenticate, schema: { params: z.object({ inspectorId: z.string().uuid() }), body: updateInspectorSchema, response: { 200: successResponseSchema(inspectorResponseSchema) } } },
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
          regionIds: parsed.data.regionIds,
          serviceTypes: parsed.data.serviceTypes,
          clientEligibility: parsed.data.clientEligibility,
        },
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // GET /v1/availability-slots — flat route (inspectorId optional query param)
  app.get(
    '/v1/availability-slots',
    {
      preHandler: authenticate,
      schema: {
        querystring: listAvailabilitySlotsQuerySchema.extend({
          inspectorId: z.string().uuid().optional(),
        }),
        response: { 200: paginatedResponseSchema(availabilitySlotResponseSchema) },
      },
    },
    async (request, reply) => {
      const parsed = listAvailabilitySlotsQuerySchema.extend({
        inspectorId: z.string().uuid().optional(),
      }).safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }
      const { page, pageSize, sortBy, sortOrder, inspectorId: queryInspectorId, ...filters } = parsed.data;
      const actor = request.authContext!;

      let resolvedInspectorId: string | undefined;
      if (actor.role === 'INSP') {
        resolvedInspectorId = actor.inspectorId ?? undefined;
      } else if (actor.role === 'AM') {
        // Sprint 1 W-4-IMPL (CORRECTION-001 close-it, 2026-04-13): inspectors
        // are not tenant-scoped, so cross-inspector listing is AM-only.
        resolvedInspectorId = queryInspectorId; // undefined = list all
      } else if (actor.role === 'OP' || actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
        resolvedInspectorId = queryInspectorId;
      }

      const result = await container.listAvailabilitySlotsUseCase.execute({
        inspectorId: resolvedInspectorId,
        filters,
        pagination: { page, pageSize, sortBy, sortOrder },
        actor,
      });
      const mapped = result.data.map((s) => ({
        id: s.id,
        inspectorId: s.inspectorId,
        inspectorName: s.inspectorName ?? null,
        date: s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date),
        startTime: s.startTime,
        endTime: s.endTime,
        region: extractRegion(s.regionJson),
        regionJson: s.regionJson,
        capacity: s.capacity,
        bookedCount: 0,
        status: s.status,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));
      return reply.status(200).send(paginated(mapped, result.total, page, pageSize));
    },
  );

  // POST /v1/availability-slots — flat route (inspectorId in body)
  app.post(
    '/v1/availability-slots',
    {
      preHandler: authenticate,
      schema: {
        body: createAvailabilitySlotSchema,
        response: { 201: successResponseSchema(availabilitySlotResponseSchema) },
      },
    },
    async (request, reply) => {
      const parsed = createAvailabilitySlotSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const actor = request.authContext!;
      const { inspectorId: bodyInspectorId, date, startTime, endTime, region, regionJson, capacity } = parsed.data;

      let resolvedInspectorId: string;
      if (actor.role === 'INSP') {
        if (!actor.inspectorId) {
          throw new ValidationError('Inspector profile not linked to user account', []);
        }
        resolvedInspectorId = actor.inspectorId;
      } else {
        if (!bodyInspectorId) {
          throw new ValidationError('inspectorId is required', [{ path: ['inspectorId'], message: 'Required' }]);
        }
        resolvedInspectorId = bodyInspectorId;
      }

      // Derive regionJson from region string if provided
      const resolvedRegionJson = regionJson ?? (region ? { name: region } : undefined);

      const result = await container.createAvailabilitySlotUseCase.execute({
        inspectorId: resolvedInspectorId,
        date: new Date(date),
        startTime,
        endTime,
        regionJson: resolvedRegionJson,
        capacity,
        actor,
      });

      return reply.status(201).send(success({
        id: result.id,
        inspectorId: result.inspectorId,
        inspectorName: null,
        date: result.date instanceof Date ? result.date.toISOString().slice(0, 10) : String(result.date),
        startTime: result.startTime,
        endTime: result.endTime,
        region: extractRegion(result.regionJson),
        regionJson: result.regionJson,
        capacity: result.capacity,
        bookedCount: 0,
        status: result.status,
        createdAt: result.createdAt,
        updatedAt: result.createdAt,
      }));
    },
  );

  // PATCH /v1/availability-slots/:id — flat route (no inspectorId in path)
  app.patch(
    '/v1/availability-slots/:id',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: updateAvailabilitySlotSchema,
        response: { 200: successResponseSchema(availabilitySlotResponseSchema) },
      },
    },
    async (request, reply) => {
      const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid slot ID', params.error.errors);
      }
      const parsed = updateAvailabilitySlotSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const actor = request.authContext!;
      const { id } = params.data;

      const slot = await container.slotRepo.findByIdAny(id);
      if (!slot) {
        const { NotFoundError } = await import('../../../shared/domain/errors');
        throw new NotFoundError('SLOT_NOT_FOUND', 'Availability slot not found');
      }

      const { date, startTime, endTime, region, regionJson, capacity, status } = parsed.data;
      const resolvedRegionJson = regionJson !== undefined
        ? regionJson
        : region !== undefined
          ? { name: region }
          : undefined;

      const updateData: Record<string, unknown> = {};
      if (date !== undefined) updateData.date = new Date(date);
      if (startTime !== undefined) updateData.startTime = startTime;
      if (endTime !== undefined) updateData.endTime = endTime;
      if (resolvedRegionJson !== undefined) updateData.regionJson = resolvedRegionJson;
      if (capacity !== undefined) updateData.capacity = capacity;
      if (status !== undefined) updateData.status = status;

      const result = await container.updateAvailabilitySlotUseCase.execute({
        inspectorId: slot.inspectorId,
        slotId: id,
        data: updateData as Parameters<typeof container.updateAvailabilitySlotUseCase.execute>[0]['data'],
        actor,
      });

      return reply.status(200).send(success({
        id: result.id,
        inspectorId: result.inspectorId,
        inspectorName: null,
        date: result.date instanceof Date ? result.date.toISOString().slice(0, 10) : String(result.date),
        startTime: result.startTime,
        endTime: result.endTime,
        region: extractRegion(result.regionJson),
        regionJson: result.regionJson,
        capacity: result.capacity,
        bookedCount: 0,
        status: result.status,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      }));
    },
  );

  // POST /v1/inspectors/:inspectorId/availability-slots
  app.post(
    '/v1/inspectors/:inspectorId/availability-slots',
    { preHandler: authenticate, schema: { params: z.object({ inspectorId: z.string().uuid() }), body: createAvailabilitySlotSchema, response: { 201: successResponseSchema(availabilitySlotResponseSchema) } } },
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
    { preHandler: authenticate, schema: { params: z.object({ inspectorId: z.string().uuid() }), querystring: listAvailabilitySlotsQuerySchema, response: { 200: paginatedResponseSchema(availabilitySlotResponseSchema) } } },
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
    { preHandler: authenticate, schema: { params: z.object({ inspectorId: z.string().uuid(), slotId: z.string().uuid() }), body: updateAvailabilitySlotSchema, response: { 200: successResponseSchema(availabilitySlotResponseSchema) } } },
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

  // POST /v1/inspectors/:inspectorId/link-user
  app.post(
    '/v1/inspectors/:inspectorId/link-user',
    { preHandler: authenticate, schema: { params: z.object({ inspectorId: z.string().uuid() }), body: linkInspectorToUserSchema } },
    async (request, reply) => {
      const params = inspectorIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid inspector ID',
          params.error.errors,
        );
      const parsed = linkInspectorToUserSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      await container.linkInspectorToUserUseCase.execute({
        inspectorId: params.data.inspectorId,
        userId: parsed.data.userId,
        actor: request.authContext!,
      });
      return reply.status(204).send();
    },
  );

  // POST /v1/inspectors/:inspectorId/deactivate
  app.post(
    '/v1/inspectors/:inspectorId/deactivate',
    { preHandler: authenticate, schema: { params: z.object({ inspectorId: z.string().uuid() }), body: deactivateSchema } },
    async (request, reply) => {
      const params = inspectorIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid inspector ID',
          params.error.errors,
        );
      const parsed = deactivateSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      const result = await container.deactivateInspectorUseCase.execute({
        inspectorId: params.data.inspectorId,
        reason: parsed.data.reason,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // GET /v1/inspectors/me — INSP self-fetch
  app.get(
    '/v1/inspectors/me',
    { preHandler: authenticate },
    async (request, reply) => {
      const actor = request.authContext!;
      if (actor.role !== 'INSP' || !actor.inspectorId) {
        throw new ForbiddenError('INSP_ONLY', 'This endpoint is only accessible to inspectors');
      }
      const result = await container.getInspectorUseCase.execute({
        inspectorId: actor.inspectorId,
        actor,
      });
      return reply.status(200).send(success(result));
    },
  );

  // PATCH /v1/inspectors/me — INSP self-update
  app.patch(
    '/v1/inspectors/me',
    {
      preHandler: authenticate,
      schema: { body: inspectorSelfUpdateSchema },
    },
    async (request, reply) => {
      const actor = request.authContext!;
      if (actor.role !== 'INSP' || !actor.inspectorId) {
        throw new ForbiddenError('INSP_ONLY', 'This endpoint is only accessible to inspectors');
      }
      const parsed = inspectorSelfUpdateSchema.safeParse(request.body);
      if (!parsed.success) throw new ValidationError('Request payload is invalid', parsed.error.errors);
      const result = await container.updateInspectorSelfProfileUseCase.execute({
        inspectorId: actor.inspectorId,
        data: parsed.data as Parameters<typeof container.updateInspectorSelfProfileUseCase.execute>[0]['data'],
        actor,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/inspectors/:inspectorId/photo/presign
  app.post(
    '/v1/inspectors/:inspectorId/photo/presign',
    {
      preHandler: authenticate,
      schema: {
        params: inspectorIdParam,
        body: z.object({ mimeType: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      const params = inspectorIdParam.safeParse(request.params);
      if (!params.success) throw new ValidationError('Invalid inspector ID', params.error.errors);
      const parsed = z.object({ mimeType: z.string().min(1) }).safeParse(request.body);
      if (!parsed.success) throw new ValidationError('Request payload is invalid', parsed.error.errors);
      const result = await container.generateInspectorPhotoUploadUrlUseCase.execute({
        inspectorId: params.data.inspectorId,
        mimeType: parsed.data.mimeType,
        actor: request.authContext!,
      });
      return reply.status(200).send(result);
    },
  );

  // POST /v1/inspectors/:inspectorId/photo/confirm
  app.post(
    '/v1/inspectors/:inspectorId/photo/confirm',
    {
      preHandler: authenticate,
      schema: {
        params: inspectorIdParam,
        body: z.object({ storageKey: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      const params = inspectorIdParam.safeParse(request.params);
      if (!params.success) throw new ValidationError('Invalid inspector ID', params.error.errors);
      const parsed = z.object({ storageKey: z.string().min(1) }).safeParse(request.body);
      if (!parsed.success) throw new ValidationError('Request payload is invalid', parsed.error.errors);
      const result = await container.confirmInspectorPhotoUploadUseCase.execute({
        inspectorId: params.data.inspectorId,
        storageKey: parsed.data.storageKey,
        actor: request.authContext!,
      });
      return reply.status(200).send(result);
    },
  );

  // POST /v1/inspectors/:inspectorId/documents/presign
  app.post(
    '/v1/inspectors/:inspectorId/documents/presign',
    {
      preHandler: authenticate,
      schema: {
        params: inspectorIdParam,
        body: z.object({
          kind: z.enum(['INSURANCE', 'POLICE_CHECK']),
          mimeType: z.string().min(1),
          fileName: z.string().min(1).max(255),
        }),
      },
    },
    async (request, reply) => {
      const params = inspectorIdParam.safeParse(request.params);
      if (!params.success) throw new ValidationError('Invalid inspector ID', params.error.errors);
      const bodySchema = z.object({
        kind: z.enum(['INSURANCE', 'POLICE_CHECK']),
        mimeType: z.string().min(1),
        fileName: z.string().min(1).max(255),
      });
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) throw new ValidationError('Request payload is invalid', parsed.error.errors);
      const result = await container.generateInspectorDocumentUploadUrlUseCase.execute({
        inspectorId: params.data.inspectorId,
        kind: parsed.data.kind,
        mimeType: parsed.data.mimeType,
        fileName: parsed.data.fileName,
        actor: request.authContext!,
      });
      return reply.status(200).send(result);
    },
  );

  // POST /v1/inspectors/:inspectorId/documents/confirm
  app.post(
    '/v1/inspectors/:inspectorId/documents/confirm',
    {
      preHandler: authenticate,
      schema: {
        params: inspectorIdParam,
        body: z.object({
          kind: z.enum(['INSURANCE', 'POLICE_CHECK']),
          storageKey: z.string().min(1),
          fileName: z.string().min(1).max(255),
        }),
      },
    },
    async (request, reply) => {
      const params = inspectorIdParam.safeParse(request.params);
      if (!params.success) throw new ValidationError('Invalid inspector ID', params.error.errors);
      const bodySchema = z.object({
        kind: z.enum(['INSURANCE', 'POLICE_CHECK']),
        storageKey: z.string().min(1),
        fileName: z.string().min(1).max(255),
      });
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) throw new ValidationError('Request payload is invalid', parsed.error.errors);
      const result = await container.confirmInspectorDocumentUploadUseCase.execute({
        inspectorId: params.data.inspectorId,
        kind: parsed.data.kind,
        storageKey: parsed.data.storageKey,
        fileName: parsed.data.fileName,
        actor: request.authContext!,
      });
      return reply.status(200).send(result);
    },
  );

  // GET /v1/inspectors/:inspectorId/documents/:kind/download
  app.get(
    '/v1/inspectors/:inspectorId/documents/:kind/download',
    {
      preHandler: authenticate,
      schema: {
        params: z.object({
          inspectorId: z.string().uuid(),
          kind: z.enum(['INSURANCE', 'POLICE_CHECK']),
        }),
        response: {
          200: z.object({
            downloadUrl: z.string().url(),
            fileName: z.string().nullable(),
          }),
        },
      },
    },
    async (request, reply) => {
      const paramsSchema = z.object({
        inspectorId: z.string().uuid(),
        kind: z.enum(['INSURANCE', 'POLICE_CHECK']),
      });
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) throw new ValidationError('Invalid params', params.error.errors);
      const result = await container.getInspectorDocumentDownloadUrlUseCase.execute({
        inspectorId: params.data.inspectorId,
        kind: params.data.kind,
        actor: request.authContext!,
      });
      return reply.status(200).send(result);
    },
  );
}
