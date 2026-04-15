import type { AuthContext, PreservationRuleType } from '@properfy/shared';
import type { IAuditPreservationRuleRepository } from '../../domain/audit-preservation-rule.repository';
import type { PersistentAuditService } from '../services/persistent-audit.service';
import { AuditPreservationRuleEntity } from '../../domain/audit-preservation-rule.entity';
import { RetentionPolicyForbiddenError } from '../../domain/audit.errors';

export interface UpsertPreservationRuleInput {
  id?: string;
  name: string;
  ruleType: PreservationRuleType;
  entityType: string | null;
  entityId: string | null;
  tenantId: string | null;
  isActive: boolean;
  actor: AuthContext;
}

/**
 * Feature 020 US5: AM-only upsert of an `AuditPreservationRule`. Emits
 * `audit.preservation_rule_upserted`.
 */
export class UpsertPreservationRuleUseCase {
  constructor(
    private readonly repo: IAuditPreservationRuleRepository,
    private readonly auditService: PersistentAuditService,
  ) {}

  async execute(input: UpsertPreservationRuleInput): Promise<string> {
    if (input.actor.role !== 'AM') throw new RetentionPolicyForbiddenError();

    const existing = input.id ? await this.repo.findById(input.id) : null;
    const before = existing
      ? {
          name: existing.name,
          ruleType: existing.ruleType,
          entityType: existing.entityType,
          entityId: existing.entityId,
          tenantId: existing.tenantId,
          isActive: existing.isActive,
        }
      : null;

    const entity = new AuditPreservationRuleEntity({
      id: existing?.id ?? crypto.randomUUID(),
      name: input.name,
      ruleType: input.ruleType,
      entityType: input.entityType,
      entityId: input.entityId,
      tenantId: input.tenantId,
      isActive: input.isActive,
      createdByUserId: existing?.createdByUserId ?? input.actor.userId,
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    });

    if (existing) {
      await this.repo.update(entity);
    } else {
      await this.repo.save(entity);
    }

    this.auditService.log({
      actorType: 'USER',
      actorId: input.actor.userId,
      entityType: 'AuditPreservationRule',
      entityId: entity.id,
      action: 'audit.preservation_rule_upserted',
      tenantId: input.actor.tenantId ?? undefined,
      before,
      after: {
        name: entity.name,
        ruleType: entity.ruleType,
        entityType: entity.entityType,
        entityId: entity.entityId,
        tenantId: entity.tenantId,
        isActive: entity.isActive,
      },
    });

    return entity.id;
  }
}
