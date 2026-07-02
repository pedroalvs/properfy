import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listFinancialEntriesQuerySchema,
  createManualAdjustmentSchema,
  createRefundSchema,
  cancelFinancialEntrySchema,
  markInvoicePaidSchema,
  batchMarkInvoicesPaidSchema,
  reverseInvoicePaymentSchema,
  reconciliationSummaryQuerySchema,
  generateInvoiceSchema,
  listInvoicesQuerySchema,
  voidFinancialEntrySchema,
  generateTenantInvoiceSchema,
  listTenantInvoicesQuerySchema,
  regenerateInvoiceSchema,
  rejectDraftInvoiceSchema,
  financialEntryResponseSchema,
  invoiceResponseSchema,
  tenantInvoiceResponseSchema,
  invoiceDownloadResponseSchema,
  successResponseSchema,
  paginatedResponseSchema,
} from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ForbiddenError, ValidationError } from '../../../shared/domain/errors';
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
import type { CancelFinancialEntryUseCase } from '../application/use-cases/cancel-financial-entry.use-case';
import type { MarkInvoicePaidUseCase } from '../application/use-cases/mark-invoice-paid.use-case';
import type { BatchMarkInvoicesPaidUseCase } from '../application/use-cases/batch-mark-invoices-paid.use-case';
import type { ReverseInvoicePaymentUseCase } from '../application/use-cases/reverse-invoice-payment.use-case';
import type { GetReconciliationSummaryUseCase } from '../application/use-cases/get-reconciliation-summary.use-case';
import type { CreateFinancialEntriesOnDoneUseCase } from '../application/use-cases/create-financial-entries-on-done.use-case';
import type { VoidFinancialEntryUseCase } from '../application/use-cases/void-financial-entry.use-case';
import type { GenerateTenantInvoiceUseCase } from '../application/use-cases/generate-tenant-invoice.use-case';
import type { RegenerateInspectorInvoiceUseCase } from '../application/use-cases/regenerate-inspector-invoice.use-case';
import type { RegenerateTenantInvoiceUseCase } from '../application/use-cases/regenerate-tenant-invoice.use-case';
import type { ListTenantInvoicesUseCase } from '../application/use-cases/list-tenant-invoices.use-case';
import type { ApproveDraftInvoiceUseCase } from '../application/use-cases/approve-draft-invoice.use-case';
import type { RejectDraftInvoiceUseCase } from '../application/use-cases/reject-draft-invoice.use-case';
import type { JwtService } from '../../auth/application/services/jwt.service';

export interface BillingRouteContainer {
  createFinancialEntriesOnDoneUseCase: CreateFinancialEntriesOnDoneUseCase;
  getFinancialSummaryUseCase: GetFinancialSummaryUseCase;
  listFinancialEntriesUseCase: ListFinancialEntriesUseCase;
  getFinancialEntryUseCase: GetFinancialEntryUseCase;
  approveFinancialEntryUseCase: ApproveFinancialEntryUseCase;
  cancelFinancialEntryUseCase: CancelFinancialEntryUseCase;
  createManualAdjustmentUseCase: CreateManualAdjustmentUseCase;
  createRefundUseCase: CreateRefundUseCase;
  generateInvoiceUseCase: GenerateInvoiceUseCase;
  listInvoicesUseCase: ListInvoicesUseCase;
  getInvoiceUseCase: GetInvoiceUseCase;
  downloadInvoiceUseCase: DownloadInvoiceUseCase;
  markInvoicePaidUseCase: MarkInvoicePaidUseCase;
  batchMarkInvoicesPaidUseCase: BatchMarkInvoicesPaidUseCase;
  reverseInvoicePaymentUseCase: ReverseInvoicePaymentUseCase;
  getReconciliationSummaryUseCase: GetReconciliationSummaryUseCase;
  voidFinancialEntryUseCase: VoidFinancialEntryUseCase;
  generateTenantInvoiceUseCase: GenerateTenantInvoiceUseCase;
  regenerateInspectorInvoiceUseCase: RegenerateInspectorInvoiceUseCase;
  regenerateTenantInvoiceUseCase: RegenerateTenantInvoiceUseCase;
  listTenantInvoicesUseCase: ListTenantInvoicesUseCase;
  approveDraftInvoiceUseCase: ApproveDraftInvoiceUseCase;
  rejectDraftInvoiceUseCase: RejectDraftInvoiceUseCase;
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
        querystring: z.object({
          tenantId: z.string().uuid().optional(),
          effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
          effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
        }),
        response: {
          200: successResponseSchema(
            z.object({
              totalDebits: z.number(),
              totalPayouts: z.number(),
              totalAdjustments: z.number(),
              totalRefunds: z.number(),
              pendingCount: z.number(),
              currency: z.string().length(3).nullable(),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const query = request.query as { tenantId?: string; effectiveFrom?: string; effectiveTo?: string };
      const result = await container.getFinancialSummaryUseCase.execute({
        tenantId: query.tenantId,
        effectiveFrom: query.effectiveFrom,
        effectiveTo: query.effectiveTo,
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
      const actor = request.authContext!;
      if (!['AM', 'OP', 'CL_ADMIN', 'INSP'].includes(actor.role)) {
        throw new ForbiddenError('FORBIDDEN', 'Not authorized to list financial entries');
      }
      const parsed = listFinancialEntriesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }
      const { page, pageSize } = parsed.data;
      const result = await container.listFinancialEntriesUseCase.execute({
        ...parsed.data,
        actor,
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
      const actor = request.authContext!;
      if (!['AM', 'OP'].includes(actor.role)) {
        throw new ForbiddenError('FORBIDDEN', 'Only AM and OP can approve financial entries');
      }
      const params = entryIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid entry ID', params.error.errors);
      }
      const result = await container.approveFinancialEntryUseCase.execute({
        entryId: params.data.entryId,
        actor,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/financial/entries/:entryId/cancel
  app.post(
    '/v1/financial/entries/:entryId/cancel',
    { preHandler: authenticate, schema: { params: z.object({ entryId: z.string().uuid() }), body: cancelFinancialEntrySchema } },
    async (request, reply) => {
      const params = entryIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid entry ID', params.error.errors);
      }
      const parsed = cancelFinancialEntrySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.cancelFinancialEntryUseCase.execute({
        entryId: params.data.entryId,
        reason: parsed.data.reason,
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
      const actor = request.authContext!;
      if (!['AM', 'OP'].includes(actor.role)) {
        throw new ForbiddenError('FORBIDDEN', 'Only AM and OP can create manual adjustments');
      }
      const parsed = createManualAdjustmentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
      const result = await container.createManualAdjustmentUseCase.execute({
        ...parsed.data,
        effectiveAt: parsed.data.effectiveAt ? new Date(parsed.data.effectiveAt) : undefined,
        idempotencyKey,
        actor,
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
        description: parsed.data.description,
        reason: parsed.data.reason,
        amount: parsed.data.amount,
        idempotencyKey,
        actor: request.authContext!,
      });
      return reply.status(201).send(success(result));
    },
  );

  // --- Canonical invoice routes: /v1/billing/invoices/* ---

  // GET /v1/billing/invoices
  app.get(
    '/v1/billing/invoices',
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

  // POST /v1/billing/invoices/generate
  app.post(
    '/v1/billing/invoices/generate',
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

  // GET /v1/billing/invoices/:invoiceId
  app.get(
    '/v1/billing/invoices/:invoiceId',
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

  // GET /v1/billing/invoices/:invoiceId/download
  app.get(
    '/v1/billing/invoices/:invoiceId/download',
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

  // POST /v1/billing/invoices/:invoiceId/mark-paid
  app.post(
    '/v1/billing/invoices/:invoiceId/mark-paid',
    { preHandler: authenticate, schema: { params: z.object({ invoiceId: z.string().uuid() }), body: markInvoicePaidSchema } },
    async (request, reply) => {
      const params = invoiceIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid invoice ID', params.error.errors);
      }
      const parsed = markInvoicePaidSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.markInvoicePaidUseCase.execute({
        invoiceId: params.data.invoiceId,
        paidAt: parsed.data.paidAt,
        paymentReference: parsed.data.paymentReference,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/billing/invoices/batch-mark-paid (feature 017 — US3)
  app.post(
    '/v1/billing/invoices/batch-mark-paid',
    { preHandler: authenticate, schema: { body: batchMarkInvoicesPaidSchema } },
    async (request, reply) => {
      const parsed = batchMarkInvoicesPaidSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.batchMarkInvoicesPaidUseCase.execute({
        invoiceIds: parsed.data.invoiceIds,
        paidAt: parsed.data.paidAt,
        paymentReference: parsed.data.paymentReference,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/billing/invoices/:invoiceId/reverse-payment (feature 017 — US4)
  app.post(
    '/v1/billing/invoices/:invoiceId/reverse-payment',
    { preHandler: authenticate, schema: { params: z.object({ invoiceId: z.string().uuid() }), body: reverseInvoicePaymentSchema } },
    async (request, reply) => {
      const params = invoiceIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid invoice ID', params.error.errors);
      }
      const parsed = reverseInvoicePaymentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.reverseInvoicePaymentUseCase.execute({
        invoiceId: params.data.invoiceId,
        reason: parsed.data.reason,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // GET /v1/billing/invoices/reconciliation-summary (feature 017 — US5)
  app.get(
    '/v1/billing/invoices/reconciliation-summary',
    { preHandler: authenticate, schema: { querystring: reconciliationSummaryQuerySchema } },
    async (request, reply) => {
      const parsed = reconciliationSummaryQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }
      const result = await container.getReconciliationSummaryUseCase.execute({
        from: parsed.data.from,
        to: parsed.data.to,
        inspectorId: parsed.data.inspectorId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/financial/entries/:entryId/void (GAP-006)
  app.post(
    '/v1/financial/entries/:entryId/void',
    { preHandler: authenticate, schema: { params: z.object({ entryId: z.string().uuid() }), body: voidFinancialEntrySchema, response: { 200: successResponseSchema(financialEntryResponseSchema.pick({ id: true, status: true })) } } },
    async (request, reply) => {
      const params = entryIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid entry ID', params.error.errors);
      }
      const parsed = voidFinancialEntrySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.voidFinancialEntryUseCase.execute({
        entryId: params.data.entryId,
        reason: parsed.data.reason,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // --- Tenant invoice routes: /v1/billing/tenant-invoices/* (GAP-004) ---

  // POST /v1/billing/tenant-invoices/generate
  app.post(
    '/v1/billing/tenant-invoices/generate',
    { preHandler: authenticate, schema: { body: generateTenantInvoiceSchema, response: { 202: successResponseSchema(tenantInvoiceResponseSchema) } } },
    async (request, reply) => {
      const parsed = generateTenantInvoiceSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.generateTenantInvoiceUseCase.execute({
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(202).send(success(result));
    },
  );

  // GET /v1/billing/tenant-invoices
  app.get(
    '/v1/billing/tenant-invoices',
    { preHandler: authenticate, schema: { querystring: listTenantInvoicesQuerySchema, response: { 200: paginatedResponseSchema(tenantInvoiceResponseSchema) } } },
    async (request, reply) => {
      const parsed = listTenantInvoicesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.errors);
      }
      const { page, pageSize } = parsed.data;
      const result = await container.listTenantInvoicesUseCase.execute({
        ...parsed.data,
        actor: request.authContext!,
      });
      return reply.status(200).send(paginated(result.data, result.total, page, pageSize));
    },
  );

  // --- Invoice regeneration routes (GAP-007) ---

  // POST /v1/billing/invoices/:invoiceId/regenerate
  app.post(
    '/v1/billing/invoices/:invoiceId/regenerate',
    { preHandler: authenticate, schema: { params: z.object({ invoiceId: z.string().uuid() }), body: regenerateInvoiceSchema, response: { 202: successResponseSchema(invoiceResponseSchema) } } },
    async (request, reply) => {
      const params = invoiceIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid invoice ID', params.error.errors);
      }
      const parsed = regenerateInvoiceSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.regenerateInspectorInvoiceUseCase.execute({
        invoiceId: params.data.invoiceId,
        reason: parsed.data.reason,
        actor: request.authContext!,
      });
      return reply.status(202).send(success(result));
    },
  );

  // POST /v1/billing/tenant-invoices/:invoiceId/regenerate
  app.post(
    '/v1/billing/tenant-invoices/:invoiceId/regenerate',
    { preHandler: authenticate, schema: { params: z.object({ invoiceId: z.string().uuid() }), body: regenerateInvoiceSchema, response: { 202: successResponseSchema(tenantInvoiceResponseSchema) } } },
    async (request, reply) => {
      const params = invoiceIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid invoice ID', params.error.errors);
      }
      const parsed = regenerateInvoiceSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.regenerateTenantInvoiceUseCase.execute({
        invoiceId: params.data.invoiceId,
        reason: parsed.data.reason,
        actor: request.authContext!,
      });
      return reply.status(202).send(success(result));
    },
  );

  // POST /v1/billing/invoices/:invoiceId/approve-draft
  app.post(
    '/v1/billing/invoices/:invoiceId/approve-draft',
    { preHandler: authenticate, schema: { params: z.object({ invoiceId: z.string().uuid() }) } },
    async (request, reply) => {
      const params = invoiceIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid invoice ID', params.error.errors);
      }
      const result = await container.approveDraftInvoiceUseCase.execute({
        invoiceId: params.data.invoiceId,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );

  // POST /v1/billing/invoices/:invoiceId/reject-draft
  app.post(
    '/v1/billing/invoices/:invoiceId/reject-draft',
    { preHandler: authenticate, schema: { params: z.object({ invoiceId: z.string().uuid() }), body: rejectDraftInvoiceSchema } },
    async (request, reply) => {
      const params = invoiceIdParam.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid invoice ID', params.error.errors);
      }
      const parsed = rejectDraftInvoiceSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Request payload is invalid', parsed.error.errors);
      }
      const result = await container.rejectDraftInvoiceUseCase.execute({
        invoiceId: params.data.invoiceId,
        reason: parsed.data.reason,
        actor: request.authContext!,
      });
      return reply.status(200).send(success(result));
    },
  );
}
