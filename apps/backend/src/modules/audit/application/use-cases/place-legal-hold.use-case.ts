import type { AuthContext } from '@properfy/shared';
import type { IAuditLegalHoldRepository } from '../../domain/audit-legal-hold.repository';
import type { PersistentAuditService } from '../services/persistent-audit.service';
import { AuditLegalHoldEntity } from '../../domain/audit-legal-hold.entity';
import { RetentionPolicyForbiddenError } from '../../domain/audit.errors';

export interface PlaceLegalHoldInput {
  entityType: string;
  entityId: string;
  tenantId: string | null;
  reason: string;
  actor: AuthContext;
}

/**
 * Feature 020 FR-010 / US5: AM-only creation of a legal hold on a specific
 * audit target. Emits `audit.legal_hold_placed`.
 */
export class PlaceLegalHoldUseCase {
  constructor(
    private readonly repo: IAuditLegalHoldRepository,
    private readonly auditService: PersistentAuditService,
  ) {}

  async execute(input: PlaceLegalHoldInput): Promise<string> {
    if (input.actor.role !== 'AM') throw new RetentionPolicyForbiddenError();

    const hold = new AuditLegalHoldEntity({
      id: crypto.randomUUID(),
      entityType: input.entityType,
      entityId: input.entityId,
      tenantId: input.tenantId,
      reason: input.reason,
      placedByUserId: input.actor.userId,
      placedAt: new Date(),
      releasedByUserId: null,
      releasedAt: null,
      isActive: true,
    });
    await this.repo.save(hold);

    this.auditService.log({
      actorType: 'USER',
      actorId: input.actor.userId,
      entityType: 'AuditLegalHold',
      entityId: hold.id,
      action: 'audit.legal_hold_placed',
      tenantId: input.actor.tenantId ?? undefined,
      after: {
        entityType: hold.entityType,
        entityId: hold.entityId,
        tenantId: hold.tenantId,
        reason: hold.reason,
      },
    });

    return hold.id;
  }
}
