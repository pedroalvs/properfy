import type { AuthContext } from '@properfy/shared';
import type { IAuditRetentionCategoryRepository } from '../../domain/audit-retention-category.repository';
import type { AuditRetentionCategoryConfigEntity } from '../../domain/audit-retention-category.entity';
import { RetentionPolicyForbiddenError } from '../../domain/audit.errors';

export interface ListRetentionCategoriesInput {
  actor: AuthContext;
}

/**
 * B6 #413: AM-only read of the retention category registry. Mirrors the
 * AM-only RBAC of its write sibling (`UpsertRetentionCategoryUseCase`) so the
 * read and write paths share one gate.
 */
export class ListRetentionCategoriesUseCase {
  constructor(private readonly repo: IAuditRetentionCategoryRepository) {}

  async execute(input: ListRetentionCategoriesInput): Promise<AuditRetentionCategoryConfigEntity[]> {
    if (input.actor.role !== 'AM') throw new RetentionPolicyForbiddenError();
    return this.repo.findAll();
  }
}
