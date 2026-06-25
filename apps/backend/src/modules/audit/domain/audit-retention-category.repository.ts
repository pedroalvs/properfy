import type { AuditRetentionCategory } from '@properfy/shared';
import type { AuditRetentionCategoryConfigEntity } from './audit-retention-category.entity';

export interface IAuditRetentionCategoryRepository {
  findAll(): Promise<AuditRetentionCategoryConfigEntity[]>;
  findByName(name: AuditRetentionCategory): Promise<AuditRetentionCategoryConfigEntity | null>;
  save(entity: AuditRetentionCategoryConfigEntity): Promise<void>;
  update(entity: AuditRetentionCategoryConfigEntity): Promise<void>;
}
