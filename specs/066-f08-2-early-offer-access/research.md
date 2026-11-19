# Phase 0 Research — Early Offer Access by Inspector Level

All "NEEDS CLARIFICATION" from the technical context are resolved below. Each decision cites the concrete code/contract it builds on (IMPLEMENTED REALITY) or the approved decision (APPROVED RULE).

## D1 — Where the gate lives in the repository

- **Decision**: Add a private `earlyAccessExclusionSql(earlyAccess: EarlyAccessParams | null): Prisma.Sql` that returns `Prisma.empty` when null, else `AND NOT ( <window predicate> AND <qualifiedEligibleExists> )`, and interpolate it **after** the existing `inspectorEligibilitySql(...)` in `findEligibleGroupIds` (list), `countPublishedForInspector` (count) and the eligible-check of `findPublishedOfferDetail` (detail). Factor the `EXISTS(...)` subquery into `qualifiedEligibleExistsSql(earlyAccess)` so the new `findEarlyAccessStateForGroup` reuses the identical predicate.
- **Rationale**: These four paths already share one `Prisma.Sql` eligibility fragment (`prisma-service-group.repository.ts:975` `inspectorEligibilitySql`). Hanging the window off the same place is the only way the list, count and detail cannot diverge (03.7). Putting the filter in the `WHERE` guarantees it is applied **before** `LIMIT/OFFSET` (the list paginates via `findEligibleGroupIds`).
- **Alternatives rejected**: Filtering in memory after the DB read (breaks pagination and the count); duplicating the window predicate in each method (drift risk the task explicitly warns about).

## D2 — The decision is pure and the single source of truth

- **Decision**: `service-group/domain/early-access.ts` owns `resolveEarlyAccessParams(...)` (returns `EarlyAccessParams | null`), `isGroupInEarlyAccess(state, params)` (the in-memory truth for accept), and `formatOpensAt(opensAt)`. The SQL exclusion encodes the **same** predicate as `isGroupInEarlyAccess` so list/detail (SQL) and accept (in-memory) agree.
- **Rationale**: Clean Architecture — zero-dependency domain logic, fully unit-testable (task test 1). The accept path cannot run the list's SQL exclusion against one group cheaply, so it reads the three raw inputs (`findEarlyAccessStateForGroup`) and applies the pure function.
- **Parameter encoding**: `cutoffUtc`/`enabledAtUtc` are **UTC text with the trailing `Z` stripped** so the SQL `::timestamp` cast is independent of the session `TIME ZONE` (the task's documented fix for the cast-timezone hazard). `protectedFrom` is a civil date string (`todaySydney + 2`). `minScore` is a number; `latestSnapshotDate` a civil date string or null. The pure `isGroupInEarlyAccess` compares `publishedAt` (a `Date` instant) against the cutoff/enabledAt instants and compares `scheduledDate` against `protectedFrom` lexicographically (both civil-date strings) — never constructing a `Date` from a bare `YYYY-MM-DD`.

## D3 — How the policy adapter composes F08-1 / F07 contracts

- **Decision**: `inspector-program/application/offer-early-access.policy.ts` implements the service-group port `IOfferEarlyAccessPolicy`. `resolve(inspectorId, now)`:
  1. read `inspectorProgram` setting (cached 30 s via `IPlatformSettingsReader`);
  2. if `earlyAccess.enabled` is false → `null` (no snapshot read);
  3. `viewerQualifies = (await standingService.hasEarlyAccess(inspectorId, now)).hasAccess`;
  4. if `viewerQualifies` → `null`;
  5. `latestSnapshotDate = await indexReader.findLatestSnapshotDate()`;
  6. `minScore = minScoreForLevel(earlyAccess.minLevel, levels)`;
  7. return `resolveEarlyAccessParams({ enabled: true, hours, minScore, latestSnapshotDate, viewerQualifies: false, now, todaySydney, enabledAt })`.
- **Rationale**: Reuses the already-shipped F08-1 `InspectorProgramStandingService.hasEarlyAccess` (`inspector-program-standing.service.ts:251`, returns `{hasAccess, reason}` from the viewer's level vs `earlyAccess.minLevel`) and F08-1 `minScoreForLevel` (`packages/shared/src/lib/inspector-level.ts:44`). `latestSnapshotDate` is a cheap max-date read.
- **New method**: `ReliabilityIndexReader.findLatestSnapshotDate()` — a thin delegate to the already-present `IReliabilitySnapshotRepository.findLatestSnapshotDate()` (`prisma-reliability-snapshot.repository.ts:87`). The index reader is already the F08 export seam (`container.reliability.indexReader`), so inspector-program depends on reliability exactly as F08-1 already does. (No direct repo dependency across modules.)
- **Alternatives rejected**: Calling `getCurrentIndexes` in the policy to also derive `viewerQualifies` inline — would bypass the `hasEarlyAccess` contract F08-1 built "for TASK-F08-2" and duplicate level logic. The two snapshot loads (one in `hasEarlyAccess`, one `findLatestSnapshotDate`) only happen when early access is on and the viewer does not qualify (a minority path), and both are cheap and cached-adjacent.

## D4 — Where `enabledAt` is derived (L-F08-08)

- **Decision**: A pure `prepareInspectorProgramSettingForSave(previous, next, now)` (inspector-program `application/`) computes `next.earlyAccess.enabledAt`: `now.toISOString()` when `enabled` goes to `true` (from `false` or no prior record), the previous `enabledAt` while it stays `true`, `null` when it is `false`. Register it as the `inspectorProgram` entry of `PLATFORM_SETTING_SAVE_HOOKS` **by passing a merged map into `UpdatePlatformSettingUseCase` at the composition root** (`container.ts:1339` already passes the const map as an explicit arg; change it to `{ ...PLATFORM_SETTING_SAVE_HOOKS, inspectorProgram: prepareInspectorProgramSettingForSave }`).
- **Rationale**: The seam is already live — `UpdatePlatformSettingUseCase` looks up `this.saveHooks[key]` and applies `hook(before, parsed.data, now)` after validation, before write/audit/event (`update-platform-setting.use-case.ts:69-74`). `before` is the resolved previous value (defaults when no row), matching the hook's `previous`. Wiring at the container keeps `platform-settings` free of any `inspector-program` import (clean dependency direction) and avoids editing the shared `platform-setting-save-hooks.ts` const, which would both create a cross-module import and risk a merge conflict with parallel F08 tasks. The use case itself is **not** modified. The spec (FR-015) states composition-root wiring is preferred; this realises it.
- **Alternatives rejected**: Editing `platform-setting-save-hooks.ts` to import the inspector-program function (constitution I: `platform-settings/application` would import `inspector-program/application` — an inward-violating cross-module app import; also a shared-file hazard). The task's step-6 wording ("registra o hook") is satisfied: the hook *is* registered into the map the use case consumes, just at the composition root.

## D5 — Accept-path ordering and the already-fixed region gap

- **Decision**: Insert the early-access check in `AcceptOfferUseCase.execute` **after** `isGroupEligibleForInspector` (the full region+type+denylist predicate) and **before** `acceptOptimistic` (`accept-offer.use-case.ts:101-112`). Resolve the policy; if non-null, `state = findEarlyAccessStateForGroup(groupId, params)`; if `isGroupInEarlyAccess(state, params)` throw `OfferEarlyAccessOnlyError(publishedAt + hours)`. The idempotency-cache hit (`:52-61`) still short-circuits first (unchanged behaviour, task case "cache de idempotência").
- **Finding (updates the spec's parked note)**: The task's "Estacionamento" note said accept does **not** re-check region. That is now stale: `accept-offer.use-case.ts:101` already calls `isGroupEligibleForInspector` (region via `ST_Intersects` + type + denylist). So the region check exists; this slice simply adds the early-access gate alongside it. No action needed for the parked item.
- **Constructor**: the policy is an **optional, last** constructor param of `AcceptOfferUseCase` (after `availabilitySlotRepo`), so no existing wiring breaks and the use-case tests that build it without the policy keep compiling.

## D6 — The 403 error and message

- **Decision**: `OfferEarlyAccessOnlyError extends ForbiddenError` with code `OFFER_EARLY_ACCESS_ONLY`, `details: { opensAt: <ISO-8601 UTC> }`, message "This offer opens to all inspectors on {EEE d MMM} at {h:mm a}." built with `formatOpensAt` pinned to `PLATFORM_TIMEZONE`. `ForbiddenError` maps to HTTP 403 (`shared/domain/errors.ts`). `opensAt = publishedAt + hours`.
- **Rationale**: Matches the task's verbatim message and `details.opensAt`. `formatOpensAt` uses the shared Sydney display helpers / `Intl.DateTimeFormat` with `timeZone: PLATFORM_TIMEZONE`, so the text is identical under any process `TZ` (task test, and the memory `project_icu_locale_default_date_format_node_version_drift` — pin an explicit format, do not rely on the default locale).
- **Day/time format**: `{EEE d MMM}` = `'Wed 11 Nov'`; `{h:mm a}` = `'9:00 am'` (lowercase am/pm, no leading zero on hour), per the task's worked example. The exact formatter is finalised in TDD against the two worked examples (`2026-11-10T22:00Z → 'Wed 11 Nov' / '9:00 am'`; `2026-11-10T11:00Z → 'Tue 10 Nov' / '10:00 pm'`).

## D7 — `now` / `todaySydney`

- **Decision**: The policy obtains `now` from the request (the use cases pass `new Date()`), and `todaySydney = civilDateInTimezone(now, PLATFORM_TIMEZONE)` (backend `shared/domain/timezone-date.ts`). `protectedFrom = addCivilDays(todaySydney, 2)` via the shared civil-date helper.
- **Rationale**: Root CLAUDE.md §9 — platform jobs/"today" use `PLATFORM_TIMEZONE`; never the process timezone for a business rule. Tests pin `TZ` away from Sydney.

## D8 — Observability

- **Decision**: On a denied accept, log `info marketplace.early_access_denied { groupId, inspectorId, opensAt }`. In `resolveEarlyAccessParams`, when `enabled && enabledAt == null`, log `warn marketplace.early_access_missing_enabled_at`. Neither carries a coordinate, name or token.
- **Rationale**: Task "Observabilidade" + privacy rule. The warn-log for the manual-edit-only state keeps a silent misconfiguration visible without failing the request (it resolves to "no window").
