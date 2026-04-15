# Research: Appointment Time Slots

**Feature**: `012-appointment-time-slot`
**Date**: 2026-04-06

## Summary

No unknowns to resolve. All technologies, patterns, and dependencies are established in the existing Properfy codebase. This module follows the same Clean Architecture patterns as the other 11 features.

## Decisions

### 1. Overlap detection strategy

- **Decision**: Application-layer overlap check on create/update — query active slots in the same `(tenant_id, branch_id)` scope and reject if `new.startTime < existing.endTime AND new.endTime > existing.startTime`.
- **Rationale**: Postgres does not natively support range-overlap constraints without `EXCLUDE` + `btree_gist` extension. Application-layer check is simpler, consistent with the existing codebase pattern (e.g., pricing rule duplicate check), and avoids a Prisma migration to install the extension.
- **Alternatives considered**: (a) `EXCLUDE` constraint with `tsrange` — cleaner at the DB level but requires `btree_gist` extension and cannot be expressed in Prisma's schema DSL. (b) No overlap check — rejected per product decision 2026-04-06.

### 2. Effective-slot resolution caching

- **Decision**: No caching in Phase 1. The query fetches a small set (typically 2–10 rows) with an indexed lookup.
- **Rationale**: Low cardinality + indexed query = sub-50ms. Caching adds invalidation complexity for negligible gain.
- **Alternatives considered**: Redis/in-memory cache — rejected as over-engineering for the current scale.

### 3. RBAC model

- **Decision**: AM + OP (own tenant) + CL_ADMIN (own tenant) for writes. CL_USER read-only on effective endpoint. INSP forbidden.
- **Rationale**: Consistent with the existing pattern across features 002–004. CL_ADMIN write access is `implementation decision` — the dossiê does not explicitly define RBAC for time-slot management.
- **Alternatives considered**: Gating CL_ADMIN behind a tenant setting — deferred to GAP-003, aligned with the broader 001#GAP-003 permissions work.
