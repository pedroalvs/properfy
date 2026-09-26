import type { AuthContext } from '@properfy/shared';
import type { IAuditPreservationRuleRepository } from '../../domain/audit-preservation-rule.repository';
import type { PersistentAuditService } from '../services/persistent-audit.service';
import {
  RetentionPolicyForbiddenError,
  PreservationRuleNotFoundError,
} from '../../domain/audit.errors';

export interface DeletePreservationRuleInput {
  id: string;
  actor: AuthContext;
}

/**
 * B6 #758: AM-only atomic soft delete of a preservation rule. Replaces the
 * previous DELETE handler that replayed the whole record through the upsert use
 * case (which could clobber concurrent field edits). The status write here is a
 * single-column soft delete; a `findById` is kept only to produce a 404 when
 * the rule does not exist.
 */
export class DeletePreservationRuleUseCase {
  constructor(
    private readonly repo: IAuditPreservationRuleRepository,
    private readonly auditService: PersistentAuditService,
  ) {}

  async execute(input: DeletePreservationRuleInput): Promise<void> {
    if (input.actor.role !== 'AM') throw new RetentionPolicyForbiddenError();

    const existing = await this.repo.findById(input.id);
    if (!existing) {
      throw new PreservationRuleNotFoundError();
    }

    await this.repo.softDelete(input.id);

    this.auditService.log({
      actorType: 'USER',
      actorId: input.actor.userId,
      entityType: 'AuditPreservationRule',
      entityId: input.id,
      action: 'audit.preservation_rule_deleted',
      tenantId: input.actor.tenantId ?? undefined,
      before: { isActive: existing.isActive },
      after: { isActive: false },
    });
  }
}
