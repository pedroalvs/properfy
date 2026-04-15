import type { AuthContext } from '@properfy/shared';
import type { IAuditLogRepository } from '../../domain/audit-log.repository';
import { ForbiddenError } from '../../../../shared/domain/errors';

export interface ListRetentionRunsInput {
  page: number;
  pageSize: number;
  actor: AuthContext;
}

/**
 * Feature 020 US5: AM/OP-only view of historical retention runs. Reads
 * `audit.retention_run_completed` entries from the audit log as the source
 * of truth (the worker emits one per run with a complete summary).
 */
export class ListRetentionRunsUseCase {
  constructor(private readonly auditLogRepo: IAuditLogRepository) {}

  async execute(input: ListRetentionRunsInput): Promise<{
    data: Array<{
      id: string;
      createdAt: Date;
      summary: Record<string, unknown> | null;
    }>;
    total: number;
  }> {
    if (input.actor.role !== 'AM' && input.actor.role !== 'OP') {
      throw new ForbiddenError('FORBIDDEN', 'Only AM and OP can view retention runs');
    }

    const [entries, total] = await Promise.all([
      this.auditLogRepo.findAll(
        { action: 'audit.retention_run_completed' },
        { page: input.page, pageSize: input.pageSize, sortOrder: 'desc' },
        // Run history is append-only in hot audit logs; no need to span archive.
      ),
      this.auditLogRepo.count({ action: 'audit.retention_run_completed' }),
    ]);

    return {
      data: entries.map((e) => ({
        id: e.id,
        createdAt: e.createdAt,
        summary: e.metadataJson,
      })),
      total,
    };
  }
}
