# Feature Specification: Early Offer Access by Inspector Level (backend + shared)

**Feature Branch**: `066-f08-2-early-offer-access`
**Created**: 2026-11-08
**Status**: Draft
**Input**: User description: "early offer access by inspector level"
**Task source**: `fase2-etapa1/tarefas/F08-tarefas.md` § TASK-F08-2
**Contract codes**: 03.7 (early offer access); acceptance criteria **03.A5** (audit of the platform setting, via F03). 03.A3/03.A4 do not apply to this slice.
**Depends on**: TASK-F08-1 (merged, `inspectorProgram` setting + `InspectorProgramStandingService.hasEarlyAccess` + `minScoreForLevel`), TASK-F07-2 (reliability snapshots).

## Overview

Properfy rewards reliable inspectors. One of those rewards (Q13) is **early access to new offers**: when the platform switches early access on, a freshly-published service group is, for its first **H** hours, **visible and acceptable only to inspectors at or above a minimum level X** (derived from the F07 reliability index). After H hours the group behaves exactly as today — visible to, and acceptable by, every eligible inspector in first-come order.

"Level X" and "H hours" live in the existing `inspectorProgram` platform setting (`earlyAccess.minLevel` / `earlyAccess.hours`), added by TASK-F08-1. This slice makes the marketplace **honour** that setting across all four inspector-facing paths of a service-group offer:

1. the offer **list** (`GET /v1/marketplace/offers`),
2. the offer **count** (the `total` on the same list),
3. the offer **detail** (`GET /v1/marketplace/offers/:id`), and
4. the offer **accept** (`POST /v1/marketplace/offers/:id/accept`).

The first three simply hide an in-window group from an under-levelled inspector (detail returns the existing `404`); the fourth returns a new `403 OFFER_EARLY_ACCESS_ONLY` whose message tells the inspector, in Sydney wall-clock, the day and time the offer opens to everyone.

**Start-safe by design (DV3 + L-F08-08).** Early access is **off by default** and must never surprise anyone when it is switched on:

- The window applies to a group **only if at least one inspector who is eligible for that specific group also qualifies** (is at/above level X). A brand-new program with no high-level inspector, or a group no high-level inspector can take, is visible to everyone immediately.
- The window **never** applies to a group scheduled for **today or tomorrow (D+1)** — those are too urgent to gate.
- The window applies **only to groups published after early access was switched on** (`published_at ≥ earlyAccess.enabledAt`). Switching early access on never retroactively hides offers already on the board.
- `earlyAccess.enabledAt` is a **server-owned instant**: the backend stamps it when `enabled` flips `false → true`, keeps it while it stays on, and clears it to `null` when it flips off. A client-supplied `enabledAt` is ignored (L-F08-08).

**No data model change, no migration.** The feature is pure read-path + accept-path logic plus one settings save hook. It reads `service_groups.published_at`, `inspectors` (regions, service types, blocked clients), `service_regions`, and the F07 `inspector_reliability_snapshots`. All of that already exists.

**Multi-tenant note (reads cross-inspector, no new entity).** This slice adds no table and no `tenant_id`. The four offer paths stay **inspector-scoped** — they already run only for the authenticated `INSP` and filter by that inspector's regions, service types and denylist. The early-access gate reads (a) the viewer's own reliability level and (b) whether *any* qualified inspector is eligible for the group, from the platform-scoped `inspector_reliability_snapshots` (D9, cross-tenant precedent). No agency identity, address or coordinate is read or returned, and the qualified-eligible existence check returns only a boolean — never the identity of another inspector. The `inspectorProgram` setting it reads is a platform-scoped `PlatformSetting` (no `tenant_id`, D12). Isolation is unchanged: `CL_*`/`TNT` never reach the marketplace routes, and an `INSP` sees only its own eligible offers.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gate the four offer paths while a new offer is in its early-access window (Priority: P1)

As the platform (on behalf of the operations team), when early access is on I want a freshly-published offer, for its first H hours, to be **hidden from the list, excluded from the count, hidden from detail and refused on accept** for inspectors below level X — while a level-≥-X inspector sees and accepts it exactly as today — so that reliable inspectors get a real head start and the three read paths plus the accept path never disagree about what an inspector may see.

**Why this priority**: This is contract item 03.7 — the whole feature. Without it there is no early access. It must gate all four paths together: if the filter is applied to the list but not the count, the `total` diverges; if not to detail, an under-levelled inspector can still open the offer by link; if not to accept, the gate is cosmetic.

**Independent Test**: Against the marketplace use cases (list, detail, accept) with repository and policy fakes, and against a real PostGIS database (Testcontainers), assert that a level-≥-X inspector and a below-X inspector see different results for the same in-window group, that count matches the list ids, that detail returns `404` for the below-X inspector and the detail for the qualified one, and that accept returns `403 OFFER_EARLY_ACCESS_ONLY` for the below-X inspector and succeeds for the qualified one.

**Acceptance Scenarios**:

1. **Given** early access on (H = 12, X = GOLD), a group scheduled for D+3 published 2 hours ago, and at least one GOLD inspector eligible for it, **When** a SILVER inspector lists offers, **Then** the group is absent from the list, absent from `total`, and `GET /v1/marketplace/offers/:id` returns `404 MARKETPLACE_OFFER_NOT_FOUND`.
2. **Given** the same group and SILVER inspector, **When** the SILVER inspector accepts it, **Then** the response is `403 OFFER_EARLY_ACCESS_ONLY` with `details.opensAt = published_at + 12h` (ISO-8601 UTC) and `message` "This offer opens to all inspectors on {EEE d MMM} at {h:mm a}." in Sydney time, and `acceptOptimistic` is never called.
3. **Given** the same group, **When** a GOLD inspector eligible for it lists, reads detail, and accepts, **Then** all three behave exactly as today (visible, detail returned, accepted first-come).
4. **Given** the same group but published exactly 12h 0m 1s ago (just past the window), **When** a SILVER inspector lists and accepts, **Then** the group is visible and acceptable (the window is time-bounded and has closed).
5. **Given** a group with `published_at = NULL` (legacy, still `PUBLISHED`), **When** a SILVER inspector lists and accepts, **Then** it is visible and acceptable (no window without a publish instant).
6. **Given** a paginated list (`pageSize = 2`) containing in-window groups, **When** a SILVER inspector lists, **Then** the early-access filter is applied **before** `LIMIT/OFFSET` (the hidden groups never consume a page slot and the `total` is the filtered count).

---

### User Story 2 - Start safe: off by default, only when someone qualifies, never today/D+1, only after activation (Priority: P1)

As the platform, I want early access to be **harmless until deliberately switched on and configured**, and even then to apply only where it makes sense, so that turning it on cannot hide an urgent job, cannot hide a job no high-level inspector could take anyway, and cannot retroactively pull offers already on the board.

**Why this priority**: This is decision DV3 plus gap L-F08-08. These are the guardrails that make 03.7 safe to deploy (the feature ships **off**) and safe to enable in business hours. They are as critical as the gate itself — a gate without them would hide urgent or un-takeable work.

**Independent Test**: Against the pure domain policy (`resolveEarlyAccessParams` / `isGroupInEarlyAccess`) and the real-DB suite, assert each guard independently: disabled → no filter; no reliability snapshot → no filter; no qualified-eligible inspector for a group → that group visible; today/D+1 group → never gated; a group published before `enabledAt` → visible even to a below-X inspector; and the `enabledAt` save-hook recomputing the stamp on the settings PUT.

**Acceptance Scenarios**:

1. **Given** early access `enabled = false` (the default), **When** any inspector lists or accepts any group, **Then** no early-access filter is applied and behaviour is identical to before this feature.
2. **Given** early access on but **no reliability snapshot exists yet** (F07 has not run), **When** a below-X inspector lists, **Then** every group is visible (nobody can qualify, so the window never applies) and the policy resolves to "no filter".
3. **Given** early access on and an in-window D+3 group for which **no qualified inspector is eligible** (e.g. the only GOLD inspector does not cover the group's region, or the group's service type no GOLD inspector offers, or the group's agency has blocked every GOLD inspector), **When** a below-X eligible inspector lists and accepts, **Then** the group is visible and acceptable (DV3).
4. **Given** early access on (H = 12) and an in-window group scheduled for **today** or **tomorrow (D+1)**, published 1 hour ago, **When** a below-X inspector lists and accepts, **Then** the group is visible and acceptable (urgent jobs are never gated).
5. **Given** early access switched on at `enabledAt`, a group **published before** `enabledAt`, and a below-X inspector, **When** the inspector lists and accepts, **Then** the group is visible and acceptable (activation never hides already-published offers, L-F08-08); a sibling group published **after** `enabledAt` is hidden from the same inspector.
6. **Given** a settings `PUT /v1/platform-settings/inspectorProgram` that flips `earlyAccess.enabled` `false → true` with a client-supplied `enabledAt = '2020-01-01T…Z'`, **When** the save hook runs, **Then** the stored `earlyAccess.enabledAt` is the **server** instant of the PUT and the client value is discarded; a `true → true` save keeps the previous `enabledAt`; a `… → false` save sets it to `null`.

---

### User Story 3 - Tell the inspector exactly when the offer opens, and surface `enabledAt` in the setting (Priority: P2)

As an inspector who tries to accept an offer still in its early-access window, I want the refusal to tell me the day and time (in my city's time) that the offer opens to everyone, so that at 11 pm I am not left guessing whether "9:00" means tonight or tomorrow morning; and as an AM/OP I want the `inspectorProgram` setting to report the server-computed `earlyAccess.enabledAt` so I can see when the window took effect.

**Why this priority**: The gate (US1) and the guardrails (US2) deliver the behaviour; this story is the human-facing clarity on top. The 403 is already meaningful without a formatted message, so it ranks after the engine, but a bare "not yet" message is a poor experience and the Sydney day+time wording is an explicit L-F08-08 requirement.

**Independent Test**: Against the pure `formatOpensAt` helper and the accept route test, assert the 403 body carries both `details.opensAt` (ISO UTC) and a Sydney-local "{EEE d MMM} at {h:mm a}" message that is stable regardless of the server's `TZ`; and that `GET`/`PUT /v1/platform-settings/inspectorProgram` round-trip the server-owned `earlyAccess.enabledAt`.

**Acceptance Scenarios**:

1. **Given** an in-window group published `2026-11-10T10:00:00Z` with H = 12, **When** a below-X inspector accepts, **Then** the `403 OFFER_EARLY_ACCESS_ONLY` message is "This offer opens to all inspectors on Wed 11 Nov at 9:00 am." and `details.opensAt = '2026-11-10T22:00:00.000Z'` (10:00 UTC + 12 h = 22:00 UTC = 09:00 AEDT the next civil day in Sydney).
2. **Given** the server runs with `TZ=America/Los_Angeles`, **When** the same 403 is produced, **Then** the message text is byte-identical (the formatter pins Sydney, never the process timezone).
3. **Given** an AM flips `earlyAccess.enabled` `false → true`, **When** they `GET /v1/platform-settings/inspectorProgram` afterwards, **Then** `earlyAccess.enabledAt` is the instant of the PUT, and the `platform_setting.updated` audit entry's `after` carries that `enabledAt` (03.A5, via F03).

---

### Edge Cases

- **Unpublish/republish**: a group unpublished then published again gets a fresh `published_at`, so its early-access window reopens from the new publish instant (existing `unpublishOptimistic`/`republish` behaviour; nothing special to add).
- **`published_at = NULL` on a `PUBLISHED` group** (legacy): never in a window; always visible.
- **Setting changed mid-day**: takes effect on the next read after the F03 30-second settings cache expires. Switching **on** never hides already-published offers. **Increasing H** is retroactive — a group published after `enabledAt` that was already visible to everyone can become restricted again until `published_at + H_new`; this is accepted and documented (the runbook advises changing H outside business hours). Switching off then on mints a new `enabledAt`.
- **Late-night accept** (3a): an inspector at 23:00 accepting an offer that opens at 09:00 next day gets a message that states the day ("on Wed 11 Nov at 9:00 am"), so there is no am/pm ambiguity.
- **Inspector with no snapshot**: has no level, so is treated as below any level — sees the group after H hours, or immediately if no qualified inspector is eligible for it.
- **A GOLD inspector who drops to SILVER in today's snapshot**: loses early access immediately on the next read.
- **The only qualified-eligible inspector is deactivated during the window**: on the next read the group has no qualified-eligible inspector, so it becomes visible to everyone.
- **Detail by an old deep link during the window**: the existing `404` already covers it.
- **OP manual assignment during the window**: unaffected — early access gates only the inspector-facing marketplace paths, not operator assignment.
- **Boundary — published exactly H hours ago**: at `published_at + H` the window has closed (`published_at > cutoff` is strict), so the group is visible.
- **`enabled = true` with `enabledAt = null`** (a state only a manual DB edit could produce): the policy resolves to "no filter" (the window never applies) and logs `warn marketplace.early_access_missing_enabled_at`.

## Requirements *(mandatory)*

### Functional Requirements — domain policy (service-group `domain/early-access.ts`)

- **FR-001**: A pure `resolveEarlyAccessParams({ enabled, hours, minScore, latestSnapshotDate, viewerQualifies, now, todaySydney, enabledAt })` MUST return `null` (meaning "no filter, show everything") when `enabled` is false, when the viewer already qualifies, when `latestSnapshotDate` is null (nobody can qualify), or (L-F08-08) when `enabled` is true but `enabledAt` is null — the last case MUST also log `warn marketplace.early_access_missing_enabled_at`. Otherwise it MUST return `EarlyAccessParams = { hours, cutoffUtc, enabledAtUtc, protectedFrom, minScore, latestSnapshotDate }` (`hours` is carried so the accept path can compute `opensAt = publishedAt + hours`) where `cutoffUtc = (now − hours)` and `enabledAtUtc` are UTC timestamp **text** (ISO with the trailing `Z` stripped, so the SQL `::timestamp` cast is session-timezone independent), and `protectedFrom = todaySydney + 2` civil days (today and D+1 are never gated).
- **FR-002**: A pure `isGroupInEarlyAccess({ publishedAt, scheduledDate, hasQualifiedEligible }, params)` MUST return `false` when `params` is null, when `publishedAt` is null, when `publishedAt ≤ cutoff`, when `publishedAt < enabledAtUtc` (L-F08-08), when `scheduledDate < protectedFrom` (today/D+1), or when `hasQualifiedEligible` is false; and `true` only when all those conditions pass. This is the single in-memory truth the accept path uses.
- **FR-003**: A pure `formatOpensAt(opensAt: Date)` MUST render a Sydney-local day and time as `'{EEE d MMM}'` + `'{h:mm a}'` (e.g. `'Tue 10 Nov'` and `'10:00 pm'`), identically regardless of the process `TZ`, using the shared timezone/display helpers (`PLATFORM_TIMEZONE`), never `new Date('YYYY-MM-DD')` or the process locale.

### Functional Requirements — policy port & adapter

- **FR-004**: A domain port `IOfferEarlyAccessPolicy { resolve(inspectorId: string, now: Date): Promise<EarlyAccessParams | null> }` MUST live in the service-group `domain/` so the marketplace use cases depend only on the port, not on the inspector-program module.
- **FR-005**: An adapter `OfferEarlyAccessPolicy` (inspector-program `application/offer-early-access.policy.ts`) MUST implement the port by reading the `inspectorProgram` setting, calling `InspectorProgramStandingService.hasEarlyAccess(inspectorId, now)` for `viewerQualifies`, the latest reliability snapshot date (`findLatestSnapshotDate`), and `minScoreForLevel(earlyAccess.minLevel, levels)` for `minScore`, then delegating to `resolveEarlyAccessParams`. It MUST perform this resolution at most **once per request**.

### Functional Requirements — repository (service-group `infrastructure/prisma-service-group.repository.ts`)

- **FR-006**: `findEligibleGroupIds`, `findPublishedForInspector`, `countPublishedForInspector` and `findPublishedOfferDetail` MUST each accept an `earlyAccess: EarlyAccessParams | null` as their **last** parameter (so no existing call site shifts position) and, when it is non-null, apply the agreed early-access SQL fragment in their shared `WHERE` — identically across all three read entry points so the list, the count and the detail cannot diverge. When `earlyAccess` is null the fragment is omitted and the query is byte-for-byte today's query.
- **FR-007**: The early-access SQL fragment MUST exclude a group only when it is still in its window: `published_at IS NOT NULL AND published_at > ${cutoffUtc}::timestamp AND published_at >= ${enabledAtUtc}::timestamp AND scheduled_date >= ${protectedFrom}::date AND EXISTS(a qualified-eligible inspector)`. "Qualified-eligible" reproduces the list's own eligibility (region via `ST_Intersects`, service type, agency denylist) intersected with "scored ≥ `minScore` in the latest snapshot and ACTIVE". The `EXISTS` is evaluated only for the few recently-published, non-today/D+1 groups.
- **FR-008**: A new `findEarlyAccessStateForGroup(groupId, params)` MUST return `{ publishedAt, scheduledDate, hasQualifiedEligible }` for one group using the **same** qualified-eligible SQL fragment, so the accept path's decision matches the list's exactly.
- **FR-009**: All four repository method signatures change, so every `IServiceGroupRepository` test double and every call site MUST be updated; a missed call site surfaces as a failing test (backend `tests/` are outside `tsconfig`), so the suite MUST cover each path.

### Functional Requirements — use cases

- **FR-010**: `GetMarketplaceOffersUseCase` and `GetMarketplaceOfferDetailUseCase` MUST receive the `IOfferEarlyAccessPolicy`, resolve it **once** per request, and pass the resolved `EarlyAccessParams | null` into the repository read calls (both the list and the count for the list use case).
- **FR-011**: `AcceptOfferUseCase` MUST receive the policy (an **optional, last** constructor parameter so existing wiring is unaffected) and, **after** the current checks (idempotency cache → roles → active inspector → `findById` → `canAccept()` → service type → denylist) and **before** `acceptOptimistic`, resolve the policy, call `findEarlyAccessStateForGroup`, and if `isGroupInEarlyAccess` is true throw `OfferEarlyAccessOnlyError(publishedAt + hours)` — so `acceptOptimistic` is never reached for an in-window refusal. An idempotency-cache hit MUST short-circuit before this check (unchanged behaviour).

### Functional Requirements — error & contract

- **FR-012**: A new `OfferEarlyAccessOnlyError` (service-group `domain/service-group.errors.ts`) MUST extend `ForbiddenError` with code `OFFER_EARLY_ACCESS_ONLY`, `details: { opensAt }` (ISO-8601 UTC string), and a message built by `formatOpensAt`: "This offer opens to all inspectors on {EEE d MMM} at {h:mm a}." (Sydney).
- **FR-013**: The new `403 OFFER_EARLY_ACCESS_ONLY` MUST be produced by the shared error handler (like every other domain error) and proven by the route test. It MUST NOT be hand-added as a lone `403` entry in the accept route's Fastify response schema: **no route in this codebase declares 4xx/5xx responses** (the committed `openapi.json` contains zero error-response keys), and adding one would both break that convention and risk the `fastify-type-provider-zod` response serializer throwing on the error payload (`project_fastify_response_schema_serializer_throws`). The contract is instead documented by the `OfferEarlyAccessOnlyError` class (code + `details.opensAt`) and `apps/backend/CLAUDE.md`. The list/count/detail request and response contracts are unchanged (an in-window group is simply absent for an under-levelled viewer; detail keeps its existing `404`). This slice makes **no** schema change, so `pnpm generate:api` produces no diff — but it MUST be run to confirm `openapi.json`/`api-types.ts` are not stale, and the result committed if anything changes.

### Functional Requirements — settings save hook (L-F08-08)

- **FR-014**: A pure `prepareInspectorProgramSettingForSave(previous, next, now)` (inspector-program `application/`) MUST compute `next.earlyAccess.enabledAt` as: `now.toISOString()` when `enabled` transitions to `true` (from `false`, or from no prior record) **ignoring any client-supplied value**; the previous `enabledAt` when `enabled` stays `true`; and `null` whenever `enabled` is `false` after the change.
- **FR-015**: F08-2 MUST register that function as the `inspectorProgram` entry of the existing `PLATFORM_SETTING_SAVE_HOOKS` seam **without modifying `UpdatePlatformSettingUseCase`** (the use case already looks up and applies the per-key hook after validation and before write/audit/event). Registration MUST keep the dependency direction clean (platform-settings MUST NOT import the inspector-program module); wiring at the composition root (`container.ts`) is the preferred mechanism. With no hook registered, the F03 behaviour is unchanged.

### Functional Requirements — timezone (DR5), defaults & observability

- **FR-016**: `published_at`, `cutoffUtc`, `enabledAtUtc` and `opensAt` are UTC instants (rendered in `PLATFORM_TIMEZONE` only for the 403 message); `protectedFrom` and "today/D+1" are **civil dates in `PLATFORM_TIMEZONE`**; a group's `scheduled_date` is an agency civil date compared against `protectedFrom` (equal while everything is Sydney). All conversions MUST go through the shared helpers; no `new Date('YYYY-MM-DD')`, no process timezone for business rules. Timezone-dependent tests MUST pin `TZ` away from Sydney.
- **FR-017**: Early access MUST be **off by default** (`inspectorProgram.earlyAccess.enabled = false`, the existing registry default); deploying this feature MUST have no observable effect until an AM switches it on.
- **FR-018**: A denied accept MUST log `info marketplace.early_access_denied { groupId, inspectorId, opensAt }`; the missing-`enabledAt` case MUST log `warn marketplace.early_access_missing_enabled_at`. Neither log nor the 403 may carry an inspector coordinate, name or token.

### Functional Requirements — scope & non-goals

- **FR-019**: This slice MUST NOT add any table, column, enum or migration; MUST NOT change the list/count/detail request/response shapes; MUST NOT change offer ordering or first-come acceptance; MUST NOT reuse the dead per-agency `priorityOfferHours` (Q13 — it is cross-tenant-meaningless and stays dead); and MUST NOT add audit of a denied accept (a log only).

### Key Entities

- **EarlyAccessParams** (value object, no persistence): the resolved per-request window — `{ cutoffUtc, enabledAtUtc, protectedFrom, minScore, latestSnapshotDate }`. `null` means "no window, show everything". It is computed once per request by the policy and threaded into the repository queries and the accept check so every path uses one source of truth.
- **inspectorProgram.earlyAccess setting** (existing `PlatformSetting`, no `tenant_id`, D12): `{ enabled, hours (1–72), minLevel, enabledAt (ISO-8601 Z | null) }`. `enabledAt` is server-owned (FR-014); the rest is operator-set. Default `{ enabled: false, hours: 12, minLevel: 'GOLD', enabledAt: null }`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With early access on, an in-window group for D+2-or-later that has at least one qualified-eligible inspector is, for a below-level inspector, **absent from the list, absent from the count, `404` on detail, and `403 OFFER_EARLY_ACCESS_ONLY` on accept**; for a level-≥-X inspector it is visible, readable and acceptable exactly as today (US1 tests).
- **SC-002**: Early access is off by default and has **no effect** until switched on; a group with no qualified-eligible inspector, a today/D+1 group, and a group published before `enabledAt` are each immediately visible and acceptable to everyone (US2 tests).
- **SC-003**: After H hours, every in-window group becomes visible and acceptable to all eligible inspectors (the time bound closes) — proven by advancing the clock in the real-DB test.
- **SC-004**: Switching early access on is **non-destructive** — it hides no group already published — and `earlyAccess.enabledAt` is always the server instant of activation, never a client value (US2/US3 tests).
- **SC-005**: The accept 403 states the opening day and time in Sydney wall-clock, identical under any server `TZ`, and carries `details.opensAt` as an ISO-8601 UTC instant (US3 tests).

### Acceptance criteria *(identifiers verbatim from TASK-F08-2; prose in English per Constitution §Commits)*

- **03.7** — With the window on, a group for D+2 or later, published less than H hours ago and with at least one qualified-eligible inspector, does not appear, is not counted and does not open for an inspector of level < X, and its accept responds `403`; for level ≥ X everything works as today. (Tests: accept use case, marketplace route, real-DB visibility.)
- **DV3** — Off by default; with no qualified-eligible inspector the group is immediately visible; groups for today and D+1 never have a window. (Tests: domain policy, accept use case, real-DB.)
- **L-F08-08** — Switching the window on hides no group published before activation; `enabledAt` is always server-owned; the 403 states the Sydney day and time. (Tests: settings save-hook, domain policy, accept use case, route.)
- **03.A5** — Changes to H / X / on-off are audited by F03 (`platform_setting.updated` on `inspectorProgram`, with the server `enabledAt` in `after`). **03.A3 / 03.A4** — not applicable to this slice.

## Assumptions

- **Q13 decided** (dev, 2026-10-27): offer priority is a platform **early-access-by-level** window, not the per-agency `priorityOfferHours` (dead, cross-tenant-meaningless). Decisions D2 (Q13, 2026-10-27), D3 (2026-10-27), DV1, DV3 (2026-10-28), DL8/L-F08-08 (2026-10-29) and DR5 (N13, L-X00-03, 2026-10-29) are adopted as premises.
- **Setting source**: H = `inspectorProgram.earlyAccess.hours`, X = `earlyAccess.minLevel`, on/off = `earlyAccess.enabled`, and the level thresholds = `inspectorProgram.levels`, all from the existing `PlatformSetting` (TASK-F08-1). Level is derived from the F07 reliability index (TASK-F07-2 snapshots).
- **`enabledAt` is server-owned** (L-F08-08); a client value on PUT is ignored. `enabled = true` with `enabledAt = null` (manual-edit-only state) resolves to "no window" with a warn log.
- **Dependencies merged**: TASK-F08-1 (`inspectorProgram` setting incl. `earlyAccess.enabledAt`, `InspectorProgramStandingService.hasEarlyAccess`, `minScoreForLevel`, `isEarlyAccessLevel`, `resolveInspectorLevel`) and TASK-F07-2 (reliability snapshots + `ReliabilityIndexReader`). The `PLATFORM_SETTING_SAVE_HOOKS` seam already exists (F03) and `UpdatePlatformSettingUseCase` already applies it.
- **No UI** in this slice: the PWA shows the server's list and the server's accept-error message (web AM/OP configuration is TASK-F08-3).
- **Region check already present (task-file note now stale)**: an earlier task-file "parking" note said `accept-offer` did not re-check the inspector's **region**. That is already resolved on the current branch — `AcceptOfferUseCase` calls `isGroupEligibleForInspector` (region via `ST_Intersects` + service type + denylist) before `acceptOptimistic` (`accept-offer.use-case.ts:101`). This slice therefore adds the early-access check **after** that existing eligibility check; no region gap remains to address here.
