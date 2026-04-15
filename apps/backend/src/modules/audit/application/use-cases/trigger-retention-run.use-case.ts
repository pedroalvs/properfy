import type { AuthContext } from '@properfy/shared';
import type { AuditRetentionWorker, AuditRetentionResult } from '../../infrastructure/workers/audit-retention.worker';
import type { PersistentAuditService } from '../services/persistent-audit.service';
import { RetentionPolicyForbiddenError } from '../../domain/audit.errors';

export interface TriggerRetentionRunInput {
  actor: AuthContext;
}

/**
 * Feature 020 US5: AM-only manual trigger for the retention worker.
 * Returns the run summary and emits `audit.retention_run_triggered_manually`.
 * The worker itself emits the usual `audit.retention_run_completed` entry.
 */
export class TriggerRetentionRunUseCase {
  constructor(
    private readonly worker: AuditRetentionWorker,
    private readonly auditService: PersistentAuditService,
  ) {}

  async execute(input: TriggerRetentionRunInput): Promise<AuditRetentionResult> {
    if (input.actor.role !== 'AM') throw new RetentionPolicyForbiddenError();

    this.auditService.log({
      actorType: 'USER',
      actorId: input.actor.userId,
      entityType: 'AuditRetention',
      action: 'audit.retention_run_triggered_manually',
      tenantId: input.actor.tenantId ?? undefined,
    });

    return this.worker.execute();
  }
}
