import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  contactRegistrySchema,
  contactRegistryUpdateSchema,
  ContactType,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../../shared/interfaces/auth-middleware';
import { success, paginated } from '../../../../shared/interfaces/response';
import type { CreateContactUseCase } from '../../application/use-cases/create-contact.use-case';
import type { UpdateContactUseCase } from '../../application/use-cases/update-contact.use-case';
import type { GetContactUseCase } from '../../application/use-cases/get-contact.use-case';
import type { ListContactsUseCase } from '../../application/use-cases/list-contacts.use-case';
import type { JwtService } from '../../../auth/application/services/jwt.service';

export interface ContactRouteContainer {
  createContactUseCase: CreateContactUseCase;
  updateContactUseCase: UpdateContactUseCase;
  getContactUseCase: GetContactUseCase;
  listContactsUseCase: ListContactsUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

const contactIdParam = z.object({ contactId: z.string().uuid() });

const listQuerySchema = z.object({
  search: z.string().optional(),
  type: z.nativeEnum(ContactType).optional(),
  isActive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  tenantId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['displayName', 'createdAt', 'type']).default('displayName'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

const WRITE_ROLES = ['AM', 'OP', 'CL_ADMIN'] as const;
const READ_ROLES = ['AM', 'OP', 'CL_ADMIN', 'CL_USER'] as const;

export async function registerContactRoutes(
  app: FastifyInstance,
  container: ContactRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  // POST /v1/contacts — create
  app.post(
    '/v1/contacts',
    { preHandler: authenticate },
    async (request, reply) => {
      const auth = (request as any).authContext;
      if (!WRITE_ROLES.includes(auth.role)) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
      }

      const bodyParsed = contactRegistrySchema.safeParse(request.body);
      if (!bodyParsed.success) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Request payload is invalid', details: bodyParsed.error.errors } });
      }
      const parsed = bodyParsed.data;
      const tenantId = auth.role === 'AM' && parsed.tenantId ? parsed.tenantId : auth.tenantId;

      if (!tenantId) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'tenantId is required for AM' } });
      }

      const contact = await container.createContactUseCase.execute({
        tenantId,
        type: parsed.type,
        displayName: parsed.displayName,
        company: parsed.company,
        primaryEmail: parsed.primaryEmail,
        primaryPhone: parsed.primaryPhone,
        additionalChannels: parsed.additionalChannels,
        notes: parsed.notes,
        actorId: auth.userId,
      });

      return reply.status(201).send(success(formatContact(contact)));
    },
  );

  // PATCH /v1/contacts/:contactId — update / deactivate / reactivate
  app.patch(
    '/v1/contacts/:contactId',
    { preHandler: authenticate },
    async (request, reply) => {
      const auth = (request as any).authContext;
      if (!WRITE_ROLES.includes(auth.role)) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
      }

      const paramsParsed = contactIdParam.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid contact ID', details: paramsParsed.error.errors } });
      }
      const { contactId } = paramsParsed.data;

      const bodyParsed = contactRegistryUpdateSchema.safeParse(request.body);
      if (!bodyParsed.success) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Request payload is invalid', details: bodyParsed.error.errors } });
      }

      const tenantId = auth.role === 'AM' ? null : auth.tenantId;

      const updated = await container.updateContactUseCase.execute({
        contactId,
        tenantId,
        actorId: auth.userId,
        data: bodyParsed.data,
      });

      if (!updated) {
        return reply.status(404).send({ error: { code: 'CONTACT_NOT_FOUND', message: 'Contact not found' } });
      }

      return reply.status(200).send(success(formatContact(updated)));
    },
  );

  // POST /v1/contacts/:contactId/deactivate — alias for PATCH {isActive:false} (QA-021-HIGH-002)
  app.post(
    '/v1/contacts/:contactId/deactivate',
    { preHandler: authenticate },
    async (request, reply) => {
      const auth = (request as any).authContext;
      if (!WRITE_ROLES.includes(auth.role)) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
      }

      const paramsParsed = contactIdParam.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid contact ID', details: paramsParsed.error.errors } });
      }
      const { contactId } = paramsParsed.data;

      const tenantId = auth.role === 'AM' ? null : auth.tenantId;

      const updated = await container.updateContactUseCase.execute({
        contactId,
        tenantId,
        actorId: auth.userId,
        data: { isActive: false },
      });

      if (!updated) {
        return reply.status(404).send({ error: { code: 'CONTACT_NOT_FOUND', message: 'Contact not found' } });
      }

      return reply.status(200).send(success(formatContact(updated)));
    },
  );

  // GET /v1/contacts — list + search
  app.get(
    '/v1/contacts',
    { preHandler: authenticate },
    async (request, reply) => {
      const auth = (request as any).authContext;
      if (!READ_ROLES.includes(auth.role)) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
      }

      const query = listQuerySchema.parse(request.query);
      const tenantId = auth.role === 'AM' && query.tenantId ? query.tenantId : auth.tenantId;

      const result = await container.listContactsUseCase.execute({
        tenantId,
        type: query.type,
        isActive: query.isActive,
        search: query.search,
        page: query.page,
        pageSize: query.pageSize,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      });

      return reply.status(200).send(
        paginated(
          result.data.map(formatContact),
          result.total,
          result.page,
          result.pageSize,
        ),
      );
    },
  );

  // GET /v1/contacts/:contactId — detail
  app.get(
    '/v1/contacts/:contactId',
    { preHandler: authenticate },
    async (request, reply) => {
      const auth = (request as any).authContext;
      if (!READ_ROLES.includes(auth.role)) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
      }

      const { contactId } = contactIdParam.parse(request.params);
      const tenantId = auth.role === 'AM' ? null : auth.tenantId;
      const includeAppointments = (request.query as any)?.includeAppointments === 'true';

      const result = await container.getContactUseCase.execute(contactId, tenantId, includeAppointments);

      const response: Record<string, unknown> = formatContact(result.contact);
      if (result.appointments) {
        response.appointments = result.appointments;
      }

      return reply.status(200).send(success(response));
    },
  );
}

function formatContact(contact: { id: string; tenantId: string; type: string; displayName: string; company: string | null; primaryEmail: string | null; primaryPhone: string | null; additionalChannels: unknown[]; notes: string | null; isActive: boolean; createdAt: Date; updatedAt: Date }) {
  return {
    id: contact.id,
    tenantId: contact.tenantId,
    type: contact.type,
    displayName: contact.displayName,
    company: contact.company,
    primaryEmail: contact.primaryEmail,
    primaryPhone: contact.primaryPhone,
    additionalChannels: contact.additionalChannels,
    notes: contact.notes,
    isActive: contact.isActive,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}
