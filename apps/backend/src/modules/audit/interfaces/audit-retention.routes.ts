import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { paginationSchema } from '@properfy/shared';
import { createAuthMiddleware } from '../../../shared/interfaces/auth-middleware';
import { ValidationError } from '../../../shared/domain/errors';
import { paginated } from '../../../shared/interfaces/response';
import type { UpsertRetentionCategoryUseCase } from '../application/use-cases/upsert-retention-category.use-case';
import type { UpsertPreservationRuleUseCase } from '../application/use-cases/upsert-preservation-rule.use-case';
import type { PlaceLegalHoldUseCase } from '../application/use-cases/place-legal-hold.use-case';
import type { ReleaseLegalHoldUseCase } from '../application/use-cases/release-legal-hold.use-case';
import type { UpsertPiiFieldMappingUseCase } from '../application/use-cases/upsert-pii-field-mapping.use-case';
import type { TriggerRetentionRunUseCase } from '../application/use-cases/trigger-retention-run.use-case';
import type { ListRetentionRunsUseCase } from '../application/use-cases/list-retention-runs.use-case';
import type { IAuditRetentionCategoryRepository } from '../domain/audit-retention-category.repository';
import type { IAuditPreservationRuleRepository } from '../domain/audit-preservation-rule.repository';
import type { IAuditLegalHoldRepository } from '../domain/audit-legal-hold.repository';
import type { IPiiFieldMappingRepository } from '../domain/pii-field-mapping.repository';
import type { JwtService } from '../../auth/application/services/jwt.service';

/**
 * Feature 020 US5: AM-only operator controls for the retention subsystem.
 * Separate routes file for security visibility — every endpoint here is a
 * high-privilege operation on the retention/erasure policy surface.
 */
export interface AuditRetentionRouteContainer {
  upsertRetentionCategoryUseCase: UpsertRetentionCategoryUseCase;
  upsertPreservationRuleUseCase: UpsertPreservationRuleUseCase;
  placeLegalHoldUseCase: PlaceLegalHoldUseCase;
  releaseLegalHoldUseCase: ReleaseLegalHoldUseCase;
  upsertPiiFieldMappingUseCase: UpsertPiiFieldMappingUseCase;
  triggerRetentionRunUseCase: TriggerRetentionRunUseCase;
  listRetentionRunsUseCase: ListRetentionRunsUseCase;
  // Read-only repositories for the read endpoints
  retentionCategoryRepo: IAuditRetentionCategoryRepository;
  preservationRuleRepo: IAuditPreservationRuleRepository;
  legalHoldRepo: IAuditLegalHoldRepository;
  piiFieldMappingRepo: IPiiFieldMappingRepository;
  jwtService: JwtService;
  tenantRepo: { findById(id: string): Promise<{ isActive(): boolean } | null> };
}

// Input schemas
const upsertRetentionCategorySchema = z.object({
  retentionYears: z.number().int().positive(),
  hardDeleteEnabled: z.boolean(),
  description: z.string().nullable().optional(),
  actionPatterns: z.array(z.string()).optional(),
});

const upsertPreservationRuleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  // Sprint 1 W-5 (2026-04-13): `ACTIVE_DISPUTE` removed — see shared enum.
  ruleType: z.enum(['CROSS_CHECK', 'LEGAL_HOLD']),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  tenantId: z.string().uuid().nullable(),
  isActive: z.boolean(),
});

const placeLegalHoldSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  tenantId: z.string().uuid().nullable(),
  reason: z.string().min(1),
});

const upsertPiiFieldMappingSchema = z.object({
  id: z.string().uuid().optional(),
  actionPattern: z.string().min(1),
  jsonFieldPath: z.string().min(1),
  classification: z.enum(['direct', 'sensitive_financial', 'unstructured']),
  requiresManualReview: z.boolean(),
});

export async function registerAuditRetentionRoutes(
  app: FastifyInstance,
  container: AuditRetentionRouteContainer,
): Promise<void> {
  const authenticate = createAuthMiddleware(
    (token) => container.jwtService.verify(token),
    async (tenantId) => {
      const tenant = await container.tenantRepo.findById(tenantId);
      return tenant?.isActive() ?? false;
    },
  );

  // ─── Retention categories ────────────────────────────────────────────────
  app.get('/v1/audit-retention/categories', { preHandler: authenticate }, async (_req, reply) => {
    const categories = await container.retentionCategoryRepo.findAll();
    return reply.status(200).send(
      categories.map((c) => ({
        id: c.id,
        name: c.name,
        retentionYears: c.retentionYears,
        hardDeleteEnabled: c.hardDeleteEnabled,
        description: c.description,
        actionPatterns: c.actionPatterns,
      })),
    );
  });

  app.put('/v1/audit-retention/categories/:name', { preHandler: authenticate }, async (req, reply) => {
    const { name } = req.params as { name: string };
    const parsed = upsertRetentionCategorySchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid retention category input', parsed.error.errors);

    await container.upsertRetentionCategoryUseCase.execute({
      name: name as any,
      retentionYears: parsed.data.retentionYears,
      hardDeleteEnabled: parsed.data.hardDeleteEnabled,
      description: parsed.data.description ?? undefined,
      actionPatterns: parsed.data.actionPatterns,
      actor: req.authContext!,
    });
    return reply.status(200).send({ name });
  });

  // ─── Preservation rules ──────────────────────────────────────────────────
  app.get('/v1/audit-retention/rules', { preHandler: authenticate }, async (_req, reply) => {
    const rules = await container.preservationRuleRepo.findAllActive();
    return reply.status(200).send(
      rules.map((r) => ({
        id: r.id,
        name: r.name,
        ruleType: r.ruleType,
        entityType: r.entityType,
        entityId: r.entityId,
        tenantId: r.tenantId,
        isActive: r.isActive,
      })),
    );
  });

  app.post('/v1/audit-retention/rules', { preHandler: authenticate }, async (req, reply) => {
    const parsed = upsertPreservationRuleSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid preservation rule input', parsed.error.errors);

    const id = await container.upsertPreservationRuleUseCase.execute({
      ...parsed.data,
      actor: req.authContext!,
    });
    return reply.status(201).send({ id });
  });

  app.delete('/v1/audit-retention/rules/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    // Soft-delete via upsert with isActive=false
    const existing = await container.preservationRuleRepo.findById(id);
    if (!existing) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Preservation rule not found' } });
    }
    await container.upsertPreservationRuleUseCase.execute({
      id,
      name: existing.name,
      ruleType: existing.ruleType,
      entityType: existing.entityType,
      entityId: existing.entityId,
      tenantId: existing.tenantId,
      isActive: false,
      actor: req.authContext!,
    });
    return reply.status(204).send();
  });

  // ─── Legal holds ─────────────────────────────────────────────────────────
  app.post('/v1/audit-retention/legal-holds', { preHandler: authenticate }, async (req, reply) => {
    const parsed = placeLegalHoldSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid legal hold input', parsed.error.errors);
    const id = await container.placeLegalHoldUseCase.execute({
      ...parsed.data,
      actor: req.authContext!,
    });
    return reply.status(201).send({ id });
  });

  app.delete('/v1/audit-retention/legal-holds/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await container.releaseLegalHoldUseCase.execute({ holdId: id, actor: req.authContext! });
    return reply.status(204).send();
  });

  // ─── PII field mappings ──────────────────────────────────────────────────
  app.get('/v1/audit-retention/pii-mappings', { preHandler: authenticate }, async (_req, reply) => {
    const mappings = await container.piiFieldMappingRepo.findAll();
    return reply.status(200).send(
      mappings.map((m) => ({
        id: m.id,
        actionPattern: m.actionPattern,
        jsonFieldPath: m.jsonFieldPath,
        classification: m.classification,
        requiresManualReview: m.requiresManualReview,
      })),
    );
  });

  app.put('/v1/audit-retention/pii-mappings/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = upsertPiiFieldMappingSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid PII mapping input', parsed.error.errors);

    await container.upsertPiiFieldMappingUseCase.execute({
      id,
      ...parsed.data,
      actor: req.authContext!,
    });
    return reply.status(200).send({ id });
  });

  app.post('/v1/audit-retention/pii-mappings', { preHandler: authenticate }, async (req, reply) => {
    const parsed = upsertPiiFieldMappingSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid PII mapping input', parsed.error.errors);
    const id = await container.upsertPiiFieldMappingUseCase.execute({
      ...parsed.data,
      actor: req.authContext!,
    });
    return reply.status(201).send({ id });
  });

  // ─── Retention runs ──────────────────────────────────────────────────────
  app.get('/v1/audit-retention/runs', { preHandler: authenticate }, async (req, reply) => {
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError('Invalid pagination params', parsed.error.errors);
    const result = await container.listRetentionRunsUseCase.execute({
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      actor: req.authContext!,
    });
    return reply
      .status(200)
      .send(paginated(result.data, result.total, parsed.data.page, parsed.data.pageSize));
  });

  app.post('/v1/audit-retention/runs', { preHandler: authenticate }, async (req, reply) => {
    const result = await container.triggerRetentionRunUseCase.execute({ actor: req.authContext! });
    return reply.status(200).send(result);
  });
}
