import type { AuthContext } from '@properfy/shared';
import type { IAuditPreservationRuleRepository } from '../../domain/audit-preservation-rule.repository';
import type { AuditPreservationRuleEntity } from '../../domain/audit-preservation-rule.entity';
import { RetentionPolicyForbiddenError } from '../../domain/audit.errors';

export interface ListPreservationRulesInput {
  actor: AuthContext;
}

/**
 * B6 #413: AM-only read of active preservation rules. Mirrors the AM-only RBAC
 * of its write sibling (`UpsertPreservationRuleUseCase`).
 */
export class ListPreservationRulesUseCase {
  constructor(private readonly repo: IAuditPreservationRuleRepository) {}

  async execute(input: ListPreservationRulesInput): Promise<AuditPreservationRuleEntity[]> {
    if (input.actor.role !== 'AM') throw new RetentionPolicyForbiddenError();
    return this.repo.findAllActive();
  }
}
