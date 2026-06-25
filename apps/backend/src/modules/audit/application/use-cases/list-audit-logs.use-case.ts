import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { IAuditLogRepository, AuditLogFilters, PaginationParams } from '../../domain/audit-log.repository';
import type { IPiiFieldMappingRepository } from '../../domain/pii-field-mapping.repository';
import { maskEmail, maskPhone, maskName, type AuditReaderRole } from '../../domain/pii-read-mask';
import { IncludeArchivedForbiddenError } from '../../domain/audit.errors';
import type { PiiFieldMappingEntity } from '../../domain/pii-field-mapping.entity';

export interface ListAuditLogsInput {
  filters: {
    entityType?: string;
    entityId?: string;
    actorId?: string;
    action?: string;
    fromDate?: string;
    toDate?: string;
    q?: string;
    includeArchived?: boolean;
  };
  pagination: PaginationParams;
  actor: AuthContext;
}

interface UserReader {
  findById(id: string): Promise<{ id: string; name: string } | null>;
}

interface TenantReader {
  findById(id: string): Promise<{ id: string; name: string } | null>;
}

export interface AuditLogOutput {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  reason: string | null;
  beforeJson: unknown | null;
  afterJson: unknown | null;
  requestId: string | null;
  ipAddress: string | null;
  metadataJson: Record<string, unknown> | null;
  createdAt: Date;
  /** Feature 020 FR-026: cold-tier marker for AM/OP audiences. */
  isArchived?: boolean;
}

export interface ListAuditLogsOutput {
  data: AuditLogOutput[];
  total: number;
}

export class ListAuditLogsUseCase {
  constructor(
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly userReader?: UserReader,
    private readonly piiFieldMappingRepo?: IPiiFieldMappingRepository,
    private readonly tenantReader?: TenantReader,
  ) {}

  async execute(input: ListAuditLogsInput): Promise<ListAuditLogsOutput> {
    const { actor, filters, pagination } = input;

    // AM, OP and CL_ADMIN can view audit logs
    if (actor.role !== 'AM' && actor.role !== 'OP' && actor.role !== 'CL_ADMIN') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions to view audit logs');
    }

    const includeArchived = filters.includeArchived === true;
    // FR-026a: CL_ADMIN is not allowed to opt into cold storage queries.
    if (includeArchived && actor.role === 'CL_ADMIN') {
      throw new IncludeArchivedForbiddenError();
    }

    // Strip includeArchived out of the filter set before building repo filters
    // — it's passed separately to `findAll` / `count` via options.
    const { includeArchived: _ignored, ...filterSubset } = filters;
    const repoFilters: AuditLogFilters = { ...filterSubset };

    // OP sees only their tenant's audit logs
    if (actor.role === 'OP' && actor.tenantId) {
      repoFilters.tenantId = actor.tenantId;
    }

    // CL_ADMIN always scoped to own tenant, ignoring any tenantId from filters
    if (actor.role === 'CL_ADMIN') {
      repoFilters.tenantId = actor.tenantId!;
    }

    const options = { includeArchived };
    const [data, total] = await Promise.all([
      this.auditLogRepo.findAll(repoFilters, pagination, options),
      this.auditLogRepo.count(repoFilters, options),
    ]);

    // Batch-fetch user names for actor resolution
    const userActorIds = [
      ...new Set(
        data
          .filter((e) => e.actorType === 'USER' && e.actorId)
          .map((e) => e.actorId!),
      ),
    ];
    const userMap = new Map<string, string>();
    if (this.userReader && userActorIds.length > 0) {
      await Promise.all(
        userActorIds.map(async (uid) => {
          const user = await this.userReader!.findById(uid);
          if (user) userMap.set(uid, user.name);
        }),
      );
    }

    // Batch-fetch tenant names
    const tenantIds = [
      ...new Set(data.filter((e) => e.tenantId).map((e) => e.tenantId!)),
    ];
    const tenantMap = new Map<string, string>();
    if (this.tenantReader && tenantIds.length > 0) {
      await Promise.all(
        tenantIds.map(async (tid) => {
          const tenant = await this.tenantReader!.findById(tid);
          if (tenant) tenantMap.set(tid, tenant.name);
        }),
      );
    }

    // Feature 020 FR-025: role-based read-time masking.
    // - AM: raw PII (no masking applied)
    // - OP: partial masks via `pii-read-mask.ts` (email/phone/name)
    // - CL_ADMIN: blanket [MASKED] sentinel (existing behavior pre-020)
    //
    // Entries already fully-redacted (`redactionStatus = FULL`) bypass masking
    // entirely — the stored `[REDACTED]` sentinel is returned as-is per FR-027.
    const role = actor.role as AuditReaderRole;
    const mappings =
      this.piiFieldMappingRepo && (role === 'AM' || role === 'OP')
        ? await this.piiFieldMappingRepo.findAll()
        : [];

    return {
      data: data.map((entry) => {
        const [beforeJson, afterJson] = this.applyReadMask(
          role,
          entry.action,
          entry.beforeJson,
          entry.afterJson,
          entry.redactionStatus,
          mappings,
        );
        return {
          id: entry.id,
          tenantId: entry.tenantId,
          tenantName: entry.tenantId ? tenantMap.get(entry.tenantId) ?? null : null,
          actorType: entry.actorType,
          actorId: entry.actorId,
          actorName:
            entry.actorType === 'USER'
              ? userMap.get(entry.actorId!) ?? null
              : entry.actorType === 'SYSTEM'
                ? 'System'
                : null,
          entityType: entry.entityType,
          entityId: entry.entityId,
          action: entry.action,
          reason: entry.reason,
          beforeJson,
          afterJson,
          requestId: entry.requestId,
          ipAddress: entry.ipAddress,
          metadataJson: entry.metadataJson,
          createdAt: entry.createdAt,
          isArchived: entry.isArchived || undefined,
        };
      }),
      total,
    };
  }

  /**
   * Applies role-based masking to a single entry's snapshots. Returns the
   * masked before/after pair.
   *
   * - `FULL` redaction entries pass through untouched (stored `[REDACTED]`).
   * - CL_ADMIN gets the blanket `[MASKED]` sentinel.
   * - AM passes through raw.
   * - OP walks each PII field path from the registry and applies the
   *   email/phone/name masker based on the field name.
   */
  private applyReadMask(
    role: AuditReaderRole,
    action: string,
    beforeJson: unknown,
    afterJson: unknown,
    redactionStatus: string,
    mappings: PiiFieldMappingEntity[],
  ): [unknown, unknown] {
    // FR-027: never re-mask on top of a fully-redacted entry.
    if (redactionStatus === 'FULL') {
      return [beforeJson, afterJson];
    }

    if (role === 'AM') {
      return [beforeJson, afterJson];
    }

    if (role === 'CL_ADMIN') {
      return ['[MASKED]', '[MASKED]'];
    }

    // OP: apply partial masks per registered field path for this action
    const applicable = mappings.filter((m) => m.appliesTo(action));
    if (applicable.length === 0) {
      return [beforeJson, afterJson];
    }

    return [
      this.maskSnapshot(beforeJson, applicable, role),
      this.maskSnapshot(afterJson, applicable, role),
    ];
  }

  private maskSnapshot(
    snapshot: unknown,
    applicable: PiiFieldMappingEntity[],
    role: AuditReaderRole,
  ): unknown {
    if (snapshot === null || snapshot === undefined) return snapshot;
    if (typeof snapshot !== 'object' || Array.isArray(snapshot)) return snapshot;

    const cloned = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
    for (const mapping of applicable) {
      this.maskPathInPlace(cloned, mapping.jsonFieldPath, role);
    }
    return cloned;
  }

  private maskPathInPlace(
    obj: Record<string, unknown>,
    path: string,
    role: AuditReaderRole,
  ): void {
    const parts = path.split('.');
    if (parts.length === 0) return;

    let current: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (current[part] === null || current[part] === undefined || typeof current[part] !== 'object') {
        return;
      }
      current = current[part] as Record<string, unknown>;
    }
    const leaf = parts[parts.length - 1]!;
    if (!(leaf in current)) return;
    const raw = current[leaf];
    if (raw === null || raw === undefined) return;

    // Choose the right masker based on the leaf name
    const lower = leaf.toLowerCase();
    if (lower.includes('email')) {
      current[leaf] = maskEmail(raw, role);
    } else if (lower.includes('phone')) {
      current[leaf] = maskPhone(raw, role);
    } else if (lower.includes('name')) {
      current[leaf] = maskName(raw, role);
    } else {
      // Unknown leaf shape — fall back to a generic [MASKED] sentinel for OP.
      current[leaf] = '[MASKED]';
    }
  }
}
