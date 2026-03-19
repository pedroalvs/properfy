import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listFinancialEntriesQuerySchema,
  createManualAdjustmentSchema,
  createRefundSchema,
  generateInvoiceSchema,
  listInvoicesQuerySchema,
  financialEntryResponseSchema,
  invoiceResponseSchema,
  invoiceDownloadResponseSchema,
  successResponseSchema,
  paginatedResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { success, paginated } from '../../../shared/interfaces/response';
import type { GetFinancialSummaryUseCase } from '../application/use-cases/get-financial-summary.use-case';
import type { ListFinancialEntriesUseCase } from '../application/use-cases/list-financial-entries.use-case';
import type { GetFinancialEntryUseCase } from '../application/use-cases/get-financial-entry.use-case';
import type { ApproveFinancialEntryUseCase } from '../application/use-cases/approve-financial-entry.use-case';
import type { CreateManualAdjustmentUseCase } from '../application/use-cases/create-manual-adjustment.use-case';
import type { CreateRefundUseCase } from '../application/use-cases/create-refund.use-case';
import type { GenerateInvoiceUseCase } from '../application/use-cases/generate-invoice.use-case';
import type { ListInvoicesUseCase } from '../application/use-cases/list-invoices.use-case';
import type { GetInvoiceUseCase } from '../application/use-cases/get-invoice.use-case';
import type { DownloadInvoiceUseCase } from '../application/use-cases/download-invoice.use-case';
import type { CreateFinancialEntriesOnDoneUseCase } from '../application/use-cases/create-financial-entries-on-done.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface BillingRouteContainer {
  createFinancialEntriesOnDoneUseCase: CreateFinancialEntriesOnDoneUseCase;
  getFinancialSummaryUseCase: GetFinancialSummaryUseCase;
  listFinancialEntriesUseCase: ListFinancialEntriesUseCase;
  getFinancialEntryUseCase: GetFinancialEntryUseCase;
  approveFinancialEntryUseCase: ApproveFinancialEntryUseCase;
  createManualAdjustmentUseCase: CreateManualAdjustmentUseCase;
  createRefundUseCase: CreateRefundUseCase;
  generateInvoiceUseCase: GenerateInvoiceUseCase;
  listInvoicesUseCase: ListInvoicesUseCase;
  getInvoiceUseCase: GetInvoiceUseCase;
  downloadInvoiceUseCase: DownloadInvoiceUseCase;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

const entryIdParam = z.object({ entryId: z.string().uuid() });
const invoiceIdParam = z.object({ invoiceId: z.string().uuid() });

export async function registerBillingRoutes(
  app: FastifyInstance,
  container: BillingRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  // GET /v1/financial/entries/summary
  app.get(
    '/v1/financial/entries/summary',
    {
      preHandler: authenticate,
      schema: {
        querystring: z.object({ tenantId: z.string().uuid().optional() }),
        response: {
          200: successResponseSchema(
            z.object({
              totalDebits: z.number(),
              totalPayouts: z.number(),
              totalAdjustments: z.number(),
              totalRefunds: z.number(),
              pendingCount: z.number(),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const query = request.query as { tenantId?: string };
      const result = await container.getFinancialSummaryUseCase.execute({
        tenantId: query.tenantId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // GET /v1/financial/entries
  app.get(
    '/v1/financial/entries',
    { preHandler: authenticate, schema: { querystring: listFinancialEntriesQuerySchema, response: { 200: paginatedResponseSchema(financialEntryResponseSchema) } } },
    async (request, reply) => {
      const parsed = listFinancialEntriesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }
      const { page, pageSize } = parsed.data;
      const result = await container.listFinancialEntriesUseCase.execute({
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(paginated(result.data, result.total, page, pageSize));
    },
  );

  // GET /v1/financial/entries/:entryId
  app.get(
    '/v1/financial/entries/:entryId',
    { preHandler: authenticate, schema: { params: z.object({ entryId: z.string().uuid() }), response: { 200: successResponseSchema(financialEntryResponseSchema) } } },
    async (request, reply) => {
      const params = entryIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid entry ID', params.error.errors);
      }
      const result = await container.getFinancialEntryUseCase.execute({
        entryId: params.data.entryId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/financial/entries/:entryId/approve
  app.post(
    '/v1/financial/entries/:entryId/approve',
    { preHandler: authenticate, schema: { params: z.object({ entryId: z.string().uuid() }), response: { 200: successResponseSchema(financialEntryResponseSchema) } } },
    async (request, reply) => {
      const params = entryIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid entry ID', params.error.errors);
      }
      const result = await container.approveFinancialEntryUseCase.execute({
        entryId: params.data.entryId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/financial/entries/adjust
  app.post(
    '/v1/financial/entries/adjust',
    { preHandler: authenticate, schema: { body: createManualAdjustmentSchema, response: { 201: successResponseSchema(financialEntryResponseSchema) } } },
    async (request, reply) => {
      const parsed = createManualAdjustmentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
      const result = await container.createManualAdjustmentUseCase.execute({
        ...parsed.data,
        effectiveAt: parsed.data.effectiveAt ? new Date(parsed.data.effectiveAt) : undefined,
        idempotencyKey,
        actor: request.authContext!,
      });
      return reply.status(201).send(success(result));
    },
  );

  // POST /v1/financial/entries/:entryId/refund
  app.post(
    '/v1/financial/entries/:entryId/refund',
    { preHandler: authenticate, schema: { params: z.object({ entryId: z.string().uuid() }), body: createRefundSchema, response: { 201: successResponseSchema(financialEntryResponseSchema) } } },
    async (request, reply) => {
      const params = entryIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid entry ID', params.error.errors);
      }
      const parsed = createRefundSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
      const result = await container.createRefundUseCase.execute({
        entryId: params.data.entryId,
        ...parsed.data,
        idempotencyKey,
        actor: request.authContext!,
      });
      return reply.status(201).send(success(result));
    },
  );

  // GET /v1/invoices
  app.get(
    '/v1/invoices',
    { preHandler: authenticate, schema: { querystring: listInvoicesQuerySchema, response: { 200: paginatedResponseSchema(invoiceResponseSchema) } } },
    async (request, reply) => {
      const parsed = listInvoicesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }
      const { page, pageSize } = parsed.data;
      const result = await container.listInvoicesUseCase.execute({
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(paginated(result.data, result.total, page, pageSize));
    },
  );

  // POST /v1/invoices/generate
  app.post(
    '/v1/invoices/generate',
    { preHandler: authenticate, schema: { body: generateInvoiceSchema, response: { 202: successResponseSchema(invoiceResponseSchema) } } },
    async (request, reply) => {
      const parsed = generateInvoiceSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.generateInvoiceUseCase.execute({
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(202).send(success(result));
    },
  );

  // GET /v1/invoices/:invoiceId
  app.get(
    '/v1/invoices/:invoiceId',
    { preHandler: authenticate, schema: { params: z.object({ invoiceId: z.string().uuid() }), response: { 200: successResponseSchema(invoiceResponseSchema) } } },
    async (request, reply) => {
      const params = invoiceIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid invoice ID', params.error.errors);
      }
      const result = await container.getInvoiceUseCase.execute({
        invoiceId: params.data.invoiceId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // GET /v1/invoices/:invoiceId/download
  app.get(
    '/v1/invoices/:invoiceId/download',
    { preHandler: authenticate, schema: { params: z.object({ invoiceId: z.string().uuid() }), response: { 200: successResponseSchema(invoiceDownloadResponseSchema) } } },
    async (request, reply) => {
      const params = invoiceIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid invoice ID', params.error.errors);
      }
      const result = await container.downloadInvoiceUseCase.execute({
        invoiceId: params.data.invoiceId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );
}
