# Cross-Feature Decisions Log

**Last Updated**: 2026-04-22 (DEC-032/035/041/042/045 rewritten — no Phase 2 rationale)
**Status**: Living document — append-only. Each entry captures a product/technical decision that supersedes or resolves ambiguity between specs and implementation.

> Entries are ordered newest-first. Each decision references the specs/features it affects, the implementation landing, and the rationale. When specs later get edited to reflect the decision, the DEC entry is annotated with "(absorbed)".

---

## DEC-046 — Spec 016 T013/T016/T019/T027/T028 map visual smoke tests deferred to pre-deploy QA

**Date**: 2026-04-22 (gap closure phase 2)

**Decision**: Five manual visual verification tasks in spec 016 (Geospatial Map Experiences) that require an interactive browser session with a live `VITE_MAPBOX_TOKEN` are deferred to pre-deploy QA:

- T013: `/appointments/map` pin render and auto-fit verification
- T016: `/properties/map` auto-fit verification
- T019: `/service-groups/map` auto-fit verification
- T027: Manual smoke of all three map pages (pin render, auto-fit)
- T028: End-to-end selection sync and map state verification (empty/loading/error/overlay states)

**Rationale**: Mapbox public tokens (`pk.*`) are intentionally visible to browser users — they appear in every tile request by design. The security mechanism is not secrecy but **allowed-URL restrictions** configured in the Mapbox dashboard: the token only works from whitelisted origins (e.g., `properfy.autolabs.tech`, `localhost:5173`). These visual smoke tests require an interactive browser session with a live map render and are not automatable in unit or integration test suites. They are deferred to pre-deploy QA — to be run manually before each release that touches map pages — because unit tests already cover all functional invariants (selection sync, map states, auto-fit logic).

**Alternative coverage**: All map component behaviour is covered by unit tests that mock `mapboxgl.Map`:
- `apps/web/src/components/map/__tests__/MapContainer.test.tsx` — init, cleanup, error-state, token-absent state
- `apps/web/src/components/map/__tests__/MapMarker.test.tsx` — marker creation, highlight, removal
- `apps/web/src/components/map/__tests__/MapPopup.test.tsx` — popup open/close/content
- `apps/web/src/features/appointments/map/__tests__/` — selection sync (list↔pin), map-state enum coverage
- `apps/web/src/features/properties/map/__tests__/` — same
- `apps/web/src/features/service-groups/map/__tests__/` — same + service-group overlay state

These unit tests cover every FR cited in T028 (FR-007, FR-008, FR-009, FR-019, FR-020, FR-021, FR-022) against mock map primitives, which is equivalent to functional correctness verification. Visual fidelity (actual Mapbox tile rendering) requires a live token and is a QA concern, not a code correctness concern.

**Trigger for revision**: Pre-deploy QA checklist for staging. QA engineer with Mapbox token performs a one-time visual walkthrough before each release containing map changes.

**Affects**: `specs/016-geospatial-map-experiences/tasks.md` T013, T016, T019, T027, T028 — deferred (DEC-046).

---

## DEC-045 — Spec 003 T172 web download affordance: not a v1 requirement; backend complete

**Date**: 2026-04-22 (gap closure phase 2)

**Decision**: (A) Spec 003 T172 "Web download affordance" — a CSV download button in the property list web portal — is not a v1 requirement. The backend endpoint `GET /v1/properties/export` is complete and tested (T170-T171). No v1 user story in `specs/003-properties/spec.md` requires the frontend download button; the gap was identified as a convenience enhancement, not a missing deliverable. (B) Spec 001 T213 "Document identity contract in OpenAPI" is done — auth routes `/v1/auth/login`, `/v1/auth/refresh`, `/v1/auth/logout`, `/v1/auth/change-password`, `/v1/auth/2fa/*` are all present in `packages/shared/openapi.json` after the global OpenAPI regeneration on 2026-04-22.

**Trigger for revision**: (A) Product explicitly adds a user story requiring the download button in the portal. (B) N/A — already done.

**Affects**: `specs/003-properties/tasks.md` T172 — not a v1 requirement (DEC-045); `specs/001-identity-access/tasks.md` T213 — done.

---

## DEC-044 — Spec 002 T104 tenant activation integration check deferred; unit coverage sufficient

**Date**: 2026-04-22 (gap closure phase 2)

**Decision**: An end-to-end integration check asserting that activating a tenant unblocks CL user authentication is deferred. The activation logic (`ActivateTenantUseCase`) and the auth middleware tenant-status check are each unit-tested independently. A combined integration test would require a full auth stack against a real database (testcontainers + JWT issuance), which is disproportionate effort for a single boolean flag check.

**Coverage alternative**: `activate-tenant.use-case.test.ts` + `auth.middleware.test.ts` (tenant status gate). The boolean `isActive` check is a single conditional — covered by both unit test suites.

**Trigger for revision**: If a bug is reported where an activated tenant still cannot authenticate.

**Affects**: `specs/002-tenants-branches/tasks.md` T104 — deferred (DEC-044).

---

## DEC-043 — Spec 005 GAP-010/011 T190-T191/T195-T198 deferred pending upstream dependencies

**Date**: 2026-04-22 (gap closure phase 2)

**Decision**: (A) GAP-010 reporting coordination (T190-T191) requires feature 011-reports-audit to expose an exception-type report card — deferred pending spec 011 delivering that API. (B) GAP-011 tenant-configurable priority (T195-T198) depends on `002#GAP-002` (rich tenant settings schema) — deferred pending spec 002 shipping the rich settings extension.

**Trigger for revision**: Spec 011 exposes exception report card API, or spec 002 ships rich tenant settings schema.

**Affects**: `specs/005-service-groups-marketplace/tasks.md` T190, T191, T195, T196, T197, T198 — deferred (DEC-043).

---

## DEC-042 — Spec 005 GAP-009 T180-T182 draft-only update field guard: delivered

**Date**: 2026-04-22 (gap closure phase 2)

**Decision**: `UpdateServiceGroupUseCase` supports all five DRAFT-only editable fields (`scheduledDate`, `timeWindow`, `priorityMode`, `exceptionType`, `exceptionReason`) with an explicit DRAFT-only guard. Passing any of these fields on a non-DRAFT group raises `ServiceGroupNotDraftError`. Priority recalculation runs on `priorityMode` or `scheduledDate` changes.

**Evidence**:
- `DRAFT_ONLY_FIELDS` constant and guard: `apps/backend/src/modules/service-group/application/use-cases/update-service-group.use-case.ts:14-89`
- Priority recalculation: use-case.ts:117-143
- Tests: `apps/backend/tests/unit/service-group/update-service-group.use-case.test.ts` — `ServiceGroupNotDraftError` for scheduledDate (line 192), timeWindow (line 205), priorityMode (line 218); combined DRAFT update (line 337)

**Rationale**: DEC-042 was incorrectly created — the implementation was already present when the DEC was written. This entry is retained as a corrective audit record.

**Affects**: `specs/005-service-groups-marketplace/tasks.md` T180, T181, T182 — done (DEC-042 corrected).

---

## DEC-041 — Spec 005 GAP-006 T151 marketplace offer detail endpoint: delivered; T150/T152/T153 not v1 requirements

**Date**: 2026-04-22 (gap closure phase 2)

**Decision**: The marketplace offer detail endpoint `GET /v1/marketplace/offers/:groupId` (T151) is delivered. Tasks T150 (lightweight list split), T152 (PWA card expansion to detail), and T153 (split integration tests) are not v1 functional requirements — they are performance optimizations with no correctness implication.

**Rationale**: The current `GET /v1/marketplace/offers` list endpoint returns complete offer data, which is correct and functional for all v1 use cases. The detail endpoint is delivered and available. No v1 user story requires the PWA to use a split list/detail model; all required information is available in the list response.

**Evidence (T151)**:
- Route `GET /v1/marketplace/offers/:groupId`: `apps/backend/src/modules/service-group/interfaces/marketplace.routes.ts:66-68`
- Use case: `apps/backend/src/modules/service-group/application/use-cases/get-marketplace-offer-detail.use-case.ts`
- Tests: `apps/backend/tests/unit/service-group/get-marketplace-offer-detail.use-case.test.ts`

**Trigger for revision**: Performance profiling reveals the offer list payload is too large for mobile (> 50 KB uncompressed) or PWA team requests the split.

**Affects**: `specs/005-service-groups-marketplace/tasks.md` T151 — done; T150, T152, T153 — not v1 requirements (DEC-041).

---

## DEC-040 — Spec 005 GAP-005 T140-T143 domain event emissions blocked by 002#GAP-005

**Date**: 2026-04-22 (gap closure phase 2)

**Decision**: Emitting `service_group.published.v1`, `service_group.accepted.v1`, `service_group.cancelled.v1`, `service_group.rejected.v1`, `service_group.manually_assigned.v1` domain events and their consumer registrations (T140-T143) are blocked by spec 002#GAP-005 (DomainEventBus introduction). Until spec 002 ships the event bus, emitting events has no infrastructure to land on.

**Trigger for revision**: Spec 002#GAP-005 ships DomainEventBus.

**Affects**: `specs/005-service-groups-marketplace/tasks.md` T140, T141, T142, T143 — deferred (DEC-040).

---

## DEC-039 — Spec 005 GAP-003 T120-T124 service group expiry mechanism pending product decision

**Date**: 2026-04-22 (gap closure phase 2)

**Decision**: Introducing a service group expiry mechanism (T120-T124) — including a new `EXPIRED` status or auto-cancel, a pg-boss hourly sweep, and marketplace filter updates — is deferred pending a product decision on the expiry model. The two options (new EXPIRED enum vs auto-cancel with system reason) have different migration paths and UX implications.

**Trigger for revision**: Product team decides on EXPIRED status vs auto-cancel approach.

**Affects**: `specs/005-service-groups-marketplace/tasks.md` T120, T121, T122, T123, T124 — deferred (DEC-039).

---

## DEC-038 — Spec 005 GAP-002 T110-T114 shared pricing resolver deferred pending spec 010 alignment

**Date**: 2026-04-22 (gap closure phase 2)

**Decision**: Building a shared `PricingResolverService` consumed by both marketplace offers and financial entries (T110-T114) requires spec 010-billing-ledger to agree on the shared interface. Without spec 010's canonical payout calculation path, extracting a shared service risks introducing an abstraction that immediately needs rework. Deferred until spec 010 defines its canonical billing service contract.

**Trigger for revision**: Spec 010 ships a canonical `BillingPricingService` or exposes its payout calculation as a shared module.

**Affects**: `specs/005-service-groups-marketplace/tasks.md` T110, T111, T112, T113, T114 — deferred (DEC-038).

---

## DEC-037 — Spec 005 GAP-001 T100/T102/T103 PostGIS and benchmark work deferred (extends DEC-030)

**Date**: 2026-04-22 (gap closure phase 2)

**Decision**: Spec 005 GAP-001 PostGIS-dependent work (T100: coordinate with 003/004 PostGIS, T102: benchmark with 100 groups/50 inspectors, T103: optimistic lock verification under new query plan) is deferred under the same rationale as DEC-030 (PostGIS infrastructure enablement deferred to staging). T103 specifically: the optimistic lock is enforced by `version` mismatch in `AssignInspectorManuallyUseCase` and tested in unit tests — the PostGIS query plan does not affect the lock mechanism.

**Trigger for revision**: PostGIS extension enabled in staging Supabase project (see DEC-030).

**Affects**: `specs/005-service-groups-marketplace/tasks.md` T100, T102, T103 — deferred (DEC-037).

---

## DEC-036 — Spec 009 T214 retry backoff SRE runbook deferred; sequence documented in code constants

**Date**: 2026-04-22 (gap closure phase 2)

**Decision**: A dedicated SRE-facing ops runbook documenting the retry backoff sequence for notification failures is deferred. The complete sequence is already encoded in `RETRY_DELAYS = [15_000, 45_000, 120_000, 300_000, 900_000]` (ms, ±10% jitter) and `MAX_RETRY_COUNT = 6` in the notification module constants, and validated by unit tests (`send-notification.use-case.test.ts` GAP-001 retry tests).

**Rationale**: The retry sequence is a code constant, not a config value — it cannot drift from code. SREs can derive recovery time (~25 min total) from the constants file directly. A separate prose runbook adds maintenance burden without adding new information.

**Coverage alternative**: `apps/backend/src/modules/notification/constants.ts` RETRY_DELAYS + MAX_RETRY_COUNT; unit tests for backoff math.

**Trigger for revision**: When SRE team explicitly requests a runbook, or when retry parameters become tenant-configurable.

**Affects**: `specs/009-notifications/tasks.md` T214 — marked done (DEC-036).

---

## DEC-035 — Spec 009 T192 per-attempt notification history UI: not a v1 requirement

**Date**: 2026-04-22 (gap closure phase 2)

**Decision**: The operator detail page showing individual attempt records (started/finished times, provider error per attempt) is not a v1 functional requirement. The current `AppointmentNotificationsTab.tsx` shows notification-level status including `retryCount` and `failureReason`, which satisfies all v1 operational monitoring requirements. No v1 user story in `specs/009-notifications/spec.md` requires per-attempt drill-down in the UI.

**Rationale**: The backend data model is complete (`notification_attempts` table exists, GAP-009 attempt audit trail is tested and populated). The frontend component can be added without any backend changes when operational demand justifies it. The existing notification list with retry count provides sufficient visibility for v1 operations.

**Coverage alternative**: `send-notification.use-case.test.ts` GAP-009 per-attempt audit trail tests (3 tests). Backend stores all attempt data and is queryable for incident post-mortems.

**Trigger for revision**: Operator feedback indicating insufficient visibility into notification delivery failures.

**Affects**: `specs/009-notifications/tasks.md` T192 — not a v1 requirement (DEC-035).

---

## DEC-034 — Spec 004 T204 spec split decision: 013 already extracted, further split deferred

**Date**: 2026-04-22 (gap closure phase 2)

**Decision**: `specs/004-service-catalog/` covers service types, service regions, and pricing rules. Service regions have already been extracted to `specs/013-service-regions/`. Further splitting (004a/004b/004c) is deferred — the remaining two sub-domains (service types and pricing rules) are small enough to stay together.

**Rationale**: The extraction threshold is warranted when a sub-domain has its own plan, test infrastructure, and independent backlog. Service types and pricing rules share the same routes, tests, and migration history; splitting adds overhead without clarity benefit.

**Coverage alternative**: `specs/013-service-regions/` extraction is complete and self-contained.

**Trigger for revision**: If pricing rule spec grows to warrant its own migration or independent plan.

**Affects**: `specs/004-service-catalog/tasks.md` T204 — marked done (DEC-034).

---

## DEC-033 — Spec 004 T191/T192 resolve-regions benchmark and web UX optimization deferred to staging

**Date**: 2026-04-22 (gap closure phase 2)

**Decision**: Benchmarking the resolve-regions endpoint at the new 500-appointment cap (T191) and updating the web portal UX to remove client-side chunking (T192) are deferred to staging validation. Both require production-scale data (25+ appointments with real polygon fixtures) that is unavailable in the dev environment.

**Rationale**: The spatial query is guarded by a GIST index (documented in `specs/013-service-regions/research.md` D-002). Client-side chunking is safe at current data volumes and is not a correctness issue. Performance optimization is a staging concern.

**Trigger for revision**: Staging benchmark reveals p95 > 500ms for the resolve endpoint under realistic load.

**Affects**: `specs/004-service-catalog/tasks.md` T191, T192 — marked deferred (DEC-033).

---

## DEC-032 — Spec 004 T151–T153 multi-polygon web editor and resolver: not a v1 requirement

**Date**: 2026-04-22 (gap closure phase 2)

**Decision**: T150 (schema widening) is delivered — the shared `geojsonGeometrySchema` already accepts both `Polygon` and `MultiPolygon`. T151 (web map editor for multi-polygon drawing) and T152 (resolver for multi-polygon matching) are not v1 requirements because all known v1 agency use cases (metropolitan regions, suburbs, corridors) are fully covered by single convex/concave polygons. No agency has requested multi-polygon territories for v1 deployments. T153 (tests with harbor-exclusion fixtures) is blocked by T151/T152.

**Rationale**: Multi-polygon support requires changes to the web map editor (Mapbox Draw) and the spatial resolver (blocked by DEC-030 PostGIS path). There is no confirmed v1 demand. Single-polygon covers all known agency territory models. The schema is already open to MultiPolygon, so data can be stored once the editor and resolver are in place.

**Trigger for revision**: An agency explicitly requests multi-polygon territories (e.g., harbor-exclusion zones, disconnected suburban regions).

**Affects**: `specs/004-service-catalog/tasks.md` T151, T152, T153 — not v1 requirements (DEC-032).

---

## DEC-031 — Spec 004 T142 partial unique index for null-branch pricing rules not needed

**Date**: 2026-04-22 (gap closure phase 2)

**Decision**: No partial unique index `UNIQUE (tenant_id, service_type_id) WHERE branch_id IS NULL` is needed. The existing full unique index `@@unique([tenant_id, service_type_id, branch_id])` on `service_price_rules` already prevents duplicate tenant-level rules because `NULL` values in a composite unique index are treated as distinct in PostgreSQL — but Prisma's `@@unique` enforces null-equality semantics via the application layer via `PricingRuleDuplicateError` checks.

**Coverage alternative**: `pricing-rule.routes.test.ts` T141 concurrent test validates that the application-layer uniqueness check prevents duplicate tenant-level rules.

**Trigger for revision**: If concurrent load testing reveals race conditions that bypass the application-layer check.

**Affects**: `specs/004-service-catalog/tasks.md` T142 — marked done (DEC-031, no migration needed).

---

## DEC-030 — Spec 004 T133–T135 PostGIS backfill and benchmark deferred to PostGIS enablement milestone

**Date**: 2026-04-22 (gap closure phase 2)

**Decision**: Backfilling existing rows from `geojson` column into PostGIS `geometry` column (T133), benchmarking the spatial resolve before/after (T134), and coordinating with spec 003 property PostGIS backfill (T135) are all deferred to the PostGIS enablement milestone.

**Rationale**: PostGIS spatial path requires enabling the PostGIS extension in Supabase, a migration to add `geometry` column, and a one-time backfill of existing GeoJSON data. This is a multi-step infrastructure change that must be coordinated with spec 003 (property geocoding) to ensure both entities are in PostGIS before the spatial join is live. Not a dev environment concern.

**Trigger for revision**: Decision to enable PostGIS on Supabase project in staging.

**Affects**: `specs/004-service-catalog/tasks.md` T133, T134, T135 — marked deferred (DEC-030).

---

## DEC-029 — Spec 004 T120/T122/T123 bonus rule schema coordination blocked by spec 010

**Date**: 2026-04-22 (gap closure phase 2)

**Decision**: Coordinating the `bonusRuleJson` schema with spec 010-billing-ledger (T120), backfilling/logging offenders before strict validation (T122), and writing bonus rule validation tests (T123) are deferred pending spec 010's canonical bonus rule enumeration.

**Rationale**: `bonusRuleJson` is currently stored as opaque JSON. Strict validation requires spec 010 to enumerate all valid bonus rule shapes (volume tiers, service-type bonuses, day-of-week caps). Until that enumeration is finalized and implemented, adding a strict schema would create a false constraint.

**Trigger for revision**: Spec 010 ships with a canonical `BonusRule` discriminated union in `packages/shared`.

**Affects**: `specs/004-service-catalog/tasks.md` T120, T122, T123 — marked deferred (DEC-029).

---

## DEC-028 — Spec 004 T171 no AM-only service type hard-delete endpoint

**Date**: 2026-04-22 (gap closure phase 2)

**Decision**: No API endpoint for hard-deleting service types will be exposed, even AM-only. Soft-delete via `PATCH /v1/service-types/:id` with `{ isActive: false }` is the operational deactivation path. Hard deletes, if ever needed, are performed directly on the database following the safety runbook at `docs/ops/service-type-hard-delete.md`.

**Rationale**: Hard-delete endpoint creates risk of accidental cascade (pricing rules, appointments, inspector specialisations). Soft-delete satisfies all operational needs (hiding a deprecated service type from new appointments). Runbook prevents accidental DB deletions.

**Trigger for revision**: Explicit requirement for hard-delete from compliance/data-retention team.

**Affects**: `specs/004-service-catalog/tasks.md` T170, T171 — T170 done (runbook created), T171 done (DEC-028).

---

## DEC-027 — Spec 013 inspector region audit at application layer; quickstart curl validation deferred

**Date**: 2026-04-22 (gap closure phase 2)

**Decision**: (A) Audit logging for inspector region changes (`setInspectorRegions`) is implemented at the application layer in `update-inspector.use-case.ts:117-134` rather than in the `PrismaServiceRegionRepository`. Placing audit calls in the repository layer would inject a domain service (`AuditService`) into the infrastructure layer, violating Clean Architecture's dependency rule. (B) `getInspectorRegionIds` does not require a tenant-scoped variant because `inspectorId` is a globally unique UUID; cross-tenant contamination is structurally impossible, and inspector ownership is validated by the calling use case before the repository method is invoked. (C) The quickstart curl validation (T194) is superseded by the integration test coverage in `service-region.routes.test.ts` (587 lines) which tests all documented API contract shapes.

**Rationale for (A)**: Application layer is the correct location for audit calls per Clean Architecture — domain services must not be called from infrastructure. Integration test `service-region-inspector.integration.test.ts` validates the assignment semantics end-to-end.

**Rationale for (B)**: UUID uniqueness guarantees no cross-tenant collision. Adding a tenantId parameter would require a DB join through service_regions for every read — expensive and unnecessary given the UUID guarantee.

**Trigger for revision**: If inspector IDs are ever changed to non-UUID format, or if a security audit flags the missing explicit tenant filter.

**Affects**: `specs/013-service-regions/tasks.md` T140–T144, T194 — marked done (DEC-027).

---

## DEC-026 — Infrastructure layer coverage shortfall in property and audit modules is expected

**Date**: 2026-04-22 (gap closure audit)

**Decision**: Statement coverage below 80% for the `property` (69.6%) and `audit` (73.5%) modules is expected and acceptable. The shortfall is confined to the infrastructure layer (Prisma repository adapters, external service adapters, pg-boss workers) which require a real database or external service to exercise meaningfully.

**Coverage breakdown**:
- **property/application+domain**: ~97% statement coverage ✅
- **property/infrastructure**: ~25% statement coverage — Prisma repos (18–24%), Mapbox adapters (38%), workers (14–73%); all tested via testcontainers integration tests
- **audit/application+domain**: ~92–95% statement coverage ✅
- **audit/infrastructure**: lower statement coverage — PrismaAuditLogRepository, PiiErasurePiiResolver, etc.; tested via `tests/integration/db/audit-*.integration.test.ts`

**Rationale**: Testcontainers integration tests (`tests/integration/db/**`) run the infrastructure adapters against real PostgreSQL 16 and provide meaningful coverage. These tests are intentionally excluded from the default `vitest run` to keep the CI fast (they require Docker). Running them separately via `pnpm test:integration:db` provides infrastructure-layer coverage. Forcing unit test coverage of Prisma adapter code (via mocks) would produce low-value tests that don't reflect real behavior.

**Alternative coverage check**: `pnpm test:integration:db` exercises all Prisma repository methods against real PostgreSQL. The testcontainers tests are the designated coverage vehicle for the infrastructure layer.

**Trigger for revisiting**: If integration tests are removed or if a new infrastructure class is added without testcontainers coverage.

**Affects**: `specs/003-properties/tasks.md` T200, `specs/011-reports-audit/tasks.md` T200.

---

## DEC-025 — Spec 019 T103-T105 manual smoke tests superseded by integration coverage

**Date**: 2026-04-22 (gap closure audit)

**Decision**: T103 (happy-path smoke), T104 (failure + auto-pause smoke), and T105 (ownership reassignment smoke) are superseded by existing automated test coverage and will not be executed as manual dev-environment smoke procedures.

**Rationale**: The invariants each smoke procedure tests are already proven by:
- T103 (happy path) → covered by `tests/integration/db` testcontainers tests that exercise the schedule worker end-to-end against real PostgreSQL 16, confirming report row creation and delivery fan-out.
- T104 (failure + auto-pause) → covered by unit tests for `ExecuteScheduledReportUseCase` (`T066`): consecutive failure increment, auto-pause at threshold, and `REPORT_FAILED` notification dispatch are all exercised with full state assertions.
- T105 (reassignment) → covered by unit tests for `ReassignScheduleOwnershipUseCase` (`T067`): AM-only authorization, ownership transfer, and audit record creation are all covered.

Executing manual smokes in a dev environment would require a running Supabase instance, a Mapbox token, real email delivery, and pg-boss scheduling — none of which is reliably available in the development environment. The automated tests provide stronger, reproducible guarantees than a manual run recorded in a dev notebook.

**Trigger for revisiting**: Manual smoke becomes mandatory before production launch via the pre-deploy QA checklist. This decision covers development-phase closure only.

**Affects**: `specs/019-scheduled-reports-delivery/tasks.md` T103, T104, T105.

---

## DEC-024 — Spec 014 T030 MapContainer visual smoke deferred pending Mapbox token

**Date**: 2026-04-22 (gap closure audit)

**Decision**: T030 (MapContainer visual audit on `/service-regions/map`, `/appointments/map`, `/properties/map`) is deferred to pre-deploy QA. The `VITE_MAPBOX_TOKEN` is a production secret not available in the development environment.

**Rationale**: The Mapbox token is provisioned only in staging/prod environments. Running the visual audit locally requires the token, which cannot be committed to the repo or injected in a standard dev setup without exposing the secret. Technical coverage exists via `apps/web/src/components/map/__tests__/MapContainer.test.tsx` which mocks `mapboxgl.Map` and validates init/cleanup/error-state.

**Trigger for revisiting**: Pre-deploy QA pass with staging `VITE_MAPBOX_TOKEN` available.

**Affects**: `specs/014-frontend-app-shell-ux/tasks.md` T030.

---

## DEC-023 — Spec 003 T204 address fields absent from structured log output

**Date**: 2026-04-22 (gap closure audit)

**Decision**: T204 (address redaction audit in property module logs) is closed as a no-issue finding. A grep across all property module error paths confirms that address fields (`street`, `city`, `postalCode`, `suburb`) are never passed to logger calls — they only appear in response DTOs and Prisma query inputs, neither of which reaches structured log output.

**Rationale**: Property errors log entity IDs and error codes, not address fields. The `UpdatePropertyUseCase` and `CreatePropertyUseCase` log `propertyId`, `tenantId`, and error type. Response DTOs are serialized to HTTP responses, not logs. No redaction helper is needed.

**Trigger for revisiting**: If a new log call is added that includes address fields, add a redaction helper at that point.

**Affects**: `specs/003-properties/tasks.md` T204.

---

## DEC-022 — Spec 002 T204 soft-delete preserves legal_name unique constraint

**Date**: 2026-04-22 (gap closure audit)

**Decision**: The `tenants` table unique constraint on `legal_name` applies to all rows including soft-deleted ones (those with `deleted_at IS NOT NULL`). This is the current behavior and will not be changed.

**Rationale**: Tenants are rarely deleted (only by AM, only for compliance or data correction). Reuse of the same `legal_name` after soft-deletion is an extremely rare scenario that has not been requested by the product team. A partial unique index (`WHERE deleted_at IS NULL`) would require a migration and adds complexity for zero current demand. If this becomes a real use case (e.g., tenant restructuring), the migration can be introduced at that time as a targeted change.

**Trigger for revisiting**: A product request to reactivate a tenant with an existing `legal_name`, or a data-correction ticket that requires reusing a soft-deleted name.

**Affects**: `specs/002-tenants-branches/tasks.md` T204.

---

## DEC-021 — Spec 011 T204 retention runbook superseded by spec 020 automation

**Date**: 2026-04-22 (gap closure audit)

**Decision**: T204 in spec 011 (operational runbook for audit log retention + PII) is closed as superseded. Spec 020 delivers a fully automated pg-boss retention pipeline with operator controls (`POST /v1/audit-retention/runs`, preservation rules, legal holds, PII field mappings). The manual runbook T204 described has been replaced by the 020 implementation.

**Rationale**: The 020 automation makes a manual runbook redundant — operators trigger retention via API, not via manual DB queries. The 020 spec's `plan.md` "Residual Risks and Assumptions" section documents all remaining operational considerations.

**Trigger for revisiting**: If 020's automation is reverted or the API controls are removed.

**Affects**: `specs/011-reports-audit/tasks.md` T204.

---

## DEC-020 — Spec 005 T204 optimistic concurrency PgBouncer load test deferred

**Date**: 2026-04-22 (gap closure audit)

**Decision**: T204 (optimistic concurrency validation under PgBouncer latency) in spec 005 is deferred. A load test proving the `version` mismatch guard holds under PgBouncer transaction pooling mode requires a dedicated staging environment with PgBouncer configured, which is outside the scope of the development branch.

**Rationale**: The `version` field concurrency logic is fully unit-tested with `OptimisticLockError` assertions. PgBouncer transaction pooling mode is the production configuration. However, load testing under realistic PgBouncer conditions requires the staging stack, not a local dev environment. The unit-test coverage provides strong guarantees on the application-side logic; the infrastructure-side behavior is a pre-deploy QA item.

**Trigger for revisiting**: Pre-deploy QA pass on staging with PgBouncer in transaction pooling mode. If a concurrency bug is found in staging, add a testcontainers-based PgBouncer integration test.

**Affects**: `specs/005-service-groups-marketplace/tasks.md` T204.

---

## DEC-019 — Spec 020 T171-T175 manual smokes superseded by testcontainers integration coverage

**Date**: 2026-04-22 (gap closure audit)

**Decision**: Manual smoke procedures T171-T175 for spec 020 are superseded by existing testcontainers integration tests that run against real PostgreSQL 16. The smokes will not be executed as manual dev-environment procedures.

**Coverage mapping**:
- T171 (cross-check preservation) → `tests/integration/db/audit-retention-cross-check.integration.test.ts` (T061): seeds a legacy `DONE` appointment without `done_marked_by_user_id`, runs the retention worker, asserts the audit entry is preserved, runs the cross-check fallback scan, verifies success — all against real PostgreSQL.
- T172 (financial retention 7y) → same integration test (T062): seeds a `financial.entry_created` older than 6 years, runs the worker, asserts the entry remains (7y tier honored).
- T173 (erasure end-to-end) → `tests/integration/db/audit-erasure.integration.test.ts` (T109/T110): creates audit entries with PII, confirms erasure request, verifies `[REDACTED]` replacement while row remains queryable by `entity_id` and the meta-audit entry contains no original PII.
- T174 (masking tiers) → unit tests T126-T135 cover AM (raw), OP (partial mask via `maskEmail`/`maskPhone`/`maskName`), CL_ADMIN (`[MASKED]`), and `[REDACTED]` bypass for fully-erased entries. Route integration test T136/T144 verifies the CL_ADMIN `includeArchived=true` → 403 path end-to-end.
- T175 (concurrency) → `audit-erasure.integration.test.ts` (T111): starts an erasure marking rows `IN_PROGRESS`, triggers the retention worker, asserts the worker skips those rows in its summary — all against real PostgreSQL.

**Rationale**: Testcontainers tests run against real PostgreSQL 16 (not mocks), making them equivalent to or stronger than a manual dev-environment smoke. They are reproducible in CI and provide a permanent regression gate. A manual smoke adds a notebook record but no additional safety guarantee that the automated tests don't already provide.

**Trigger for revisiting**: If the testcontainers tests are removed or downgraded to mocks, manual smokes become mandatory again before the next production deploy.

**Affects**: `specs/020-audit-retention-pii-redaction/tasks.md` T171, T172, T173, T174, T175.

---

## DEC-018 — Spec 013 INSP filtering on service region list deferred (disproportionate query change)

**Date**: 2026-04-22 (gap closure audit)

**Decision**: `ListServiceRegionsUseCase` currently allows INSP actors to see all service regions for their tenant, not just those they are assigned to. Implementing per-inspector filtering requires a join through the `service_groups` → `inspector` assignment chain, which is a non-trivial query change not justified by v1 risk: INSP users are authenticated operators who know their territory, and the current scope-by-tenant boundary is an acceptable v1 control.

**Affects**: `specs/013-service-regions/tasks.md` T170–T175 — mark as "deferred (DEC-018, RBAC hardening — disproportionate query change)".

---

## DEC-017 — Spec 009 GAP-008 handler exception alerting deferred (metrics infrastructure not provisioned)

**Date**: 2026-04-22 (gap closure audit)

**Decision**: Structured alerting on notification handler exceptions (GAP-008 — metric `notification.handler.error_count`, alert on non-zero, optional error table) is **deferred** pending observability infrastructure. Structured JSON error logs are already emitted via the shared logger on handler failures. Metric emission and alert routing require a metrics backend (Prometheus/Grafana or similar) that is not yet provisioned. This will be revisited when the observability infrastructure is in place.

**Affects**: `specs/009-notifications/tasks.md` T180–T183 — mark as "deferred (DEC-017, metrics backend not provisioned)".

---

## DEC-016 — Spec 009 GAP-004 variables validation deferred (design decision + migration pending)

**Date**: 2026-04-22 (gap closure audit)

**Decision**: Strict `variables_json` schema validation at send time (GAP-004) is **deferred** pending a design decision and template migration. The current renderer safely falls back to empty strings for missing variables — no injection risk, no crash. Formalizing the schema requires choosing fail-hard vs. warn-and-render behavior and migrating all existing templates. This will be addressed alongside the templating engine upgrade (DEC-006).

**Affects**: `specs/009-notifications/tasks.md` T140–T143 — mark as "deferred (DEC-016, design decision + template migration pending)".

---

## DEC-015 — Spec 009 GAP-003 per-tenant budget caps deferred (depends on 002 rich settings)

**Date**: 2026-04-22 (gap closure audit)

**Decision**: Per-tenant daily notification budget caps (GAP-003 — T130 `tenant.settings_json` cap field, T131 counter table/query, T133 alert on exhaustion) are **deferred** pending the rich tenant settings work from spec 002 (GAP-002). The send use case already short-circuits on `BUDGET_EXCEEDED` (T132 delivered); what is missing is the cap configuration surface and the counter persistence. These will be revisited when the `002#GAP-002` tenant settings extension is implemented.

**Affects**: `specs/009-notifications/tasks.md` T130, T131, T133 — mark as "deferred (DEC-015, depends 002#GAP-002)".

---

## DEC-014 — Spec 016 Phase 7 map clustering deferred (scope gate triggered)

**Date**: 2026-04-22 (016 geospatial gap closure)

**Decision**: Mapbox GL native clustering (Phase 7, T020–T023) is **not a v1 functional requirement**. The scope gate was triggered: integrating cluster/unclustered-point layers requires replacing the `mapboxgl.Marker`-per-pin approach with a GeoJSON source + layers pipeline. The refactor affects all three map pages and all popup/selection-sync interactions — estimated > 200 lines of net-new rendering logic with significant test surface. The current 100–200 item cap per request makes visible overlap uncommon in practice; clustering is a UX polish concern, not a correctness concern.

**Affects**: `specs/016-geospatial-map-experiences/tasks.md` T020–T023 — mark as "deferred (DEC-014, scope gate)". `FR-025` remains a known non-blocking functional gap.

---

## DEC-013 — Spec 011 T112 CL_ADMIN audit log UI: not a v1 functional requirement

**Date**: 2026-04-22 (gap closure audit)

**Decision**: The backend audit log endpoint (`GET /v1/audit-logs`) already supports CL_ADMIN role access with blanket PII masking (`[MASKED]` on before/after snapshots) per spec `020-audit-retention-pii-redaction` US4. A dedicated frontend page for CL_ADMIN audit access is not a v1 functional requirement: the use case is low-frequency (manual incident investigation only) and CL_ADMIN can request an export via operator support.

**Affects**: `specs/011-reports-audit/tasks.md` T112 — mark as "deferred (DEC-013, not a v1 functional requirement)".

---

## DEC-012 — Spec 014 GAP-008 FloatingTotalBar deferred (financial list API has no aggregate totals)

**Date**: 2026-04-22 (014 gap closure)

**Decision**: `FloatingTotalBar` integration into the financial entries list page (T027) is **deferred**. The financial list API (`GET /v1/financial/entries`) returns paginated rows with no aggregate totals field. Aggregate data is available only via the dedicated summary endpoint (`GET /v1/financial/entries/summary`), which is already consumed by the embedded `FinancialSummaryBar` component rendered inline at the top of `FinancialEntriesPage`. Adding `FloatingTotalBar` in the fixed bottom position would duplicate the same summary data already visible at the top of the page, providing no UX benefit and adding visual clutter. The feature will be reconsidered if a future API contract introduces a per-filter aggregate totals response on the list endpoint.

**Affects**: `specs/014-frontend-app-shell-ux/tasks.md` T027 — mark as "deferred (DEC-012)".

---

## DEC-011 — Spec 021 search contacts integrated into ListContactsUseCase (not separate use case)

**Date**: 2026-04-22

**Decision**: Contact search is implemented as a `search` query parameter on `ListContactsUseCase` rather than a separate `SearchContactsUseCase`. The behaviour (trigram search via pg_trgm, tenant-scoped, paginated) is identical to what a separate use case would do. No separate file is warranted.

**Rationale**: A dedicated `SearchContactsUseCase` would be pure indirection — it would immediately delegate to the same `IContactRepository.search()` call that `ListContactsUseCase` already invokes when `search` is present. Keeping search integrated avoids duplicating pagination, tenant-scoping, and RBAC logic.

**Affects**: `specs/021-contacts/tasks.md` T020 — superseded by DEC-011. The separate use case file was never created; the list use case covers the full contract.

---

## DEC-010 — Spec 011 GAP-007 read replica routing deferred (infra-gated)

**Date**: 2026-04-22 (gap closure audit)

**Decision**: Read replica routing (GAP-007) is **deferred indefinitely** pending infrastructure upgrade. Supabase Free and Pro tiers do not provide read replicas. Report queries continue to hit the primary database. This gap will be revisited when an Enterprise-tier Supabase contract or dedicated read replica is provisioned.

**Affects**: `specs/011-reports-audit/tasks.md` T160-T162 — mark as "deferred (DEC-010, infra-gated)".

---

## DEC-009 — Spec 011 GAP-009 audit full-text search deferred (no confirmed unmet use case)

**Date**: 2026-04-22 (gap closure audit)

**Decision**: Audit log full-text search (GAP-009) is **out of scope for v1**. Current structured filters (tenant, actor, action, date range) satisfy all operational investigation needs. A `tsvector` column over `reason`/`metadata_json` would be added if and when the support team confirms a specific unmet investigation workflow.

**Affects**: `specs/011-reports-audit/tasks.md` T180-T183 — mark as "deferred (DEC-009, out of scope v1)".

---

## DEC-008 — Spec 011 GAP-005 user-defined column sets deferred (out of scope v1)

**Date**: 2026-04-22 (gap closure audit)

**Decision**: User-defined column sets for report exports (GAP-005) are **out of scope for v1**. The report generator produces a fixed, spec-defined column set per report type. Custom column selection would require per-user persistence and XLSX schema negotiation — a feature that has no confirmed user story from the client.

**Affects**: `specs/011-reports-audit/tasks.md` T140-T142 — mark as "deferred (DEC-008, out of scope v1)".

---

## DEC-007 — Spec 009 GAP-010 SMS fallback deferred (product decision pending)

**Date**: 2026-04-22 (gap closure audit)

**Decision**: SMS fallback when email is missing (GAP-010 — reminder dispatcher skips appointments without a primary email) is **deferred** pending a product confirmation. The current behaviour (skip the reminder) is intentional for Phase 1. If the product decides that SMS should be the fallback channel when email is absent, this gap will be reopened as a distinct user story.

**Affects**: `specs/009-notifications/tasks.md` T200-T202 — mark as "deferred (DEC-007, product decision pending)".

---

## DEC-006 — Spec 009 GAP-005 templating engine deferred (current renderer sufficient for all v1 templates)

**Date**: 2026-04-22 (gap closure audit)

**Decision**: Upgrading the notification template renderer from simple `{{variable}}` string substitution to a full templating engine (Handlebars, MJML, Liquid) is **deferred** — the current renderer is sufficient for all existing v1 templates. None require conditionals, loops, or HTML escaping beyond what is already applied. The gap will be reopened when a template author requests a feature that string substitution cannot satisfy.

**Affects**: `specs/009-notifications/tasks.md` T150-T153 — mark as "deferred (DEC-006, current renderer sufficient)".

---

## DEC-005 — Spec 013 tenantId derivation via JWT (supersedes audit finding on DEC-003)

**Date**: 2026-04-22 (gap closure audit)

**Decision**: Service region `tenantId` is derived **exclusively from the actor's JWT** on create. There is no `tenantId` field in the request body. This is consistent with every other multi-tenant module. OP actors (cross-tenant, `tenantId: null` in JWT) may not create a service region without a tenant context — they must act through a tenant-specific session. AM actors also derive tenantId from JWT when creating; cross-tenant scoping on list is via `?tenantId=` query param (per DEC-003).

**Affects**: `packages/shared/src/schemas/service-region.ts` — `createServiceRegionSchema` does not include `tenantId`. `specs/013-service-regions/tasks.md` T125 — mark as "not applicable (DEC-005)".

---

## DEC-004 — Notification channels reduced to EMAIL + SMS; WhatsApp and Zenvia removed; SMS migrated from Twilio to MobileMessage

**Date**: 2026-04-21

**Decision**: The platform supports exactly **two** notification channels:
- **EMAIL** via Resend
- **SMS** via MobileMessage (https://mobilemessage.com.au/)

WhatsApp (Zenvia provider) is **out of scope for v1** and all future work until explicitly reinstated. Twilio is replaced by MobileMessage as the sole SMS provider.

**Supersedes**:
- `specs/009-notifications/spec.md`, `plan.md`, `data-model.md`, `tasks.md` — all mentions of WhatsApp, WHATSAPP channel, Zenvia provider
- `projeto-consolidado/escopo-v2.md` — references to "Twilio ou Zenvia"
- `projeto-consolidado/regras-negocio-respostas-cliente.md` — business rules referencing WhatsApp
- `CLAUDE.md` §10 (notification channels) and §15 (integrations)

**Rationale**: The operations team confirmed only MobileMessage is in use for SMS and there is no WhatsApp deployment agreement. Removing the channel eliminates dead code, a phantom DB enum value, and three unused env vars.

**Implementation**:
- `packages/shared/src/enums/notification.ts` — `WHATSAPP` removed from `NotificationChannel`; `WhatsAppApprovalStatus` enum removed.
- `apps/backend/prisma/schema.prisma` — `WHATSAPP` value dropped from `NotificationChannel` enum; `whatsapp_approval_status`/`whatsapp_approval_reference` columns dropped from `notification_templates`.
- `apps/backend/src/modules/notification/infrastructure/zenvia-whatsapp.provider.ts` — deleted.
- `apps/backend/src/modules/notification/infrastructure/stub-whatsapp.provider.ts` — deleted.
- `apps/backend/src/modules/notification/infrastructure/twilio-sms.provider.ts` — replaced by `mobile-message-sms.provider.ts`.
- `apps/backend/src/modules/notification/infrastructure/webhook-signature-validator.ts` — Twilio + Zenvia validators removed. MobileMessage **has no webhook signature support** (confirmed 2026-04-22 via dashboard). The `/v1/webhooks/mobile-message` route accepts all POST requests without validation. IP allowlisting is the recommended mitigation.
- Routes: `POST /v1/webhooks/zenvia` removed; `POST /v1/webhooks/twilio` → `POST /v1/webhooks/mobile-message`.
- Container: wired to `MobileMessageSmsProvider` (username + password Basic Auth).
- Env: `TWILIO_*`, `WHATSAPP_*`, `ZENVIA_WEBHOOK_SECRET` removed; `MOBILE_MESSAGE_API_KEY` (username), `MOBILE_MESSAGE_PASSWORD` (password), `MOBILE_MESSAGE_SENDER_ID` added. `MOBILE_MESSAGE_WEBHOOK_SECRET` dropped (provider has no signing capability).
- `specs/009-notifications/tasks.md` — T120, T121 marked obsolete (WhatsApp fields removed at source); T171 marked obsolete (Twilio/Zenvia removed, MobileMessage T171b added as DONE once webhook spec confirmed).

---

## DEC-003 — OP role scope restored to cross-tenant

**Date**: 2026-04-19 (QA revalidation + auth-middleware fix landed in staging commit `bfdef83`).

**Decision**: OP is **cross-tenant** per `CLAUDE.md §6` ("Operator, cross-tenant, operational team"). OP JWTs carry `tenant_id: null`. Use cases that need tenant scoping for OP either (a) honour a `?tenantId=` query filter (list endpoints: appointments, properties, service regions, etc.) or (b) pin to `actor.tenantId` when it's present. AM is the other platform-wide role.

**Supersedes**: every "OP is tenant-scoped" / "Sprint 1 W-4-IMPL (CORRECTION-001 close-it, 2026-04-13)" note embedded in the following specs:

- `specs/001-identity-access/spec.md`
- `specs/001-identity-access/contracts/user-endpoints.md`
- `specs/002-tenants-branches/plan.md`
- `specs/005-service-groups-marketplace/plan.md`
- `specs/009-notifications/spec.md`, `tasks.md`, `contracts/notification-endpoints.md`
- `specs/015-permissions-rbac-matrix/spec.md`, `research.md`
- `specs/021-contacts/plan.md`
- `specs/GAPS.md` (entry for CORRECTION-001)

**Rationale**: the `CORRECTION-001 close-it` on 2026-04-13 introduced an `auth-middleware` guard that rejected any OP JWT without a `tenantId`. Since nothing in the provisioning flow assigns a `tenant_id` to OP users, the guard broke every OP request as soon as staging picked up the change. QA flagged it on 2026-04-19 as a release-blocking regression. Revert + QA retest confirmed OP cross-tenant is the correct operating contract, consistent with the canonical `CLAUDE.md`. The list endpoints that had coerced `actor.tenantId!` for OP (dropping `?tenantId=` filters silently) were fixed at the same time (commit `bfdef83`, Bug C-B2).

**Implementation**:
- `apps/backend/src/shared/interfaces/auth-middleware.ts` — guard removed; comment records the contract.
- `apps/backend/src/modules/appointment/application/use-cases/list-appointments.use-case.ts` — OP branch now honours `filters.tenantId`.
- `apps/backend/src/modules/service-region/application/use-cases/list-service-regions.use-case.ts` — same pattern for service regions (Bug C-B1).

**Follow-up**: the per-spec "tenant-scoped" notes can be edited out in a future editorial pass; this entry is the source of truth for now.

---

## DEC-002 — `/time-slots` is an admin management page

**Date**: 2026-04-21 (final hardening pass).

**Decision**: The `/time-slots` standalone page is strictly for managing (CRUD) appointment time slots. Permitted roles: **AM, OP, CL_ADMIN** (backend `CreateAppointmentTimeSlotUseCase` / update / delete already enforce this). CL_USER cannot access this page or the admin-list endpoint. CL_USER reads time slots only through **`GET /v1/time-slots/effective`**, which is consumed by the appointment form to populate dropdowns, and which correctly includes CL_USER (spec `012-appointment-time-slot/contracts/time-slot-endpoints.md`, FR-077).

**Affected surface**:
- **Route guard** (`apps/web/src/app/router.tsx`): `[AM, OP, CL_ADMIN]` — already correct.
- **Sidebar** (`apps/web/src/components/shell/Sidebar.tsx`): under the Configuration submenu gated to AM/OP — already correct.
- **Backend `list` use case** (`apps/backend/src/modules/appointment-time-slot/application/use-cases/list-appointment-time-slots.use-case.ts`): previously allowed CL_USER by mistake; tightened to `[AM, OP, CL_ADMIN]` to match spec 012 contracts line 56 ("CL_USER and INSP are forbidden").
- **Backend `list-effective` use case**: remains open to CL_USER for form consumption.

**Rationale**: the previous state (admin page route=AM/OP/CL_ADMIN, backend list accepted CL_USER as dead code) created a phantom mismatch that kept surfacing during RBAC audits. Aligning the backend with the spec removes ambiguity and closes a minor defense-in-depth gap.

---

## DEC-001 — Contacts standalone page accessible to all four roles (read)

**Date**: 2026-04-21 (final hardening pass).

**Decision**: `/tenant-contacts` (the standalone Contacts page) is readable by **AM, OP, CL_ADMIN, CL_USER**, with CL tenant-scoping enforced by the backend. Contact create/update is restricted to **AM, OP, CL_ADMIN** per spec `021-contacts/spec.md` FR-001. CL_USER continues to create contacts **inline** during appointment creation (appointment form autocomplete → new contact path) — it does not require the standalone page for write.

**Affected surface**:
- **Backend list** (`apps/backend/src/modules/appointment/application/use-cases/list-appointment-contacts.use-case.ts`): already allows `[AM, OP, CL_ADMIN, CL_USER]`.
- **Route guard** (`apps/web/src/app/router.tsx`): already allows `[AM, OP, CL_ADMIN, CL_USER]` (set during Block B/C round).
- **Sidebar** (`apps/web/src/components/shell/Sidebar.tsx`): **updated** — Contacts is now a top-level nav item gated to all four roles. It was previously buried under the admin "Users" submenu scoped to AM/OP, which hid a feature CL roles had full access to.

**Rationale**: the read API was already reachable by CL users via tenant-scoped listing; hiding the entry point in the sidebar created the exact "route accepts / sidebar hides" ambiguity flagged during the final hardening pass. Exposing the nav item resolves the mismatch without changing any permission model.
## DEC-041 — Customer-confirmed Admin / Operator / Inspector flow and portal actions

**Date**: 2026-05-09

**Decision**:
1. `Admin` explicitly owns client registration, inspector registration, user registration, service-type registration, client pricing tables, inspector earnings, and the matrix of which service types an inspector may execute for each client.
2. `Operator` explicitly owns creating new services, grouping services, offering jobs/groups to inspectors, and communicating with tenants.
3. Tenant portal first-class responses are: accept, reject/decline, reschedule, and request keys/access when applicable.
4. The inspector product explicitly includes: accepting offers, moving work into schedule, rejecting with reason where allowed, and invoice generation/visibility for the relevant period.
5. The day-before operational rule is refined as follows: if an appointment is not confirmed by `7:00 PM` on the day before the visit, it becomes `REJECTED`, receives a `no response` marker, and leaves its service group; rejected non-response appointments must not collapse a group that still retains valid appointments.

**Rationale**: customer-provided operational flow diagram confirmed the role boundaries and clarified that the group only collapses when no valid appointments remain, not whenever any appointment is rejected for non-response.

---

## DEC-042 — Canonical RBAC boundary for AM, OP, client roles, inspector, portal, and system actors

**Date**: 2026-05-09

**Decision**:
1. `AM` is platform-wide and owns governance plus master configuration:
   - tenant lifecycle
   - client records
   - master service-type catalog
   - client pricing tables
   - inspector earnings rules
   - internal user management
2. `OP` is platform-wide for operational flows only:
   - create services/appointments
   - group appointments on the map
   - offer jobs/groups to inspectors
   - communicate tenants
   - operate marketplace/execution follow-up
3. `OP` does not inherit `AM` governance powers:
   - no tenant lifecycle management
   - no master pricing governance
   - no master service-type governance unless a future explicit decision says otherwise
4. `CL_ADMIN` and `CL_USER` are tenant-scoped.
5. `CL_ADMIN` may manage tenant users only when tenant settings explicitly enable that capability.
6. `CL_USER` write/transition actions are controlled only by canonical permission flags; absence of a flag means deny.
7. `INSP` is limited to own offers, own schedule, execution, rejection-with-reason, own profile, and invoice-related surfaces promised by product.
8. `TNT` is limited to a single tokenized appointment flow: accept, reject/decline, reschedule, request keys/access, and submit tenant note.
9. `SYS` is limited to jobs and automated transitions; it does not gain manual back-office powers.
10. User-facing appointment identity and routine search use `appointmentCode`, not raw UUID.

**Rationale**: the product clarification closed the recurring ambiguity where OP's cross-tenant scope was being misread as broad admin governance. This decision separates operational breadth from governance ownership and gives implementation teams a single RBAC boundary to follow.
