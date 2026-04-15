import type { AuthContext, AuditRetentionCategory } from '@properfy/shared';
import type { IAuditRetentionCategoryRepository } from '../../domain/audit-retention-category.repository';
import type { PersistentAuditService } from '../services/persistent-audit.service';
import { AuditRetentionCategoryConfigEntity } from '../../domain/audit-retention-category.entity';
import {
  RetentionPolicyForbiddenError,
  RetentionPeriodTooShortError,
  RetentionCategoryNotFoundError,
} from '../../domain/audit.errors';
import { CATEGORY_MINIMUM_YEARS } from '../../domain/audit-retention';

export interface UpsertRetentionCategoryInput {
  name: AuditRetentionCategory;
  retentionYears: number;
  hardDeleteEnabled: boolean;
  description?: string | null;
  actionPatterns?: string[];
  actor: AuthContext;
}

/**
 * Feature 020 FR-007 / US5: AM-only upsert of a retention category
 * configuration. Enforces the statutory minimum retention floor from
 * `CATEGORY_MINIMUM_YEARS` and emits an `audit.retention_policy_updated`
 * entry with before/after snapshots.
 */
export class UpsertRetentionCategoryUseCase {
  constructor(
    private readonly repo: IAuditRetentionCategoryRepository,
    private readonly auditService: PersistentAuditService,
  ) {}

  async execute(input: UpsertRetentionCategoryInput): Promise<void> {
    if (input.actor.role !== 'AM') throw new RetentionPolicyForbiddenError();

    const minimum = CATEGORY_MINIMUM_YEARS[input.name];
    if (input.retentionYears < minimum) {
      throw new RetentionPeriodTooShortError(input.name, minimum);
    }

    const existing = await this.repo.findByName(input.name);
    if (!existing) {
      throw new RetentionCategoryNotFoundError(input.name);
    }

    const before = {
      retentionYears: existing.retentionYears,
      hardDeleteEnabled: existing.hardDeleteEnabled,
      description: existing.description,
      actionPatterns: existing.actionPatterns,
    };

    const updated = new AuditRetentionCategoryConfigEntity({
      id: existing.id,
      name: existing.name,
      retentionYears: input.retentionYears,
      hardDeleteEnabled: input.hardDeleteEnabled,
      description: input.description ?? existing.description,
      actionPatterns: input.actionPatterns ?? existing.actionPatterns,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    });
    await this.repo.update(updated);

    this.auditService.log({
      actorType: 'USER',
      actorId: input.actor.userId,
      entityType: 'AuditRetentionCategoryConfig',
      entityId: existing.id,
      action: 'audit.retention_policy_updated',
      tenantId: input.actor.tenantId ?? undefined,
      before,
      after: {
        retentionYears: updated.retentionYears,
        hardDeleteEnabled: updated.hardDeleteEnabled,
        description: updated.description,
        actionPatterns: updated.actionPatterns,
      },
    });
  }
}
