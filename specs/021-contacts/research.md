# Research: 021-contacts

**Date**: 2026-04-12
**Status**: Complete — no critical unknowns remain.

## Research Items

### R1: `pg_trgm` extension availability on Supabase

**Decision**: Use `pg_trgm` for trigram search on `contacts.display_name`.

**Rationale**: Supabase PostgreSQL has `pg_trgm` enabled by default on all plans. The extension is one of the [pre-installed extensions](https://supabase.com/docs/guides/database/extensions). Creating the GIN index is a standard `CREATE INDEX ... USING gin (display_name gin_trgm_ops)`.

**Fallback**: If for any reason `pg_trgm` is not available at migration time, the migration should catch the error and create a B-tree index on `lower(display_name) varchar_pattern_ops` instead. This supports prefix search (`LIKE 'smith%'`) but not substring search (`LIKE '%smith%'`). Acceptable for < 500 contacts per tenant.

**Alternatives considered**:
- Full-text search (`tsvector`): overkill for display name search. `pg_trgm` is simpler and handles typo-tolerant matching.
- External search service (Elasticsearch, Meilisearch): unnecessary complexity for < 500 contacts per tenant.

### R2: Prisma multi-enum addition in a single migration

**Decision**: Add `ContactType`, `ContactChannelType`, and `AppointmentContactRole` enums in a single Prisma migration.

**Rationale**: Prisma supports multiple `enum` definitions in `schema.prisma` and generates a single migration SQL with multiple `CREATE TYPE` statements. No known conflicts with existing enums (`AppointmentStatus`, `TenantConfirmationStatus`, `RestrictionSource`, etc.). Verified by pattern matching against existing migrations in the codebase.

**Risk**: None. Prisma enum creation is additive and non-destructive.

### R3: Testcontainers PostGIS image + `pg_trgm`

**Decision**: The existing testcontainers PostGIS image (`postgis/postgis:16-3.4`) includes `pg_trgm` as a standard PostgreSQL contrib module. No image change needed.

**Rationale**: `pg_trgm` is a contrib extension bundled with every PostgreSQL distribution, including the PostGIS Docker images. `CREATE EXTENSION IF NOT EXISTS pg_trgm` succeeds without additional configuration.

### R4: Junction pattern impact on existing `ListAppointmentContactsUseCase`

**Decision**: The existing `ListAppointmentContactsUseCase` (used by the operator CRM workflow at `GET /v1/appointment-contacts`) will read from the revised junction shape. During the expand phase (before legacy column drop), it reads from snapshot fields. After column drop, the snapshot fields are the only source.

**Rationale**: The use case already returns a flat list of contact entries per appointment. The shape changes (field names), but the semantics don't. The pagination and tenant scoping remain identical.

**Impact**: Test fixtures need updating to seed junction-shaped rows. The API response shape changes (field renames: `tenantName` → `snapshotName`, `primaryEmail` → `snapshotEmail`, etc.) — this is a breaking change for API consumers. Handle via expand/contract: serve both old and new field names during the transition, deprecate old names, remove in a later deploy.

### R5: Appointment import worker compatibility

**Decision**: The appointment import worker (`import.worker.ts`) creates `appointment_contacts` rows with the legacy shape. During Phase 3 (consumer revisions), the import worker must be updated to create junction-shaped rows with inline contact creation.

**Rationale**: The import worker is a background process that creates appointments from CSV/XLSX rows. Each row includes contact fields (name, email, phone). The worker must be updated to:
1. Check if a registry contact with the same email already exists in the tenant.
2. If yes, link via `contactId`.
3. If no, create a new registry contact and link via the inline pattern.

This is a Phase 3 task, not a blocker for Phase 1 or 2.

## Summary

All research items resolved. No blockers for implementation. The plan can proceed to `/speckit.tasks`.
