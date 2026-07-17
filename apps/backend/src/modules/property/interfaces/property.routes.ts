import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  addressSuggestionQuerySchema,
  addressSuggestionSchema,
  commitPropertyImportSchema,
  createPropertySchema,
  updatePropertySchema,
  listPropertiesQuerySchema,
  propertyImportPreviewResponseSchema,
  propertySummaryQuerySchema,
  propertySummaryResponseSchema,
  propertyResponseSchema,
  successResponseSchema,
  paginatedResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { success, paginated } from '../../../shared/interfaces/response';
import type { CreatePropertyUseCase } from '../application/use-cases/create-property.use-case';
import type { GetPropertyUseCase } from '../application/use-cases/get-property.use-case';
import type { ListPropertiesUseCase } from '../application/use-cases/list-properties.use-case';
import type { GetPropertySummaryUseCase } from '../application/use-cases/get-property-summary.use-case';
import type { UpdatePropertyUseCase } from '../application/use-cases/update-property.use-case';
import type { DeletePropertyUseCase } from '../application/use-cases/delete-property.use-case';
import type { GeocodePropertyUseCase } from '../application/use-cases/geocode-property.use-case';
import type { SearchAddressesUseCase } from '../application/use-cases/search-addresses.use-case';
import type { ImportPropertiesUseCase } from '../application/use-cases/import-properties.use-case';
import type { PreviewPropertyImportUseCase } from '../application/use-cases/preview-property-import.use-case';
import type { CommitPropertyImportUseCase } from '../application/use-cases/commit-property-import.use-case';
import type { GetPropertyImportStatusUseCase } from '../application/use-cases/get-property-import-status.use-case';
import type { ExportImportErrorsUseCase } from '../application/use-cases/export-import-errors.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

const importIdParam = z.object({ importId: z.string().uuid() });

export interface PropertyRouteContainer {
  createPropertyUseCase: CreatePropertyUseCase;
  getPropertyUseCase: GetPropertyUseCase;
  listPropertiesUseCase: ListPropertiesUseCase;
  getPropertySummaryUseCase: GetPropertySummaryUseCase;
  updatePropertyUseCase: UpdatePropertyUseCase;
  deletePropertyUseCase: DeletePropertyUseCase;
  geocodePropertyUseCase: GeocodePropertyUseCase;
  searchAddressesUseCase: SearchAddressesUseCase;
  importPropertiesUseCase: ImportPropertiesUseCase;
  previewPropertyImportUseCase: PreviewPropertyImportUseCase;
  commitPropertyImportUseCase: CommitPropertyImportUseCase;
  getPropertyImportStatusUseCase: GetPropertyImportStatusUseCase;
  exportImportErrorsUseCase: ExportImportErrorsUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean; settingsJson?: Record<string, unknown> } | null> };
}

const propertyIdParam = z.object({ propertyId: z.string().uuid() });

export async function registerPropertyRoutes(
  app: FastifyInstance,
  container: PropertyRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return (tenant?.settingsJson?.clUserPermissions as string[] | undefined) ?? [];
    },
  );

  app.get(
    '/v1/address/suggestions',
    {
      preHandler: authenticate,
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
      schema: {
        querystring: addressSuggestionQuerySchema,
        response: { 200: successResponseSchema(z.array(addressSuggestionSchema)) },
      },
    },
    async (request, reply) => {
      const parsed = addressSuggestionQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }

      const result = await container.searchAddressesUseCase.execute({
        query: parsed.data.q,
        limit: parsed.data.limit,
        country: parsed.data.country,
        actor: request.authContext!,
      });

      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/properties
  app.post(
    '/v1/properties',
    { preHandler: authenticate, schema: { body: createPropertySchema, response: { 201: successResponseSchema(propertyResponseSchema) } } },
    async (request, reply) => {
      const parsed = createPropertySchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      const result = await container.createPropertyUseCase.execute({
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(201).send(success(result));
    },
  );

  // GET /v1/properties
  app.get(
    '/v1/properties',
    { preHandler: authenticate, schema: { querystring: listPropertiesQuerySchema, response: { 200: paginatedResponseSchema(propertyResponseSchema) } } },
    async (request, reply) => {
      const parsed = listPropertiesQuerySchema.safeParse(request.query);
      if (!parsed.success)
        throw new ValidationError(
          'Invalid query parameters',
          parsed.error.errors,
        );
      const { page, pageSize, sortBy, sortOrder, ...filters } = parsed.data;
      const result = await container.listPropertiesUseCase.execute({
        filters,
        pagination: { page, pageSize, sortBy, sortOrder },
        actor: request.authContext!,
      });
      return reply
        .status(200)
        .send(paginated(result.data, result.total, page, pageSize));
    },
  );

  // GET /v1/properties/summary — counts by type, ignoring any type filter
  app.get(
    '/v1/properties/summary',
    { preHandler: authenticate, schema: { querystring: propertySummaryQuerySchema, response: { 200: successResponseSchema(propertySummaryResponseSchema) } } },
    async (request, reply) => {
      const parsed = propertySummaryQuerySchema.safeParse(request.query);
      if (!parsed.success)
        throw new ValidationError(
          'Invalid query parameters',
          parsed.error.errors,
        );
      const result = await container.getPropertySummaryUseCase.execute({
        filters: parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // GET /v1/properties/:propertyId
  app.get(
    '/v1/properties/:propertyId',
    { preHandler: authenticate, schema: { params: z.object({ propertyId: z.string().uuid() }), response: { 200: successResponseSchema(propertyResponseSchema) } } },
    async (request, reply) => {
      const params = propertyIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid property ID',
          params.error.errors,
        );
      const query = request.query as Record<string, string>;
      const result = await container.getPropertyUseCase.execute({
        propertyId: params.data.propertyId,
        tenantId: query.tenantId || undefined,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // PATCH /v1/properties/:propertyId
  app.patch(
    '/v1/properties/:propertyId',
    { preHandler: authenticate, schema: { params: z.object({ propertyId: z.string().uuid() }), body: updatePropertySchema, response: { 200: successResponseSchema(propertyResponseSchema) } } },
    async (request, reply) => {
      const params = propertyIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid property ID',
          params.error.errors,
        );
      const parsed = updatePropertySchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError(
          'Request payload is invalid',
          parsed.error.errors,
        );
      const result = await container.updatePropertyUseCase.execute({
        propertyId: params.data.propertyId,
        data: parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // DELETE /v1/properties/:propertyId
  app.delete(
    '/v1/properties/:propertyId',
    { preHandler: authenticate, schema: { params: z.object({ propertyId: z.string().uuid() }), response: { 204: z.null() } } },
    async (request, reply) => {
      const params = propertyIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid property ID',
          params.error.errors,
        );
      await container.deletePropertyUseCase.execute({
        propertyId: params.data.propertyId,
        actor: request.authContext!,
      });
      return reply.status(204).send();
    },
  );

  // POST /v1/properties/:propertyId/geocode — enqueue async geocoding
  app.post(
    '/v1/properties/:propertyId/geocode',
    { preHandler: authenticate, schema: { params: z.object({ propertyId: z.string().uuid() }) } },
    async (request, reply) => {
      const params = propertyIdParam.safeParse(request.params);
      if (!params.success)
        throw new ValidationError(
          'Invalid property ID',
          params.error.errors,
        );
      const result = await container.geocodePropertyUseCase.execute({
        propertyId: params.data.propertyId,
        actor: request.authContext!,
      });
      return reply.status(202).send(success(result));
    },
  );

  // POST /v1/properties/import — 202 (multipart file upload)
  app.post(
    '/v1/properties/import',
    {
      preHandler: authenticate,
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
      if (!idempotencyKey) {
        throw new ValidationError('Idempotency-Key header is required for import');
      }

      const data = await request.file();
      if (!data) {
        throw new ValidationError('File upload is required');
      }

      const fileBuffer = await data.toBuffer();
      const result = await container.importPropertiesUseCase.execute({
        fileBuffer,
        filename: data.filename,
        idempotencyKey,
        actor: request.authContext!,
      });
      return reply.status(202).send(success(result));
    },
  );

  // POST /v1/properties/import/preview — 200 (multipart: optional tenantId field + file)
  app.post(
    '/v1/properties/import/preview',
    {
      preHandler: authenticate,
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
      schema: {
        response: { 200: successResponseSchema(propertyImportPreviewResponseSchema) },
      },
    },
    async (request, reply) => {
      // Manual part-by-part iteration (not request.file(), which only reads
      // the first file part) so the tenantId form field is available
      // alongside the file regardless of field order in the multipart body.
      let fileBuffer: Buffer | undefined;
      let filename: string | undefined;
      let tenantId: string | undefined;

      for await (const part of request.parts()) {
        if (part.type === 'file') {
          fileBuffer = await part.toBuffer();
          filename = part.filename;
        } else if (part.fieldname === 'tenantId') {
          tenantId = String(part.value);
        }
      }

      if (!fileBuffer || !filename) {
        throw new ValidationError('File upload is required');
      }
      if (tenantId !== undefined && !z.string().uuid().safeParse(tenantId).success) {
        throw new ValidationError('Invalid multipart fields: tenantId must be a UUID');
      }

      const result = await container.previewPropertyImportUseCase.execute({
        fileBuffer,
        filename,
        ...(tenantId !== undefined ? { tenantId } : {}),
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/properties/import/:importId/commit — 202
  app.post(
    '/v1/properties/import/:importId/commit',
    {
      preHandler: authenticate,
      schema: {
        params: importIdParam,
        body: commitPropertyImportSchema,
      },
    },
    async (request, reply) => {
      const params = importIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid import ID', params.error.errors);
      }
      const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
      if (!idempotencyKey) {
        throw new ValidationError('Idempotency-Key header is required for commit');
      }
      const parsed = commitPropertyImportSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }

      const result = await container.commitPropertyImportUseCase.execute({
        importId: params.data.importId,
        skipInvalidRows: parsed.data.skipInvalidRows,
        idempotencyKey,
        actor: request.authContext!,
      });
      return reply.status(202).send(success(result));
    },
  );

  // GET /v1/properties/import/:importId — 200
  app.get(
    '/v1/properties/import/:importId',
    {
      preHandler: authenticate,
      schema: {
        params: importIdParam,
      },
    },
    async (request, reply) => {
      const params = importIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid import ID', params.error.errors);
      }
      const result = await container.getPropertyImportStatusUseCase.execute({
        importId: params.data.importId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // GET /v1/properties/import/:importId/errors.csv — download import errors as CSV
  app.get(
    '/v1/properties/import/:importId/errors.csv',
    {
      preHandler: authenticate,
      schema: {
        params: importIdParam,
      },
    },
    async (request, reply) => {
      const params = importIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid import ID', params.error.errors);
      }
      const csv = await container.exportImportErrorsUseCase.execute({
        importId: params.data.importId,
        actor: request.authContext!,
      });
      return reply
        .status(200)
        .header('Content-Type', 'text/csv')
        .header(
          'Content-Disposition',
          `attachment; filename="import-${params.data.importId}-errors.csv"`,
        )
        .send(csv);
    },
  );
}
