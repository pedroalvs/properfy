import type { AuditRetentionCategory } from '@properfy/shared';
import { getCategoryForAction } from '../../domain/audit-retention';
import type { IAuditRetentionCategoryRepository } from '../../domain/audit-retention-category.repository';

/**
 * Feature 020 FR-001/FR-002: maps an audit `action` code to its retention
 * category.
 *
 * Strategy:
 *   1. Consult the DB-backed `AuditRetentionCategoryConfig` registry for any
 *      category whose `action_patterns_json` matches the action's prefix.
 *   2. If no registry match, fall back to the hardcoded mapping in
 *      `audit-retention.ts` (financial patterns → FINANCIAL, high-volume
 *      actions → OPERATIONAL_GENERAL, everything else → OPERATIONAL_CRITICAL).
 *
 * This use case is called synchronously from `PersistentAuditService.log()`
 * at write time (stamping `retention_category` on the entity before persist)
 * AND lazily by the retention worker when a row has `retention_category = NULL`
 * (lazy backfill for entries written before 020 shipped).
 */
export class ClassifyAuditActionUseCase {
  private cachedCategories: Array<{ name: AuditRetentionCategory; patterns: string[] }> | null = null;

  constructor(private readonly categoryRepo?: IAuditRetentionCategoryRepository) {}

  /**
   * Sync variant — uses only the hardcoded fallback. Called from the
   * write-path hot loop where an async DB call would block the caller.
   */
  classify(action: string): AuditRetentionCategory {
    return getCategoryForAction(action);
  }

  /**
   * Async variant — consults the DB-backed registry first, then falls back.
   * Used by the retention worker and administrative tools where the async
   * call is acceptable.
   */
  async classifyWithRegistry(action: string): Promise<AuditRetentionCategory> {
    if (this.categoryRepo) {
      const categories = await this.getCachedCategories();
      for (const cat of categories) {
        for (const pattern of cat.patterns) {
          if (pattern === '' || action.startsWith(pattern)) {
            return cat.name;
          }
        }
      }
    }
    return getCategoryForAction(action);
  }

  /** Reset the registry cache — invalidated when a category is upserted. */
  invalidateCache(): void {
    this.cachedCategories = null;
  }

  private async getCachedCategories(): Promise<
    Array<{ name: AuditRetentionCategory; patterns: string[] }>
  > {
    if (this.cachedCategories) return this.cachedCategories;
    if (!this.categoryRepo) return [];
    const rows = await this.categoryRepo.findAll();
    this.cachedCategories = rows.map((r) => ({ name: r.name, patterns: r.actionPatterns }));
    return this.cachedCategories;
  }
}
