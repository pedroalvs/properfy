# Feature Specification: Legacy Permanent Re-Geocoding

**Feature Branch**: `044-x02-2-legacy-regeocode`  
**Created**: 2026-10-30  
**Status**: Draft  
**Input**: User description: "Legacy permanent re-geocoding script: regeocode legacy properties and branches in permanent mode, detect false MANUAL via audit, strip temporary coordinates from committed import previews, bulk retry account-blocked geocoding"
**Source task**: `fase2-etapa1/tarefas/X02-tarefas.md` → TASK-X02-2 (PR2). Out of the client contract (Mapbox terms-of-service compliance, legacy clean-up). Depends on TASK-X02-1 merged **and in production**.

## Clarifications

### Session 2026-10-30

- Q: Does the Mapbox spike need re-running for this task? → A: No. TASK-X02-1 resolved it on 2026-10-29 against the dev account: **v5 confirmed** (`geocoding/v5/mapbox.places` + `permanent=true` → HTTP 200 with coordinates), the dev account is permanent-entitled (`mapbox.places-permanent` → 200), the error envelope is `{"message": string}`, and a no-result query returns HTTP 200 `features: []`. This task reuses that outcome; the v6 contingency (dec. 13) is not triggered. The account-error path exists (the adapter raises `MapboxPermanentGeocodingUnavailableError`) but does not normally fire on the entitled account; the script's abort-on-account-error behavior is still implemented and tested with a fake geocoder.
- Q: This task builds the script + tests + PR now, but the task file says it depends on X02-1 **in production**. What is in scope now? → A: Building the script, its repository methods, tests (unit + DB integration) and the runbook is in scope now and ships as one PR to `develop`. **Execution against real data is a separate, gated OPS step** performed by a human only after X02-1 is deployed (dev → staging → prod); it is explicitly NOT part of this PR and the script MUST default to dry-run so an accidental run writes nothing.

## Overview *(context)*

Properties and branches stored before TASK-X02-1 hold coordinates obtained in Mapbox **temporary** mode, which the terms of service forbid storing. Committed imports also keep those temporary coordinates in `appointment_imports.preview_json` indefinitely. In addition, the false-`MANUAL` bug (fixed by TASK-X02-1) re-wrote temporary Mapbox coordinates as operator-entered `MANUAL` data on every property edit, which froze re-geocoding for those rows.

This feature delivers a **single CLI script** — throttled, idempotent (via the `geocoded_permanently_at` marker), resumable and reporting — that:

1. re-geocodes that legacy (non-`MANUAL`, no marker) in permanent mode;
2. detects the false-`MANUAL` rows from the audit trail, restores them to a non-`MANUAL` status and re-geocodes them in permanent mode;
3. strips the temporary coordinates out of committed import previews;
4. offers a flag to bulk re-enqueue the properties blocked by an account error, once the account is fixed.

The script defaults to **dry-run**. Execution against real data (staging, then prod) is a separate human-run OPS step, gated on TASK-X02-1 being in production, and is NOT part of this PR. There is **no migration** (the TASK-X02-1 columns already exist); writes go through new repository methods so the PostGIS `coordinates` column stays consistent and every write is a compare-and-set.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Legacy coordinates re-geocoded permanently, idempotently and safely (Priority: P1)

As the platform operator running the legacy clean-up, I run a single script that re-geocodes every legacy property and branch (temporary or `(0,0)` coordinates, non-`MANUAL`, no permanent marker) in permanent mode, keeps the PostGIS point consistent, is safe to re-run and interrupt, and produces a JSON report of what was updated, what moved and what failed — without ever overwriting a row edited after it was selected.

**Why this priority**: This is the compliance core of the task — it brings existing stored coordinates into terms-of-service compliance and produces the audit input the F03 geofence BLOCK activation depends on. Everything else (false-MANUAL, preview strip, bulk retry) is a bounded add-on.

**Independent Test**: Seed a mix of property rows (SUCCESS without marker, SUCCESS with marker, PENDING with lat, FAILED with lat, MANUAL, soft-deleted, no lat) and one branch with lat and one without `address_json`; run with `--apply` and a fake geocoder; only the SUCCESS-without-marker, the PENDING-with-lat, the FAILED-with-lat and the branch-with-lat change, each with the PostGIS point matching the new lat/lng; re-running reports `scanned: 0`.

**Acceptance Scenarios**:

1. **Given** a legacy property (`deleted_at IS NULL AND lat IS NOT NULL AND geocoding_status <> 'MANUAL' AND geocoded_permanently_at IS NULL` and not already `LEGACY_PERMANENT_NO_RESULT`), **When** the script runs with `--apply` and the geocoder returns coordinates, **Then** the row becomes `SUCCESS` with lat/lng updated, the permanent marker set to now, the failure code cleared, and the PostGIS `coordinates` column set to `ST_SetSRID(ST_MakePoint(lng,lat),4326)`; the geocoder was called with the formatted address query and `{ mode: 'permanent' }`.
2. **Given** a legacy property, **When** the geocoder returns `null` (no result), **Then** the row becomes `FAILED` with failure code `LEGACY_PERMANENT_NO_RESULT`, its lat/lng and `coordinates` are **left unchanged** (the residual temporary coordinate is kept until manual correction), and it appears in the report's `noResult` list.
3. **Given** a legacy branch (`deleted_at IS NULL AND geocoded_permanently_at IS NULL AND address_json ? 'latitude'`, which includes `(0,0)` rows), **When** the script runs with `--apply` and the geocoder returns coordinates, **Then** only `latitude`/`longitude` inside `address_json` are updated (via a jsonb merge that never rewrites the address) and the branch marker is set to now; a `null` result changes nothing and lists the branch in `noResult`.
4. **Given** no flags, **When** the script runs (dry-run, the default), **Then** it writes nothing, calls no Mapbox, enqueues nothing, counts the candidates per phase, and fills `estimatedRequests` (`falseManual`, `properties`, `branches`, `total`).
5. **Given** a row selected for an update, **When** that row was edited (any field, tracked by `updated_at`) between selection and the write, **Then** the compare-and-set fails, the row is counted in `skippedConcurrent`, and nothing is written; a branch whose `address_json` was replaced meanwhile keeps the user's new address byte-for-byte.
6. **Given** a run that is interrupted or re-run, **When** it runs again, **Then** rows already written (carrying a marker or the `LEGACY_PERMANENT_NO_RESULT` code) are not selected again, so the run is idempotent.
7. **Given** the throttle `--rate` (default 120 req/min), **When** the script calls Mapbox, **Then** it waits `60000/rate` ms between calls; on a `429` it sleeps 60 s and retries the same row once, counting a second failure in `errors`.
8. **Given** `--limit=<n>`, **When** the script runs, **Then** the limit applies **per phase** (false-MANUAL, properties, branches) and counts **selected** entities, not Mapbox calls; `--tenant=<uuid>` restricts **every** phase (including `--strip-import-previews` and `--retry-failed-permanent`) to that tenant.

---

### User Story 2 - False-`MANUAL` rows detected from the audit trail and restored (Priority: P1)

As the platform operator, the script detects the properties that the (now-fixed) bug turned into `MANUAL` by re-saving a temporary Mapbox coordinate as "user data", confirms them with two proofs, restores the confirmed ones to `SUCCESS` with a fresh permanent coordinate, and lists the ambiguous or audit-less ones for manual review — never touching a legitimate `MANUAL`.

**Why this priority**: These rows are permanently excluded from the legacy selection (the worker skips `MANUAL`), so without this phase they would stay non-compliant forever. The detection must be conservative: a wrong restoration silently moves an operator's pin.

**Independent Test**: Seed (a) MANUAL with an audit `SUCCESS→MANUAL`, same address, coordinate equal to the fake geocode; (b) same but 50 m away; (c) MANUAL with no audit; (d) MANUAL whose audit `street` changed; (e) MANUAL with two transitions, the latest changing the address; run `--apply`; only (a) becomes `SUCCESS` with the marker, PostGIS consistent and a `property.false_manual_restored` audit; (b) is `ambiguous:coordinates_differ`, (c) `missingAudit`, (d) and (e) `ambiguous:address_changed_in_transition`; (b)–(e) stay byte-for-byte.

**Acceptance Scenarios**:

1. **Given** a `MANUAL` property with coordinates, **When** the script classifies it, **Then** it is a **candidate** only if Proof 1 holds: the most recent `property.updated` audit transition into `MANUAL` (`after.geocodingStatus = 'MANUAL'`, `before.geocodingStatus <> 'MANUAL'`) exists, is not redacted, and has equal `street`, `suburb`, `state` and `country` in `before` and `after` (compared trimmed, case-insensitive).
2. **Given** a candidate, **When** running with `--apply`, **Then** the current address is geocoded in permanent mode and Proof 2 is checked: if the result is within `--false-manual-tolerance-m` (default 5) by haversine, the row is **restored** to `SUCCESS` with lat/lng set to the permanent result, the marker set, the code cleared, the PostGIS point consistent, and an audit `property.false_manual_restored` carrying `auditLogId`, `distanceM` and `toleranceM`; the same single Mapbox call is both the proof and the new value.
3. **Given** a candidate whose geocode is farther than the tolerance, **When** classified, **Then** it is `ambiguous:coordinates_differ` with `distanceM` and no write; a `null` result is `ambiguous:no_result` (the `MANUAL` is kept, never turned into `FAILED`); a generic error is `ambiguous:geocode_error`; an account error **aborts** the whole script.
4. **Given** a `MANUAL` row with no transition audit, **When** classified, **Then** it is `missingAudit` with no write and no Mapbox call; a redacted audit is `ambiguous:audit_redacted`; an audit whose `street`/`suburb`/`state`/`country` changed in the transition is `ambiguous:address_changed_in_transition` with no Mapbox call.
5. **Given** any `ambiguous` row, **When** the report is built, **Then** it carries `addressChangedAfterTransition` (true when a later `property.updated` audit changed `street`/`suburb`/`state`/`country`), computed with one batched audit query and no Mapbox call, so manual review can prioritize those.
6. **Given** a dry-run, **When** the false-MANUAL phase runs, **Then** Proofs-1-to-3 classification runs (audit only, no Mapbox), reporting `manualWithCoordinates`, `auditCandidates`, `missingAudit` and the audit-only `ambiguous`; `restored` stays 0 and `estimatedRequests.falseManual` equals the candidate count.
7. **Given** a restored row, **When** the script re-runs, **Then** it is `SUCCESS` with a marker and is no longer a candidate (`restored: 0` on the second run).

---

### User Story 3 - Committed import previews stripped of temporary coordinates (Priority: P2)

As the platform, the temporary coordinates frozen inside committed import previews (`preview_json`) are removed so no stored artifact keeps a non-compliant coordinate, while the rest of the preview (summary, issues, verified `found` rows) is left intact so the import-status screen keeps working.

**Why this priority**: It closes the last place a temporary coordinate is stored, but it is narrow, Mapbox-free and independent of the re-geocoding phases.

**Independent Test**: With `--strip-import-previews --apply`, a `preview_json` holding two `found` rows without a mode, one `found` with `mode: 'permanent'` and one `not_found` becomes two `null`s, keeping the `mode` row and the `not_found`; `stripped` counts 1 (the preview changed).

**Acceptance Scenarios**:

1. **Given** a committed import (`status` not `PREVIEW` and not `PROCESSING`, `preview_json IS NOT NULL`), **When** `--strip-import-previews --apply` runs, **Then** every `rows[i].property.geocode` with `status === 'found'` and **no** `mode` is replaced by `null`, the row is written only if something changed, and verified (`mode: 'permanent'`) and `not_found` entries are left intact.
2. **Given** `--tenant=X`, **When** the strip runs, **Then** only imports of tenant X are scanned; `PREVIEW` imports (handled by the existing sweep) and `PROCESSING` imports (commit in progress) are never touched.

---

### User Story 4 - Bulk resume of account-blocked geocoding (Priority: P2)

As the platform operator, after the Mapbox account is fixed, I run a single flag that re-enqueues every property blocked by an account error (`FAILED` with code `MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE`) so the normal worker re-geocodes them, without re-geocoding anything else.

**Why this priority**: It is the recovery path for a correctable account outage, but orthogonal to the legacy clean-up.

**Independent Test**: With two blocked properties, `--retry-failed-permanent --apply` sets each to `PENDING` with the code cleared and enqueues `property.geocode` for each; `retriedFailedPermanent` is 2.

**Acceptance Scenarios**:

1. **Given** properties `FAILED` with code `MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE` (optionally scoped by `--tenant`), **When** `--retry-failed-permanent --apply` runs, **Then** each is set to `PENDING` with the code cleared and a `property.geocode` job enqueued (`retryLimit: 6`, `retryBackoff: true`); the queue is stopped in a `finally`.
2. **Given** `--retry-failed-permanent`, **When** combined with `--entities` or `--strip-import-previews`, **Then** the script exits with code 2 and an incompatibility message, because the resume runs alone.

---

### Edge Cases

- **Re-run after a complete `--apply`**: property `scanned` is 0 (the `LEGACY_PERMANENT_NO_RESULT` rows are excluded by the selection).
- **`MANUAL` property**: never in the legacy selection; only the false-MANUAL phase can change it, and only with both proofs.
- **PENDING/FAILED with an old lat**: selected; a successful geocode makes it `SUCCESS`.
- **SUCCESS created after TASK-X02-1**: has a marker, not selected. **Soft-deleted**: not selected.
- **Row edited during the run** (lat, status, address or any field, via `updated_at`): the CAS fails, counted in `skippedConcurrent`. Includes "address changed, lat equal" (PENDING with the old lat): the script does not write and the worker re-geocodes the new address.
- **Branch at `(0,0)`**: selected; a `null` result keeps `(0,0)` and lists it for manual correction. **Branch without `address_json` or without `latitude`**: not selected.
- **Branch with no result on re-runs**: re-selected each run (few rows, accepted cost), listed in the report.
- **Displacement below `--move-threshold-m` (default 25)**: counted in `updated`, not `moved`.
- **Import `PROCESSING`**: ignored. Import with `found` + `mode`: intact. Import with no legacy `found`: not re-written.
- **`isConfigured()` returns false**: abort before selecting, `aborted.code = 'MAPBOX_NOT_CONFIGURED'`; the stub would otherwise fabricate mass `noResult`.
- **`--retry-failed-permanent` with the account still unentitled**: the jobs go back to `FAILED` with the code, no loss (visible in the worker log).
- **`--rate=0`, `--limit=-1`, `--false-manual-tolerance-m<=0`, or an incompatible combination**: exit 2.
- **`MANUAL` with several edits**: the most recent non-`MANUAL`→`MANUAL` transition is used; a later MANUAL→MANUAL edit that changed the address leaves the pin at the old address → Proof 2 fails (`coordinates_differ`) and `addressChangedAfterTransition: true` flags it for review.
- **Change of only `postcode`/`addressLine2` in the transition**: the audit does not record those, so Proof 1 passes, but the re-written coordinate was the previous address's, so Proof 2 usually yields `coordinates_differ` — **intentional**; it must NOT raise the tolerance (which would restore legitimate `MANUAL`).
- **Legitimate `MANUAL` within 5 m of the geocode**: restored to `SUCCESS` with the permanent coordinate; ≤5 m loss accepted; reversible from the `before` audit.
- **`MANUAL` whose audit was purged by retention or never existed** (migrated data): `missingAudit`, unchanged.
- **429 then success on retry**: the row is written, one `regeocode.rate_limited_retry` logged.
- **Account error mid-run**: aborts immediately (`aborted`, exit 1); rows already written stay.
- **No candidates**: report with zeros, exit 0.
- **Dry-run with `estimatedRequests.total × 0.005 > US$ 200`**: the script does not block; the runbook requires dev sign-off before `--apply` in prod.

## Requirements *(mandatory)*

### Functional Requirements

**CLI & safety**

- **FR-001**: The script MUST be a single file `apps/backend/src/scripts/regeocode-permanent.ts` with an exported function `regeocodePermanent(deps, options)` and an `isDirectInvocation` guard so importing the module is inert; execution is `pnpm --filter backend tsx --env-file .env src/scripts/regeocode-permanent.ts [options]` (prod via `fly ssh console`), following the `backfill-property-branch.ts` precedent.
- **FR-002**: With no flags the script MUST run in **dry-run**: write nothing, call no Mapbox, enqueue nothing; count candidates per phase and fill `estimatedRequests`. `--apply` MUST be required to execute any phase.
- **FR-003**: The script MUST parse `--apply`, `--entities=properties,branches,false-manual` (default all three), `--false-manual-tolerance-m` (default 5), `--strip-import-previews`, `--retry-failed-permanent`, `--tenant=<uuid>`, `--limit=<n>` (per phase, counting selected entities), `--rate=<req/min>` (default 120), `--move-threshold-m` (default 25). Exit codes: `0` success (JSON report to stdout); `1` account error / Mapbox not configured / unexpected error; `2` invalid argument or incompatible combination (messages `Invalid argument: <arg>` and `--retry-failed-permanent cannot be combined with <flag>`).
- **FR-004**: Before selecting anything the script MUST verify the geocoder is configured via `isConfigured()` (TASK-X02-1's `DynamicGeocodingService.isConfigured()`); if false it MUST abort with `aborted.code = 'MAPBOX_NOT_CONFIGURED'` and exit 1, selecting nothing.
- **FR-005**: An account error (`MapboxPermanentGeocodingUnavailableError`) from any geocode MUST abort the whole run immediately (`aborted.code = 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE'`, `atEntityId` = the offending row), leaving already-written rows in place, exit 1.
- **FR-006**: The throttle MUST wait `60000/rate` ms between Mapbox calls; a `429` MUST trigger `sleep(60000)` and one retry of the same row, with a second failure counted in `errors`; `--rate` default is 120 (one fifth of the v5 600 req/min limit). `sleep` MUST be injectable for tests.

**Selection & phase order**

- **FR-007**: The phase order MUST be: import-preview strip (if requested) → false-MANUAL → properties (legacy) → branches. `--retry-failed-permanent` runs alone.
- **FR-008**: Property legacy selection MUST be `deleted_at IS NULL AND lat IS NOT NULL AND geocoding_status <> 'MANUAL' AND geocoded_permanently_at IS NULL AND (geocoding_failure_code IS NULL OR geocoding_failure_code <> 'LEGACY_PERMANENT_NO_RESULT')`, optionally `AND tenant_id = :tenant`, ordered by `id` in batches of 100, returning `updated_at` for the CAS. The geocode query MUST be `formatGeocodingQuery({ street, addressLine2, suburb, state, postcode, country })` (TASK-X02-1's formatter, locked equal to `fullAddress`).
- **FR-009**: Branch legacy selection MUST be `deleted_at IS NULL AND geocoded_permanently_at IS NULL AND address_json ? 'latitude'` (via `$queryRaw`), optionally scoped by tenant, returning `updated_at`; the geocode query is `formatGeocodingQuery(address_json)`.
- **FR-010**: `--limit` MUST apply to each phase's selection independently and count selected entities, not Mapbox calls; `--tenant` MUST scope every phase including the strip and the bulk retry; the chosen `limit` MUST appear in the `regeocode.started` log.

**Writes & concurrency (no migration)**

- **FR-011**: There MUST be no migration. All new read/write methods the script needs live on a **narrow, script-scoped port `ILegacyRegeocodeRepository`** (new domain file) implemented by the existing `PrismaPropertyRepository` class (so coordinate writes reuse its private `syncCoordinates`); the shared `IPropertyRepository` is left untouched. All lat/lng writes MUST run a CAS `updateMany` and `syncCoordinates` in one `$transaction` so the PostGIS `coordinates` column stays consistent; the script MUST NOT call `prisma.property.update*` directly for coordinates.
- **FR-012**: `applyPermanentBackfill(id, tenantId, expected: { lat, lng, updatedAt }, next: { lat, lng })` MUST CAS on `{ id, tenant_id, lat: expected.lat, lng: expected.lng, updated_at: expected.updatedAt, geocoding_status: { not: 'MANUAL' }, geocoded_permanently_at: null }` and set `{ lat: next.lat, lng: next.lng, geocoding_status: 'SUCCESS', geocoded_permanently_at: now, geocoding_failure_code: null }`, call `syncCoordinates` when a row changed, and return a boolean.
- **FR-013**: `markLegacyNoResult(id, tenantId, expected: { lat, lng, updatedAt })` MUST CAS the same way and set `{ geocoding_status: 'FAILED', geocoding_failure_code: 'LEGACY_PERMANENT_NO_RESULT' }` **without** altering lat, lng or `coordinates`, returning a boolean.
- **FR-014**: `restoreFalseManual(id, tenantId, expected: { lat, lng, updatedAt }, next: { lat, lng })` MUST CAS on `{ id, tenant_id, geocoding_status: 'MANUAL', lat, lng, updated_at }` and set `{ lat: next.lat, lng: next.lng, geocoding_status: 'SUCCESS', geocoded_permanently_at: now, geocoding_failure_code: null }`, call `syncCoordinates` when a row changed, and return a boolean.
- **FR-015**: `backfillBranchCoordinates` MUST be a single `$executeRaw` jsonb merge `UPDATE branches SET address_json = address_json || jsonb_build_object('latitude', $lat, 'longitude', $lng), geocoded_permanently_at = now(), updated_at = now() WHERE id = $id AND tenant_id = $t AND geocoded_permanently_at IS NULL AND updated_at = $read` that never rewrites the address (branches have no PostGIS column, so no `syncCoordinates`); it MUST return whether a row changed, with a lost CAS counted in `branches.skippedConcurrent`.
- **FR-016**: Every write's CAS MUST include the `updated_at` read at selection (dec. 11), so a row edited after selection (including "address changed, lat equal", which leaves the old lat on a PENDING row) is skipped rather than stamped with a stale coordinate.

**Repository selection methods** (all on `ILegacyRegeocodeRepository`)

- **FR-017**: New read methods MUST exist: `findLegacyCoordinateCandidates`, `findLegacyBranchCandidates`, `findManualWithTransitionAudit` (the audit `$queryRaw` joining `audit_logs` on `property.updated` into `MANUAL`, `DISTINCT ON (entity_id)` latest, returning `before_json`, `after_json`, `redaction_status`, `audit_log_id`, `transitioned_at` and `updated_at`), `findAddressChangesAfter`, `findImportPreviewsToStrip` and `findAccountBlockedProperties`, each `(cursor, limit, tenantId?)` where applicable, batched by `id` in 100s.

**False-MANUAL classification**

- **FR-018**: Each `MANUAL`-with-coordinates row MUST be classified in order: no `audit_log_id` → `missingAudit`; `redaction_status <> 'NONE'` → `ambiguous:audit_redacted`; `street`/`suburb`/`state`/`country` differ between `before` and `after` (trimmed, case-insensitive) → `ambiguous:address_changed_in_transition`; otherwise a **candidate** that (only with `--apply`) geocodes the current address and resolves to restored / `ambiguous:coordinates_differ` (+`distanceM`) / `ambiguous:no_result` / `ambiguous:geocode_error`, or aborts on an account error.
- **FR-019**: For each `ambiguous` row the report MUST carry `addressChangedAfterTransition`, computed by one batched `audit_logs` query (`entity_type='Property' AND action='property.updated' AND entity_id = ANY(ids) AND created_at > transitioned_at`) checking for a later `street`/`suburb`/`state`/`country` change (same trimmed, case-insensitive comparison), with no Mapbox call.
- **FR-020**: The `--false-manual-tolerance-m` distance MUST be haversine; restoration happens only within tolerance; a restored row displaced beyond `--move-threshold-m` is also counted in `falseManual.moved`.

**Import preview strip & bulk retry**

- **FR-021**: `--strip-import-previews` MUST scan committed imports (`status <> 'PREVIEW' AND status <> 'PROCESSING' AND preview_json IS NOT NULL`, optionally by tenant), replace every `rows[i].property.geocode` with `status === 'found'` and no `mode` by `null`, write only when the JSON changed, and leave the rest of the JSON intact; it MUST NOT call Mapbox.
- **FR-022**: `--retry-failed-permanent` MUST select `deleted_at IS NULL AND geocoding_status = 'FAILED' AND geocoding_failure_code = 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE'` (optionally by tenant), set each to `PENDING` with the code cleared via `repo.update`, enqueue `property.geocode` (`retryLimit: 6`, `retryBackoff: true`), run alone (incompatible with `--entities`/`--strip-import-previews`), and call `stopQueue()` in a `finally`.

**Report, logs & audit**

- **FR-023**: The script MUST return and print a `RegeocodeReport` with `dryRun`, `estimatedRequests` (`falseManual` = Proof-1 candidates only, `properties`, `branches`, `total`), `importPreviews` (`scanned`, `stripped`), `falseManual` (`manualWithCoordinates`, `auditCandidates`, `restored`, `moved`, `skippedConcurrent`, `ambiguous[]` with `id`/`propertyCode`/`tenantId`/`auditLogId`/`reason`/`distanceM`/`transitionedAt`/`addressChangedAfterTransition`, `missingAudit[]`), `properties` (`scanned`, `updated`, `moved`, `skippedConcurrent`, `noResult[]`, `errors[]`), `branches` (`scanned`, `updated`, `moved`, `skippedConcurrent`, `noResult[]`, `errors[]`), `retriedFailedPermanent`, and `aborted` (null or `{ code, atEntityId }`).
- **FR-024**: Logs MUST match the English copy table in the task (`regeocode.started` with `{ dryRun, phases, entities, tenantId, rate, limit }`, `regeocode.estimated_requests`, `regeocode.rate_limited_retry` warn, `regeocode.database` with a masked host, `regeocode.import_previews_stripped`, `regeocode.false_manual_classified`, per-row debug `regeocode.false_manual_processed` and `regeocode.entity_processed`, `regeocode.aborted_account_unavailable` error, `regeocode.aborted_not_configured` error with message `Mapbox is not configured; refusing to run`, `regeocode.retry_failed_permanent_enqueued`, `regeocode.finished`).
- **FR-025**: With `--apply` only, audits (actorType `SYSTEM`) MUST be written: `property.geocode_permanent_backfilled` (`before/after` lat/lng/status), `property.false_manual_restored` (`before` MANUAL / `after` SUCCESS, `metadata: { auditLogId, distanceM, toleranceM }`), `property.geocode_permanent_no_result` (`metadata: { code: 'LEGACY_PERMANENT_NO_RESULT', keptLegacyCoordinates: true }`), `branch.geocode_permanent_backfilled` (`before/after` latitude/longitude), `property.geocode_retry_requeued` (`metadata: { previousCode }`). No audit in dry-run. No new metric (`geocoding.failedCount` rises with `noResult`, expected).
- **FR-026**: The script MUST wire its real dependencies (`IntegrationConfigResolver` + `PrismaIntegrationSettingRepository` + `MAPBOX_ACCESS_TOKEN` env fallback → `DynamicGeocodingService`), use `sendJob`/`stopQueue` from the shared queue for the bulk retry, and mask the DB host in the log.

**Documentation**

- **FR-027**: A runbook `docs/runbooks/regeocode-permanent.md` MUST document the staging-then-prod rollout: the cost formula `cost ≈ estimatedRequests.total × US$ 0.005` with the current price noted, the **US$ 200** dev-sign-off threshold, the account's real rate limit, why `coordinates_differ` from `postcode`/`addressLine2` is expected (do not raise the tolerance), and the manual-correction recipe for `ambiguous`/`missingAudit`/`noResult` (prioritizing `addressChangedAfterTransition: true`): property → "in the web, edit the property, clear Latitude and Longitude and save (unlock → PENDING → permanent worker)"; branch → "re-open and save the address". It MUST state that the prod report (`moved`, `noResult`, `falseManual.ambiguous`, `falseManual.missingAudit`) plus the count of properties without a marker is the input to the F03 geofence BLOCK audit (dec. 18).
- **FR-028**: Every workspace CLAUDE.md the PR changes MUST be updated in the same PR (CLAUDE.md §13.11); `apps/backend/CLAUDE.md` records the new script, its repository methods and the `LEGACY_PERMANENT_NO_RESULT` code.

### Key Entities *(data)*

- **Legacy coordinate candidate (property)**: a non-`MANUAL`, non-soft-deleted property with a stored lat and a null permanent marker, not already a `LEGACY_PERMANENT_NO_RESULT`; carries `updated_at` for the CAS. Re-geocoding either stamps the marker (`SUCCESS`) or records `LEGACY_PERMANENT_NO_RESULT` while keeping the residual coordinate.
- **Legacy coordinate candidate (branch)**: a non-soft-deleted branch with a null marker whose `address_json` has a `latitude` key (includes `(0,0)`); coordinates live inside `address_json` and are updated by a jsonb merge that never rewrites the address.
- **False-`MANUAL` candidate**: a `MANUAL` property whose latest audit transition into `MANUAL` did not change the address (Proof 1) and whose current pin is within tolerance of a fresh permanent geocode (Proof 2); restoration and the new value share one Mapbox call.
- **Committed import preview**: a non-`PREVIEW`, non-`PROCESSING` import whose `preview_json` may hold legacy `found` rows without a mode; those are nulled, the rest kept.
- **Regeocode report**: the JSON summary (counts + ambiguous/missing/no-result lists + `estimatedRequests` + `aborted`) that is both the script's return value and the operational hand-off / F03 audit input.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **CA1 (X02 plan)**: the script re-geocodes existing properties and branches idempotently and with a report (updated, moved, failed).
- **CA2 (dec. 7)**: every lat/lng write by the script leaves `coordinates` equal to `ST_SetSRID(ST_MakePoint(lng,lat),4326)`.
- **CA3 (dec. 5)**: rows with no result become `FAILED` with `LEGACY_PERMANENT_NO_RESULT`, keep lat/lng and `coordinates`, and appear in `noResult`.
- **CA4 (dec. 4)**: after `--strip-import-previews --apply`, no non-`PREVIEW`/non-`PROCESSING` import keeps a `found` without a `mode`.
- **CA5 (dec. 6)**: `--retry-failed-permanent --apply` sets each blocked property to `PENDING`, clears the code and enqueues `property.geocode`.
- **CA6**: dry-run writes nothing, calls no Mapbox and enqueues nothing.
- **CA7**: an account error aborts without writing.
- **CA8**: a `MANUAL` is changed only when it passes Proofs 1 and 2; the rest (ambiguous or audit-less) stay intact and appear in the report.
- **CA9**: the throttle respects `--rate`.
- **CA10**: run in staging, with the report attached, before any `--apply` in prod.
- **CA11 (dec. 10)**: a confirmed false `MANUAL` returns to `SUCCESS` with a permanent coordinate, the marker set, `coordinates` synced, and an audit `property.false_manual_restored` with `auditLogId` and `distanceM`.
- **CA12 (L-X02-03)**: no script write overwrites a row edited after selection (CAS on `updated_at`); a branch's address is never rewritten by the script.
- **CA13 (L-X02-05)**: the report carries `estimatedRequests`; the runbook carries the cost formula, the current price and the US$ 200 threshold; a 429 is retried once after 60 s.
- **CA14 (L-X02-06)**: every `ambiguous` carries `addressChangedAfterTransition`; the runbook carries the manual-correction recipe for `ambiguous`, `missingAudit` and `noResult`.
- **CA15 (L-X02-09)**: `--limit` is per phase and counts selected entities; `--tenant` applies to every phase.

## Assumptions

- **TASK-X02-1 merged and in production (premise)**: the columns `properties.geocoded_permanently_at`, `properties.geocoding_failure_code` and `branches.geocoded_permanently_at`, the geocoding port with `{ mode: 'permanent' }`, the `MapboxPermanentGeocodingUnavailableError` account error, `DynamicGeocodingService.isConfigured()`, and `formatGeocodingQuery` (locked equal to `fullAddress`) all exist. Building this PR requires X02-1 **merged** (it is, on `develop`); **execution** requires X02-1 **deployed** and is a separate human-run OPS step, not part of this PR.
- **Mapbox spike reused (resolved 2026-10-29, X02-1)**: v5 is confirmed and the account is permanent-entitled; the v6 contingency is not triggered. The account-error abort path is implemented and tested with a fake geocoder but does not normally fire.
- **Dry-run default**: the script writes nothing without `--apply`, so an accidental run in any environment is safe. The prod run happens only after staging, outside Sydney business hours, with the report attached and (above US$ 200 estimated) dev sign-off.
- **Residual violation accepted (dec. 5)**: `noResult` rows keep their temporary coordinate until manual correction; the list is handed to operations.
- **False-MANUAL rule adaptation (dec. 10)**: because the `property.updated` audit does not store lat/lng, the literal "before/after lat/lng equal" rule is replaced by Proof 1 (address unchanged in the audit transition) + Proof 2 (current pin ≤ tolerance from a fresh permanent geocode). Confirm this adaptation satisfies the decision (carried to the reviewer).
- **Multi-tenant**: this task adds no cross-tenant platform-scoped entity; it operates on the already tenant-scoped `properties`, `branches` and `appointment_imports`, scoping every selection by tenant when `--tenant` is given and otherwise reading cross-tenant as a platform (`AM`/`OP`/`SYS`) operator-run maintenance script. `Inspector`/platform entities are not touched.
- **Scope boundaries**: no change to the import sweep, the import flow, the import screen or any TASK-X02-1 behavior; no re-geocoding of legitimate/ambiguous/audit-less `MANUAL`; no writing of lat/lng into the `property.updated` audit; no scheduling of the script as a recurring job; no manual fixing of `noResult`/`ambiguous`/`missingAudit` (operations do that from the runbook recipe); no change to the sweep's 24-hour cool-off.
