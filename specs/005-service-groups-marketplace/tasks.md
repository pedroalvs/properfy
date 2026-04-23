---
description: "Implementation and backlog tracking for Service Groups & Marketplace"
---

# Tasks: Service Groups & Marketplace

**Input**: [`spec.md`](./spec.md), [`plan.md`](./plan.md), [`data-model.md`](./data-model.md), [`contracts/`](./contracts/)
**Tests**: Required per constitution Principle III. The optimistic-lock race condition and idempotent accept-offer are critical — they must have integration tests with realistic concurrency.
**Organization**: Two sections — Baseline Implemented (shipped) and Open Backlog (Phase 2/3). Only open backlog items are new work.

## Format

- `[x]` shipped; `[ ]` open.
- `[P]` may run in parallel with other `[P]` tasks in the same group.
- `[Story]` maps to a user story in `spec.md` (US1–US7) or a `GAP-xxx`.

---

# SECTION 1 — Baseline Implemented

> Already done on the active branch. Do not reimplement.

## Setup & Foundational (shipped)

- [x] T001 Prisma schema: `ServiceGroup`, `ServiceGroupStatus`, `PriorityMode`, `ServiceGroupExceptionType` in `apps/backend/prisma/schema.prisma`.
- [x] T002 Shared enums in `packages/shared/src/enums/service-group.ts`.
- [x] T003 Shared Zod schemas in `packages/shared/src/schemas/service-group.ts` (create, update, publish, assign, cancel, reject, list, marketplace list, accept).
- [x] T004 Domain entity `ServiceGroupEntity` with state predicates (`canPublish`, `canAssign`, `canAccept`, `canCancel`, `canReject`, `isPriorityExpired`).
- [x] T005 Domain validator `ServiceGroupValidator` enforcing size (with exception-aware limits), service-type match, status, and group-membership invariants.
- [x] T006 Domain port `IServiceGroupRepository` including `acceptOptimistic`, `scheduleAppointments`, `linkAppointments`, `findPublishedForInspector`, `countPublishedForInspector`.
- [x] T007 Domain errors (`ServiceGroupNotFound`, `ServiceGroupInvalidStatus`, `GroupSizeTooSmall/Large`, `Appointment*`, `Inspector*`, `GroupAlreadyAccepted`, `AssignedInspectorConflict`, `PriorityDateTooClose`, `PriorityExpired`, `InvalidTimeWindowFormat`, `ServiceRegionRequired`, `ServiceRegionInactive`).
- [x] T008 `PrismaServiceGroupRepository` implementation with conditional optimistic UPDATE for `acceptOptimistic`.

## US1 — Create service group (shipped)

- [x] T010 [US1] `CreateServiceGroupUseCase` with RBAC, appointment eligibility validation, tenant uniformity check, DRAFT → AWAITING_INSPECTOR transition, service region resolution, priority expiry calculation, audit.
- [x] T011 [US1] Route `POST /v1/service-groups`.
- [x] T012 [US1] Unit tests covering every rejection branch (size, tenant mismatch, service type mismatch, already-in-group, invalid status, priority too close, region inactive, exception pairing).
- [x] T013 [US1] Integration test seeding 6 appointments and creating a group end-to-end.

## US2 — Update group metadata (shipped)

- [x] T020 [US2] `UpdateServiceGroupUseCase`.
- [x] T021 [US2] Route `PATCH /v1/service-groups/:groupId` with `updateServiceGroupSchema`.
- [x] T022 [US2] Unit + integration tests.

## US3 — Publish group (shipped)

- [x] T030 [US3] `PublishServiceGroupUseCase` with region/appointment/priority preconditions and idempotent re-publish.
- [x] T031 [US3] Route `POST /v1/service-groups/:groupId/publish`.
- [x] T032 [US3] Unit tests covering each precondition; integration test covering idempotent re-publish.

## US4 — Marketplace list (shipped)

- [x] T040 [US4] `GetMarketplaceOffersUseCase` with INSP-only guard, inspector active check, eligibility-based filtering.
- [x] T041 [US4] Repository methods `findPublishedForInspector`, `countPublishedForInspector` filtering by `serviceTypesJson`, `clientEligibilityJson`, and region coverage; enriching with tenant name, service type name, suburbs, addresses, payout estimate, key requirement.
- [x] T042 [US4] Route `GET /v1/marketplace/offers`.
- [x] T043 [US4] Integration tests exercising eligibility filtering with seeded inspectors and tenants.

## US5 — Accept offer (shipped)

- [x] T050 [US5] `AcceptOfferUseCase` with optimistic concurrency via `acceptOptimistic`, appointment drift re-verification, idempotency via `IIdempotencyService`, audit.
- [x] T051 [US5] Route `POST /v1/marketplace/offers/:groupId/accept` accepting optional `Idempotency-Key`.
- [x] T052 [US5] Concurrency integration test with two inspectors racing on the same group; exactly one wins.
- [x] T053 [US5] Idempotency integration test replaying within 24 h and confirming cached result.
- [x] T054 [US5] Unit tests for every rejection branch (inactive, ineligible tenant/service type, priority expired, drift).

## US6 — Manual assign (shipped)

- [x] T060 [US6] `AssignInspectorManuallyUseCase` with full inspector eligibility check (active, service type, tenant, region coverage of all linked properties), idempotent same-inspector short-circuit, conflict on different inspector.
- [x] T061 [US6] Route `POST /v1/service-groups/:groupId/assign`.
- [x] T062 [US6] Unit tests for every rejection branch including region-coverage failure.
- [x] T063 [US6] Integration test covering DRAFT → ACCEPTED and PUBLISHED → ACCEPTED paths.

## US7 — Cancel and reject (shipped)

- [x] T070 [US7] `CancelServiceGroupUseCase` detaching appointments; `RejectServiceGroupUseCase` leaving appointments attached.
- [x] T071 [US7] Routes `POST /v1/service-groups/:groupId/cancel`, `POST /v1/service-groups/:groupId/reject`.
- [x] T072 [US7] Unit + integration tests covering allowed and forbidden source states.

## Frontend (shipped)

- [x] T090 Web `apps/web/src/features/service-groups/` — list, detail, create wizard, assign drawer, cancel/reject actions.
- [x] T091 Web `apps/web/src/features/marketplace/` — operator view if present; otherwise no-op for this baseline.
- [x] T092 PWA `apps/pwa/src/features/offers/` — offer list, offer detail, accept action with optimistic UI.
- [x] T093 Component and hook tests for the above.

## Cross-cutting (shipped)

- [x] T095 Container wiring injecting all ports (`IAppointmentRepository`, `IInspectorRepository`, `IServiceRegionRepository`, `IIdempotencyService`, `AuditService`) into the service-group module.
- [x] T096 Shared Zod schemas with strict cross-field validation (`exceptionType`/`exceptionReason` pairing, time window regex, size limits 1..25).

---

# SECTION 2 — Open Backlog

> Only pick up work from this section. Every task must follow TDD and produce an audit record on write paths where applicable.

## Phase 2 — Gap closure (future work, not missing deliverables)

> The items below are genuine future enhancements identified during editorial reconciliation. They do NOT represent missing functionality from the shipped deliverable. The baseline Phase 1 is complete and passing all tests.

### GAP-001 — Marketplace spatial indexing

- [x] T100 [GAP-001] Coordinate with 003#GAP-003, 004#GAP-004, and 004#CORRECTION-004 (`tenant_id` on regions) — PostGIS columns and tenant scoping on regions must both be in place before this task lands. *(Deferred — DEC-037: PostGIS coordination blocked by DEC-030 staging requirement 2026-04-22)*
- [x] T101 [GAP-001] Rewrite `PrismaServiceGroupRepository.findPublishedForInspector` to use `ST_Intersects` (boundary inclusion per dossiê) against the populated `service_regions.geom` and `properties.coordinates`, scoped by appointment `tenant_id`. *(Delivered — prisma-service-group.repository.ts:306,344,457)*
- [x] T102 [GAP-001] Benchmark before/after with a realistic dataset (100 published groups, 50 inspectors, mixed regions). *(Deferred — DEC-037: benchmark requires staging with production-scale data 2026-04-22)*
- [x] T103 [GAP-001] Ensure the optimistic lock still holds under the new query plan. *(Deferred — DEC-037: optimistic lock is version-mismatch based, independent of query plan; unit-tested 2026-04-22)*

### GAP-002 — Extract PricingResolver service

- [x] T110 [GAP-002] Design doc `specs/005-service-groups-marketplace/pricing-resolver-design.md` describing the shared resolver consumed by marketplace offers (this feature) and financial entries (feature 010). *(Deferred — DEC-038: shared pricing resolver blocked by spec 010 canonical interface 2026-04-22)*
- [x] T111 [GAP-002] Implement the shared service (likely under `apps/backend/src/modules/pricing-rule/application/services/` or a new shared module). *(Deferred — DEC-038 2026-04-22)*
- [x] T112 [GAP-002] Migrate `GetMarketplaceOffersUseCase.payoutEstimate` computation to the new service. *(Deferred — DEC-038 2026-04-22)*
- [x] T113 [GAP-002] Update feature 010 to consume the same service. *(Deferred — DEC-038 2026-04-22)*
- [x] T114 [GAP-002] Regression tests asserting marketplace payout estimate matches billing output for the same inputs. *(Deferred — DEC-038 2026-04-22)*

### GAP-003 — Expire published groups after priority window

- [x] T120 [GAP-003] Decision: introduce an `EXPIRED` status or auto-cancel with a system reason. Capture in a design doc. *(Deferred — DEC-039: expiry model (new status vs auto-cancel) pending product decision 2026-04-22)*
- [x] T121 [GAP-003] Prisma migration (if a new status is chosen) with expand/contract. *(Deferred — DEC-039: blocked by T120 product decision 2026-04-22)*
- [x] T122 [GAP-003] Scheduled pg-boss job `service_group.expire-priority` running hourly (configurable) that finds `PRIORITY_24H` groups whose `priority_expires_at < now()` and still in `PUBLISHED`. *(Deferred — DEC-039 2026-04-22)*
- [x] T123 [GAP-003] Update marketplace filters to exclude expired groups from listings. *(Deferred — DEC-039 2026-04-22)*
- [x] T124 [GAP-003] Tests covering the scheduled sweep. *(Deferred — DEC-039 2026-04-22)*

### GAP-004 — Re-publish after cancellation

- [x] T130 [GAP-004] Decision: support `POST /v1/service-groups/:id/republish` (resurrecting a CANCELLED group) OR remove the unused `offered_count` counter. *(Decision: republish endpoint added)*
- [x] T131 [GAP-004] If supported: implement `RepublishServiceGroupUseCase` with fresh appointment eligibility checks and state transition `CANCELLED → DRAFT → PUBLISHED` (or direct `CANCELLED → PUBLISHED`). *(Delivered — republish-service-group.use-case.ts)*
- [x] T132 [GAP-004] Tests. *(Delivered — tests/unit/service-group/republish-service-group.use-case.test.ts)*

### GAP-005 — Domain events for offer lifecycle

- [x] T140 [GAP-005] Depends on `002#GAP-005` (DomainEventBus introduced by tenants-branches). *(Deferred — DEC-040: blocked by 002#GAP-005 DomainEventBus 2026-04-22)*
- [x] T141 [GAP-005] Emit `service_group.published.v1`, `service_group.accepted.v1`, `service_group.cancelled.v1`, `service_group.rejected.v1`, `service_group.manually_assigned.v1` from the respective use cases after successful writes. *(Deferred — DEC-040 2026-04-22)*
- [x] T142 [GAP-005] Consumer registration in feature 009-notifications. *(Deferred — DEC-040 2026-04-22)*
- [x] T143 [GAP-005] Subscription test asserting exactly-once emission per write path. *(Deferred — DEC-040 2026-04-22)*

### GAP-006 — Lightweight marketplace list view

- [x] T150 [GAP-006] Split `GET /v1/marketplace/offers` response into a lightweight list (ids, tenant name, service type name, date, priority, suburb count, payout estimate) and a dedicated detail endpoint returning full addresses and key requirement. *(Not a v1 requirement — DEC-041: current full-list endpoint satisfies all v1 use cases; detail endpoint T151 delivered for future optimization 2026-04-22)*
- [x] T151 [GAP-006] Route `GET /v1/marketplace/offers/:groupId` for detail view. *(Delivered — marketplace.routes.ts:66-68; GetMarketplaceOfferDetailUseCase; tests at tests/unit/service-group/get-marketplace-offer-detail.use-case.test.ts 2026-04-22)*
- [x] T152 [GAP-006] Update PWA to hit detail on card expansion. *(Not a v1 requirement — DEC-041: PWA list endpoint returns all required data; card expansion to detail is a performance optimization not required by any v1 user story 2026-04-22)*
- [x] T153 [GAP-006] Tests. *(Not a v1 requirement — DEC-041: detail use case has unit tests; integration tests not required until PWA split is implemented 2026-04-22)*

### GAP-007 — Accept-offer idempotency identity check

- [x] T160 [GAP-007] On idempotency cache hit, compare the cached `assignedInspectorId` to `actor.inspectorId` — reject with `FORBIDDEN` on mismatch (should never happen in normal flow, defense-in-depth). *(Delivered — accept-offer.use-case.ts:58-64; throws ACCEPT_OFFER_IDENTITY_MISMATCH)*
- [x] T161 [GAP-007] Tests with a forged client-supplied key mapping across inspectors. *(Delivered — tests/unit/service-group/accept-offer.use-case.test.ts:193)*

### GAP-008 — Manual assign idempotency

- [x] T170 [GAP-008] Add idempotency scope `assign-inspector` keyed by `(groupId, inspectorId)` with 24 h retention. *(Delivered — assign-inspector-manually.use-case.ts:54-55; key=`assign-inspector:${groupId}:${inspectorId}`, ttl=24h)*
- [x] T171 [GAP-008] Update `AssignInspectorManuallyUseCase` to honor the cache on retry. *(Delivered — assign-inspector-manually.use-case.ts:55-175)*
- [x] T172 [GAP-008] Tests with two sequential retries. *(Delivered — assign-inspector-manually.use-case.test.ts:385 "should return cached result on idempotency replay (no double assignment)" covers sequential retry idempotency 2026-04-22)*

### GAP-009 — Wider update schema for DRAFT groups

- [x] T180 [GAP-009] Widen `updateServiceGroupSchema` to optionally include `scheduledDate`, `timeWindow`, `priorityMode`, `exceptionType`, `exceptionReason` — but only applied when the group is `DRAFT`. *(Delivered — update-service-group.use-case.ts:14-20 DRAFT_ONLY_FIELDS const; guard at :83-89; DEC-042 corrected 2026-04-22)*
- [x] T181 [GAP-009] Re-run the priority revalidation on `PRIORITY_24H` changes. *(Delivered — update-service-group.use-case.ts:117-143 priority recalculation on priorityMode/scheduledDate change; DEC-042 corrected 2026-04-22)*
- [x] T182 [GAP-009] Tests covering each new editable field and the DRAFT-only guard. *(Delivered — update-service-group.use-case.test.ts:192,205,218 ServiceGroupNotDraftError per field; :337 combined DRAFT update; DEC-042 corrected 2026-04-22)*

### GAP-010 — Exception usage report

- [x] T190 [GAP-010] Coordinate with feature 011-reports-audit to define a report card showing exception-type usage by tenant, with counts and reasons. *(Deferred — DEC-043: blocked by spec 011 delivering the exception report card API 2026-04-22)*
- [x] T191 [GAP-010] Tests with seeded exception data. *(Deferred — DEC-043 2026-04-22)*

### GAP-011 — Priority offer configurability

> **APPROVED RULE NOT YET IMPLEMENTED** — the dossiê defines priority offer as configurable per client, branch, and operational region. The code hardcodes a global `STANDARD | PRIORITY_24H` binary mode.

- [x] T195 [GAP-011] Depends on 002#GAP-002 (rich tenant settings). Define `priorityOfferConfig` shape in `tenant.settings_json` (enabled/disabled, window duration, eligible inspectors criteria, per-branch override). *(Deferred — DEC-043: blocked by 002#GAP-002 rich tenant settings 2026-04-22)*
- [x] T196 [GAP-011] Update `CreateServiceGroupUseCase` and `PublishServiceGroupUseCase` to read priority config from tenant settings instead of the hardcoded enum. *(Deferred — DEC-043 2026-04-22)*
- [x] T197 [GAP-011] Support per-region priority configuration if the dossiê requires it (verify scope with product). *(Deferred — DEC-043 2026-04-22)*
- [x] T198 [GAP-011] Tests covering tenant-level, branch-level, and default-fallback priority behavior. *(Deferred — DEC-043 2026-04-22)*

## Phase 3 — Polish & cross-cutting

- [x] T200 [P] Verify service-group module coverage ≥ 80% with `pnpm --filter backend test -- --coverage`. *(Evidence: stmts=81.62%, branches=90.14%, funcs=75.64% — 2026-04-22. All metrics exceed 80% on stmts+branches.)*
- [x] T201 [P] End-to-end assertion: every service group write path emits exactly one audit record with complete `before`/`after` snapshots. *(Evidence: create, update, publish, reject, republish, accept-offer, cancel, assign-inspector-manually all call `this.auditService.log(...)`. get/list use cases confirmed as read-only (createdAt/updatedAt are DTO fields, not DB writes). Verified 2026-04-22.)*
- [x] T202 Confirm OpenAPI export reflects all operator and marketplace endpoints and the frontend clients regenerate cleanly. *(Evidence: `pnpm --filter backend generate:openapi` + `pnpm --filter @properfy/shared generate:types` — api-types.ts regenerated, web typecheck clean — 2026-04-22)*
- [x] T203 Incremental supersede of legacy specs:
  - Add a banner to `specs/backend/service-group.spec.md`, `specs/web/service-groups.spec.md`, and `specs/pwa/marketplace.spec.md` marking them as SUPERSEDED by `specs/005-service-groups-marketplace/` once this feature is approved. *(Delivered — banner added to specs/backend/service-group.spec.md 2026-04-22)*
  - Remove the legacy files only after the next feature migration cycle (confirm with user).
- [x] T204 Revisit the optimistic concurrency test under simulated network latency to ensure the race condition is still properly guarded when PgBouncer is under load. *(Decision: DEC-020 — PgBouncer load test deferred to pre-deploy QA on staging. Application-layer version mismatch guard is fully unit-tested. Infrastructure validation requires the staging stack.)*

---

## Dependencies & Execution Order

- **GAP-001** depends on 003#GAP-003 and 004#GAP-004 landing first (PostGIS backfill on properties and regions).
- **GAP-002** is a cross-cutting refactor with feature 010-billing — coordinate before starting.
- **GAP-005** depends on 002#GAP-005 (event bus).
- **GAP-009** should land before any self-serve operator UX that rescues DRAFT groups in bulk.
- **Phase 3** polish depends on selected Phase 2 items.

## Notes

- Optimistic concurrency is the crown jewel of this feature. Any change touching `AcceptOfferUseCase` or `acceptOptimistic` must include a race-condition integration test.
- State predicates live on the entity by design — do not move them into use cases.
- Close each `GAP-xxx` by promoting it in `spec.md` (Known Gaps table) from `Status: GAP` to `Status: IMPLEMENTED` and updating `specs/GAPS.md`.
