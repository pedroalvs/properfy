import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  presignPropertyFileUploadSchema,
  presignPropertyFileUploadResponseSchema,
  confirmPropertyFileUploadSchema,
  addPropertyFileVersionSchema,
  listPropertyFilesQuerySchema,
  listPropertyFilesResponseSchema,
  propertyFileResponseSchema,
  propertyFileDownloadResponseSchema,
  successResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { success } from '../../../shared/interfaces/response';
import type { JwtService } from '../../auth/application/services/jwt.service';
import type { PresignPropertyFileUploadUseCase } from '../application/use-cases/presign-property-file-upload.use-case';
import type { ConfirmPropertyFileUploadUseCase } from '../application/use-cases/confirm-property-file-upload.use-case';
import type { ListPropertyFilesUseCase } from '../application/use-cases/list-property-files.use-case';
import type { GetPropertyFileDownloadUrlUseCase } from '../application/use-cases/get-property-file-download-url.use-case';
import type { AddPropertyFileVersionUseCase } from '../application/use-cases/add-property-file-version.use-case';
import type { DeletePropertyFileUseCase } from '../application/use-cases/delete-property-file.use-case';

export interface PropertyFileRouteContainer {
  presignPropertyFileUploadUseCase: Pick<PresignPropertyFileUploadUseCase, 'execute'>;
  confirmPropertyFileUploadUseCase: Pick<ConfirmPropertyFileUploadUseCase, 'execute'>;
  listPropertyFilesUseCase: Pick<ListPropertyFilesUseCase, 'execute'>;
  getPropertyFileDownloadUrlUseCase: Pick<GetPropertyFileDownloadUrlUseCase, 'execute'>;
  addPropertyFileVersionUseCase: Pick<AddPropertyFileVersionUseCase, 'execute'>;
  deletePropertyFileUseCase: Pick<DeletePropertyFileUseCase, 'execute'>;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

const idParam = z.object({ id: z.string().uuid() });

function idempotencyKey(request: FastifyRequest): string | undefined {
  const value = request.headers['idempotency-key'];
  return typeof value === 'string' ? value : undefined;
}

export async function registerPropertyFileRoutes(
  app: FastifyInstance,
  container: PropertyFileRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  app.post(
    '/v1/property-files/presign',
    {
      preHandler: authenticate,
      schema: {
        body: presignPropertyFileUploadSchema,
        response: { 201: successResponseSchema(presignPropertyFileUploadResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await container.presignPropertyFileUploadUseCase.execute({
        actor: request.authContext!,
        input: request.body as z.infer<typeof presignPropertyFileUploadSchema>,
      });
      return reply.status(201).send(success(result));
    },
  );

  app.post(
    '/v1/property-files/confirm',
    {
      preHandler: authenticate,
      schema: {
        body: confirmPropertyFileUploadSchema,
        response: { 200: successResponseSchema(propertyFileResponseSchema) },
      },
    },
    async (request, reply) => {
      const body = request.body as z.infer<typeof confirmPropertyFileUploadSchema>;
      const result = await container.confirmPropertyFileUploadUseCase.execute({
        actor: request.authContext!,
        fileId: body.fileId,
        idempotencyKey: idempotencyKey(request),
        requestId: request.id,
      });
      return reply.status(200).send(success(result));
    },
  );

  app.get(
    '/v1/property-files',
    {
      preHandler: authenticate,
      schema: {
        querystring: listPropertyFilesQuerySchema,
        response: { 200: successResponseSchema(listPropertyFilesResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await container.listPropertyFilesUseCase.execute({
        actor: request.authContext!,
        query: request.query as z.infer<typeof listPropertyFilesQuerySchema>,
      });
      return reply.status(200).send(success(result));
    },
  );

  app.get(
    '/v1/property-files/:id/download',
    {
      preHandler: authenticate,
      schema: {
        params: idParam,
        response: { 200: successResponseSchema(propertyFileDownloadResponseSchema) },
      },
    },
    async (request, reply) => {
      const { id } = request.params as z.infer<typeof idParam>;
      const result = await container.getPropertyFileDownloadUrlUseCase.execute({
        actor: request.authContext!,
        fileId: id,
      });
      return reply.status(200).send(success(result));
    },
  );

  app.post(
    '/v1/property-files/:id/versions',
    {
      preHandler: authenticate,
      schema: {
        params: idParam,
        body: addPropertyFileVersionSchema,
        response: { 201: successResponseSchema(presignPropertyFileUploadResponseSchema) },
      },
    },
    async (request, reply) => {
      const { id } = request.params as z.infer<typeof idParam>;
      const result = await container.addPropertyFileVersionUseCase.execute({
        actor: request.authContext!,
        sourceFileId: id,
        input: request.body as z.infer<typeof addPropertyFileVersionSchema>,
      });
      return reply.status(201).send(success(result));
    },
  );

  app.delete(
    '/v1/property-files/:id',
    { preHandler: authenticate, schema: { params: idParam } },
    async (request, reply) => {
      const { id } = request.params as z.infer<typeof idParam>;
      await container.deletePropertyFileUseCase.execute({
        actor: request.authContext!,
        fileId: id,
        requestId: request.id,
      });
      return reply.status(204).send();
    },
  );
}
