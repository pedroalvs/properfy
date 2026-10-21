/**
 * The `AuditService` / `AuditLogEntry` port now lives in `shared/domain/`
 * (see BE-5). This path is kept as a type-only re-export so existing
 * `import type { AuditService } from '.../shared/infrastructure/audit'` call
 * sites keep compiling with no runtime change. New code should import from
 * `shared/domain/audit`.
 */
export type { AuditLogEntry, AuditService } from '../domain/audit';
