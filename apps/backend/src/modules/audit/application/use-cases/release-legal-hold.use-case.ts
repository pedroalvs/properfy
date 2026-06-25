import type { AuthContext } from '@properfy/shared';
import type { IAuditLegalHoldRepository } from '../../domain/audit-legal-hold.repository';
import type { PersistentAuditService } from '../services/persistent-audit.service';
import {
  LegalHoldAlreadyReleasedError,
  RetentionPolicyForbiddenError,
} from '../../domain/audit.errors';
import { NotFoundError } from '../../../../shared/domain/errors';

export interface ReleaseLegalHoldInput {
  holdId: string;
  actor: AuthContext;
}

/**
 * Feature 020 FR-010 / US5: AM-only release of a legal hold. Emits
 * `audit.legal_hold_released`. Rejects if already released.
 */
export class ReleaseLegalHoldUseCase {
  constructor(
    private readonly repo: IAuditLegalHoldRepository,
    private readonly auditService: PersistentAuditService,
  ) {}

  async execute(input: ReleaseLegalHoldInput): Promise<void> {
    if (input.actor.role !== 'AM') throw new RetentionPolicyForbiddenError();

    const hold = await this.repo.findById(input.holdId);
    if (!hold) {
      throw new NotFoundError('LEGAL_HOLD_NOT_FOUND', 'Legal hold not found');
    }
    if (!hold.isActive) throw new LegalHoldAlreadyReleasedError();

    hold.release(input.actor.userId);
    await this.repo.update(hold);

    this.auditService.log({
      actorType: 'USER',
      actorId: input.actor.userId,
      entityType: 'AuditLegalHold',
      entityId: hold.id,
      action: 'audit.legal_hold_released',
      tenantId: input.actor.tenantId ?? undefined,
      after: {
        entityType: hold.entityType,
        entityId: hold.entityId,
        releasedAt: hold.releasedAt?.toISOString() ?? null,
      },
    });
  }
}
