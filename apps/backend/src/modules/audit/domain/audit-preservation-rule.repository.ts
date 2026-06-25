import type { PreservationRuleType } from '@properfy/shared';
import type { AuditPreservationRuleEntity } from './audit-preservation-rule.entity';

export interface IAuditPreservationRuleRepository {
  findAllActive(): Promise<AuditPreservationRuleEntity[]>;
  findById(id: string): Promise<AuditPreservationRuleEntity | null>;
  findByType(ruleType: PreservationRuleType): Promise<AuditPreservationRuleEntity[]>;
  save(entity: AuditPreservationRuleEntity): Promise<void>;
  update(entity: AuditPreservationRuleEntity): Promise<void>;
  softDelete(id: string): Promise<void>;
}
