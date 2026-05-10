import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  contactRegistrySchema,
  contactRegistryUpdateSchema,
  ContactType,
  contactResponseSchema,
  contactListItemSchema,
  contactAppointmentItemSchema,
  contactPropertyAggregateSchema,
  paginationMetaSchema,
  successResponseSchema,
  paginatedResponseSchema,
  type ContactListItem,
  type ContactResponse,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../../shared/interfaces/auth-middleware';
import { success, paginated } from '../../../../shared/interfaces/response';
import type { CreateContactUseCase } from '../../application/use-cases/create-contact.use-case';
import type { UpdateContactUseCase } from '../../application/use-cases/update-contact.use-case';
import type { GetContactUseCase, GetContactOptions } from '../../application/use-cases/get-contact.use-case';
import type { ListContactsUseCase } from '../../application/use-cases/list-contacts.use-case';
import type { JwtService } from '../../../auth/application/services/jwt.service';
import type { ContactEntity } from '../../domain/contact.entity';

export interface ContactRouteContainer {
  createContactUseCase: CreateContactUseCase;
  updateContactUseCase: UpdateContactUseCase;
  getContactUseCase: GetContactUseCase;
  listContactsUseCase: ListContactsUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

const contactIdParam = z.object({ contactId: z.string().uuid() });

/**
 * 023 §FR-204/205 — `type` accepts a single value or an array (multiselect).
 * `branchIds` is an array of branch UUIDs; `primary` toggles the
 * "primary in some active appointment" filter. Fastify-zod parses query
 * arrays as either `?type=X&type=Y` or `?type[]=X&type[]=Y` — both shapes
 * arrive as `string[]` after validation.
 */
const listQuerySchema = z.object({
  search: z.string().optional(),
  type: z.union([z.nativeEnum(ContactType), z.array(z.nativeEnum(ContactType))]).optional(),
  branchIds: z.array(z.string().uuid()).optional(),
  primary: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  isActive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  tenantId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['displayName', 'createdAt', 'type']).default('displayName'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

const detailQuerySchema = z.object({
  includeAppointments: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  includeProperties: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  appointmentsPage: z.coerce.number().int().min(1).optional(),
  appointmentsPageSize: z.coerce.number().int().min(1).max(100).optional(),
  propertiesPage: z.coerce.number().int().min(1).optional(),
  propertiesPageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const detailResponseSchema = contactResponseSchema.extend({
  appointments: z
    .object({
      data: z.array(contactAppointmentItemSchema),
      pagination: paginationMetaSchema,
    })
    .optional(),
  properties: z
    .object({
      data: z.array(contactPropertyAggregateSchema),
      pagination: paginationMetaSchema,
    })
    .optional(),
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
    {
      preHandler: authenticate,
      schema: {
        body: contactRegistrySchema,
        response: { 201: successResponseSchema(contactResponseSchema) },
      },
    },
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
      // 024 §FR-301/308: AM/OP may pin to a tenant via `body.tenantId`,
      // omit it (defaults to standalone), or send `null` explicitly. CL roles
      // always resolve to the JWT tenant — `body.tenantId` is ignored for
      // them so a CL user cannot create across tenants by spoofing the body.
      const isCrossTenant = auth.role === 'AM' || auth.role === 'OP';
      const tenantId: string | null = isCrossTenant
        ? (parsed.tenantId ?? null)
        : (auth.tenantId as string);

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
        actorTenantId: auth.tenantId ?? null,
      });

      return reply.status(201).send(success(formatContact(contact)));
    },
  );

  // PATCH /v1/contacts/:contactId — update / deactivate / reactivate
  app.patch(
    '/v1/contacts/:contactId',
    {
      preHandler: authenticate,
      schema: {
        params: contactIdParam,
        body: contactRegistryUpdateSchema,
        response: { 200: successResponseSchema(contactResponseSchema) },
      },
    },
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

      // 024 §FR-303: AM/OP remain cross-tenant — pass null and let the use
      // case resolve the row's own tenant. CL roles get a `visibilityTenantId`
      // so the use case runs the operational-junction check before patching.
      const isCrossTenant = auth.role === 'AM' || auth.role === 'OP';
      const tenantId = isCrossTenant ? null : (auth.tenantId as string);
      const visibilityTenantId = isCrossTenant ? null : (auth.tenantId as string);

      const updated = await container.updateContactUseCase.execute({
        contactId,
        tenantId,
        visibilityTenantId,
        actorId: auth.userId,
        actorTenantId: auth.tenantId ?? null,
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
    {
      preHandler: authenticate,
      schema: {
        params: contactIdParam,
        response: { 200: successResponseSchema(contactResponseSchema) },
      },
    },
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

      // 024 §FR-303: same shape as the PATCH handler — CL roles get a
      // visibility tenant so the use case enforces operational reachability
      // before flipping `isActive`.
      const isCrossTenant = auth.role === 'AM' || auth.role === 'OP';
      const tenantId = isCrossTenant ? null : (auth.tenantId as string);
      const visibilityTenantId = isCrossTenant ? null : (auth.tenantId as string);

      const updated = await container.updateContactUseCase.execute({
        contactId,
        tenantId,
        visibilityTenantId,
        actorId: auth.userId,
        actorTenantId: auth.tenantId ?? null,
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
    {
      preHandler: authenticate,
      schema: {
        querystring: listQuerySchema,
        response: { 200: paginatedResponseSchema(contactListItemSchema) },
      },
    },
    async (request, reply) => {
      const auth = (request as any).authContext;
      if (!READ_ROLES.includes(auth.role)) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
      }

      // Fastify-zod has already validated and transformed the query before this
      // handler runs (e.g. `isActive` is a boolean, not the raw string). Re-parsing
      // with `.parse()` would re-validate the transformed values against the
      // pre-transform schema and reject them — use `request.query` directly.
      const query = request.query as z.infer<typeof listQuerySchema>;
      // 024 §FR-303: scope resolution moved into the use case
      // (`resolveScope`). AM/OP get a global view by default and may pin via
      // `query.tenantId`; CL_*roles stay pinned to JWT tenant via the
      // operational-junction predicate (the route doesn't decide visibility).
      const result = await container.listContactsUseCase.execute({
        actor: { role: auth.role, tenantId: auth.tenantId ?? null },
        tenantId: query.tenantId ?? null,
        type: query.type,
        branchIds: query.branchIds,
        primary: query.primary,
        isActive: query.isActive,
        search: query.search,
        page: query.page,
        pageSize: query.pageSize,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      });

      return reply.status(200).send(
        paginated(
          result.data.map((item) => formatListItem(item.contact, item.propertyCount, item.primaryInPropertyCount)),
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
    {
      preHandler: authenticate,
      schema: {
        params: contactIdParam,
        querystring: detailQuerySchema,
        response: { 200: successResponseSchema(detailResponseSchema) },
      },
    },
    async (request, reply) => {
      const auth = (request as any).authContext;
      if (!READ_ROLES.includes(auth.role)) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
      }

      const { contactId } = request.params as z.infer<typeof contactIdParam>;
      // Fastify-zod has already validated/transformed the query (see GET list).
      const query = request.query as z.infer<typeof detailQuerySchema>;
      // 024 §FR-303: AM/OP fetch by id directly (no tenant filter on the row).
      // CL roles fetch the row, then the use case enforces the operational-
      // junction visibility check via the `actor` option below.
      const isCrossTenant = auth.role === 'AM' || auth.role === 'OP';
      const tenantId = isCrossTenant ? null : (auth.tenantId as string);

      const options: GetContactOptions = {
        actor: { role: auth.role, tenantId: auth.tenantId ?? null },
      };
      if (query.includeAppointments) {
        options.includeAppointments = true;
        if (query.appointmentsPage || query.appointmentsPageSize) {
          options.appointmentsPagination = {
            page: query.appointmentsPage ?? 1,
            pageSize: query.appointmentsPageSize ?? 20,
          };
        }
      }
      if (query.includeProperties) {
        options.includeProperties = true;
        if (query.propertiesPage || query.propertiesPageSize) {
          options.propertiesPagination = {
            page: query.propertiesPage ?? 1,
            pageSize: query.propertiesPageSize ?? 20,
          };
        }
      }

      const result = await container.getContactUseCase.execute(contactId, tenantId, options);

      const response: Record<string, unknown> = formatContact(result.contact);
      if (result.appointments) {
        response.appointments = {
          data: result.appointments.data.map((a) => ({
            appointmentId: a.appointmentId,
            appointmentNumber: a.appointmentNumber,
            status: a.status,
            scheduledDate: a.scheduledDate.toISOString(),
            role: a.role,
            isPrimary: a.isPrimary,
            propertyId: a.propertyId,
            propertyCode: a.propertyCode,
          })),
          pagination: paginationMeta(
            result.appointments.total,
            result.appointments.page,
            result.appointments.pageSize,
          ),
        };
      }
      if (result.properties) {
        response.properties = {
          data: result.properties.data,
          pagination: paginationMeta(
            result.properties.total,
            result.properties.page,
            result.properties.pageSize,
          ),
        };
      }

      return reply.status(200).send(success(response));
    },
  );
}

function paginationMeta(total: number, page: number, pageSize: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

function formatContact(contact: ContactEntity): ContactResponse {
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

function formatListItem(
  contact: ContactEntity,
  propertyCount: number,
  primaryInPropertyCount: number,
): ContactListItem {
  return {
    id: contact.id,
    tenantId: contact.tenantId,
    type: contact.type,
    displayName: contact.displayName,
    company: contact.company,
    primaryEmail: contact.primaryEmail,
    primaryPhone: contact.primaryPhone,
    isActive: contact.isActive,
    propertyCount,
    primaryInPropertyCount,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}
