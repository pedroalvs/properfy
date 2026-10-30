# Feature Specification: Permanent Geocoding Compliance

**Feature Branch**: `035-x02-permanent-geocoding`  
**Created**: 2026-10-29  
**Status**: Draft  
**Input**: User description: "Permanent geocoding compliance: permanent=true mode, marker column and MANUAL-mode fix"
**Source task**: `fase2-etapa1/tarefas/X02-tarefas.md` → TASK-X02-1 (PR1). Out of the client contract (Mapbox terms-of-service compliance), scheduled before the map features (F01, F04, F09) and the F03 geofence BLOCK activation.

## Clarifications

### Session 2026-10-29

- Q: How should the Mapbox account spike (step 0) be handled, given the agent cannot access the dev token or the account billing page? → A: The user provided the dev token (`apps/backend/.env`, `MAPBOX_ACCESS_TOKEN`, an `sk.` secret token). The spike was run on 2026-10-29 against the dev account.
- **Spike result (2026-10-29, dev token)**: (a) `geocoding/v5/mapbox.places` with `permanent=true` → HTTP 200 with rooftop coordinates `center/geometry.coordinates = [151.207639, -33.867753]`; (b) same URL without `permanent` → HTTP 200 identical; (c) `geocoding/v5/mapbox.places-permanent` → HTTP 200 (not 403/404), indicating the account is permanent-entitled. Error envelope is `{"message": string}` (invalid token → HTTP 401 `{"message":"Not Authorized - Invalid Token"}`). No-result query → HTTP 200 `features: []`. v6 `search/geocode/v6/forward?...&permanent=true` → HTTP 200 (`features[0].geometry.coordinates = [lng, lat]`), verified viable as a reference only.
- **Decision**: stay on **v5** (`geocoding/v5/mapbox.places` + `permanent=true`); the v6 contingency (dec. 13) is **not** triggered. Because this account does not refuse, no literal "permanent unavailable" refusal body is observable; the account-error tests therefore use the provisional fixture (HTTP 403 + a `permanent`-mentioning message) **and** the dec. 14 fallback (HTTP 403 without "permanent" still counts as an account error). The CA9 positive-proof (the "Permanent Geocoding API" billing counter rising) is dashboard-only and remains a human pre-deploy smoke gate for dev/staging/prod; the `places-permanent` 200 is the programmatic entitlement signal recorded in its place.

## Overview *(context)*

Mapbox's terms of service only allow **storing** coordinates obtained in **permanent** mode (`permanent=true`). Today every geocoding write path calls Mapbox in **temporary** mode (the default) and persists the result into `properties.lat/lng` and `branches.address_json`. In addition, editing a property re-writes those temporary coordinates as if they were operator-entered `MANUAL` data, which silently disables automatic re-geocoding forever.

This feature makes every **stored** coordinate come from permanent-mode geocoding, records the provenance with a marker timestamp, stops retrying when the account lacks the permanent entitlement, and fixes the false-`MANUAL` bug. Display-only geocoding (address autocomplete, the integration connection test) stays temporary and is out of scope.

Legacy re-geocoding, `preview_json` cleanup and the bulk resume flag are a separate task (TASK-X02-2) and are **not** part of this feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Stored coordinates are always permanent and traceable (Priority: P1)

As the platform (and the operator/agency admin who creates and edits properties and branches), every coordinate the system persists must come from a permanent-mode geocoding request and be marked as such, so the platform complies with Mapbox terms and a later audit can tell permanent coordinates apart from manual, legacy or missing ones.

**Why this priority**: This is the compliance core of the task and the prerequisite that unblocks the downstream map features (F01, F04, F09) and the F03 geofence BLOCK activation. Without it the platform is in breach of Mapbox terms on every write.

**Independent Test**: Create a property with a valid address; the resulting `SUCCESS` row carries coordinates, a non-null permanent marker, and the Mapbox request carried `permanent=true`. Save a branch; its `address_json` carries coordinates only when the permanent geocode succeeded, plus the branch marker.

**Acceptance Scenarios**:

1. **Given** a new property with a geocodable address and an account that allows permanent geocoding, **When** the property is created (synchronously within the timeout) or geocoded by the worker, **Then** the Mapbox request contains `permanent=true`, the property becomes `SUCCESS`, and the permanent marker is set to the time of the geocode.
2. **Given** a branch is created or its address is updated, **When** the save runs, **Then** the address is geocoded in permanent mode and `address_json` contains `latitude`/`longitude` and the branch marker **only** if the permanent geocode succeeded.
3. **Given** address autocomplete suggestions and the connection test, **When** they are used, **Then** they still run in temporary mode and their coordinates are **never** persisted to a property or a branch.
4. **Given** any persisted coordinate, **When** its provenance is anything other than a successful permanent geocode (manual override, legacy temporary, or absent), **Then** the permanent marker is null and the PostGIS `coordinates` column stays consistent with `lat/lng`.

---

### User Story 2 - The false-`MANUAL` bug is fixed (Priority: P1)

As an operator or agency admin editing a property, saving an edit that does not touch the coordinates must not silently convert the property to `MANUAL` (which would freeze re-geocoding). Only coordinates I actually change must be treated as my manual input.

**Why this priority**: The false-`MANUAL` bug permanently disables re-geocoding for every edited property and is a precondition for any later legacy clean-up (TASK-X02-2). It is a data-integrity defect, not a cosmetic one.

**Independent Test**: Edit a `SUCCESS` property without changing the coordinate fields and save; the property stays `SUCCESS`. Change the coordinates and save; the property becomes `MANUAL`.

**Acceptance Scenarios**:

1. **Given** a `SUCCESS` property, **When** the user edits it without changing latitude/longitude, **Then** the web client does not send the coordinate fields, and the backend leaves the status, coordinates and marker unchanged.
2. **Given** a property, **When** the user enters latitude/longitude different from the stored values (compared at 7 decimal places), **Then** the property becomes `MANUAL`, the marker is cleared, and no geocode job is enqueued.
3. **Given** a `MANUAL` property, **When** the user clears both coordinate fields, **Then** the property is unlocked to `PENDING` with the marker cleared and a geocode job enqueued.
4. **Given** a non-`MANUAL` property, **When** a request arrives with `latitude: null, longitude: null` (or an incomplete pair — one field present, the other absent or null), **Then** both fields are ignored: coordinates, status and marker are unchanged, and a debug log records the ignore. If the address changed in the same request, the normal address-change flow (`PENDING` + job) applies instead.
5. **Given** a `SUCCESS` property, **When** the user picks a new autocomplete suggestion (changing the address) and saves, **Then** the property is re-geocoded (`PENDING` + job) rather than having its coordinates deleted.
6. **Invariant**: no request may ever write `MANUAL` status with a null latitude or longitude.

---

### User Story 3 - The platform stops paying for and retrying unentitled geocoding (Priority: P1)

As the platform operator, when the Mapbox account does not allow permanent geocoding, the system must store **no** coordinates, surface the failure clearly, and stop retrying — so the platform never stores a temporary coordinate under the permanent marker and never pays a (possibly billable) request per property per day forever.

**Why this priority**: An undetected account error would either silently store non-compliant coordinates or re-bill a failing request daily for every property. Correct detection and retry suppression protect both compliance and cost.

**Independent Test**: With the account rejecting permanent geocoding, create a property; it ends `FAILED` with the failure code set and the error logged, its coordinates stay null, and the retry sweep skips it.

**Acceptance Scenarios**:

1. **Given** the account rejects permanent geocoding, **When** the geocoding worker runs, **Then** the property becomes `FAILED` with failure code `MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE`, no coordinates are written, the error is logged, an audit entry carries the code, and the worker resolves without throwing (so pg-boss does not retry).
2. **Given** a `FAILED` property carrying that failure code, **When** the retry sweep runs, **Then** it is **not** re-enqueued, and the sweep logs a skipped count.
3. **Given** the account rejects permanent geocoding and the Mapbox adapter sees it as a circuit-breaker candidate, **When** six or more consecutive account errors occur, **Then** the circuit breaker does **not** open and every response still carries the account-error code (the error is raised outside the breaker).
4. **Given** an import preview batch and an account that rejects permanent geocoding, **When** the batch is verified, **Then** at most one Mapbox call is made for the batch, the remaining rows are marked `unverified` without any further call, and `import.geocode_verify_permanent_unavailable` is logged once for the batch.
5. **Given** a geocoding result of `null` (address not found) rather than an account error, **When** the worker records `FAILED`, **Then** no failure code is set and the normal 24-hour retry sweep still applies.

---

### User Story 4 - Pre-deploy previews do not store temporary coordinates (Priority: P2)

As the platform, an import preview produced before this feature deployed (carrying a `found` verification without a mode marker) must not be committed as a stored coordinate; it must be treated as unverified and re-geocoded in permanent mode.

**Why this priority**: It removes the dependency on TASK-X02-2 for compliance of in-flight imports; without it, a preview created yesterday could still write a temporary coordinate after deploy.

**Independent Test**: Commit an import whose preview verification is `found` without a mode; the property ends `PENDING` with no coordinates and a geocode job enqueued.

**Acceptance Scenarios**:

1. **Given** an import preview verification `found` **with** `mode: 'permanent'`, **When** the commit runs, **Then** the property is `SUCCESS` with the permanent marker set.
2. **Given** an import preview verification `found` **without** a mode (pre-deploy), **When** the commit runs, **Then** the property is `PENDING`, has no coordinates, and a geocode job is enqueued.

---

### Edge Cases

- **MANUAL property**: the worker skips it and the marker stays null.
- **Synchronous timeout with a late response**: the late result is discarded and the job re-runs the call; the stale timer is cleared; no unhandled rejection.
- **Account error on create**: `PENDING` → worker → `FAILED` with code → sweep does not re-enqueue.
- **Account recovered**: a single property can be re-queued via `POST /v1/properties/:id/geocode`; bulk resume is TASK-X02-2.
- **Invalid token** (401 without "permanent" in the message): generic error, `FAILED` without code, normal retry.
- **Equal coordinates at different precision** (`-33.80000001` vs stored `-33.8000000`): equal at 7 decimals, ignored.
- **Only one coordinate field changed** (both non-empty): the web sends the pair and the backend compares the pair. One empty and one filled: the web sends neither; an old client sending only one is ignored on the backend.
- **MANUAL + address change in the same edit**: MANUAL wins — no job, marker cleared.
- **Branch with a typed address** (the form used to initialize `(0,0)`): the backend ignores `(0,0)` and geocodes.
- **Branch updated by name only** (no address change): nothing is geocoded; `address_json` and marker untouched.
- **Branch with the same address and a null marker (legacy)**: geocoded.
- **Old client sending `latitude` on a branch**: stripped by validation (no 400).
- **Account without `mapbox` config**: the stub returns `null`; the property ends `FAILED`, the branch is saved without coordinates.
- **Branch address without number/complement**: the query string is built without empty commas.
- **Branch update that only changes `contactEmail`** while re-sending the same address (with `city = suburb`): recognized as the same address → copies the stored coordinates, no Mapbox call.
- **Branch update with the same address in different case or with surrounding spaces**: recognized as the same address (no Mapbox call).
- **Branch update with a different address and a Mapbox `null`**: the old (wrong) coordinate is dropped and the marker becomes null explicitly.
- **500-row import preview with an unentitled account**: one Mapbox call, 500 `unverified`, one error log.
- **Spike shows v5 ignores `permanent=true`** (permanent counter does not rise): the v6 contingency is triggered before coding the adapter; no code stores a coordinate before that.

## Requirements *(mandatory)*

### Functional Requirements

**Geocoding port & adapter**

- **FR-001**: The geocoding port MUST accept an optional mode (`permanent` | `temporary`) that defaults to `permanent` (fail-safe), so every caller that omits it stores permanent coordinates.
- **FR-002**: Every Mapbox request whose result is persisted MUST carry `permanent=true` and `limit=1`. This covers property create, the geocode worker, the import preview verifier and the branch save.
- **FR-003**: Temporary-mode requests MUST omit the `permanent` parameter; address autocomplete and the connection test MUST remain temporary and MUST NOT have their coordinates persisted.
- **FR-004**: When the account does not allow permanent geocoding, the adapter MUST raise a distinct account-error (code `MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE`, message "Mapbox account does not allow permanent geocoding; no coordinates were stored"), MUST NOT store any coordinate, and MUST raise it **outside** the circuit breaker so the breaker neither opens on it nor masks it.
- **FR-005**: Account-error detection MUST NOT rely on message text alone: it is an account error when the HTTP status is 401, 403 or 422 **and** (the message contains "permanent", case-insensitive, **or** matches the refusal format recorded in the spike). If the spike shows the refusal is not text-distinguishable, status 403 counts as an account error. Any other error keeps the current generic error.
- **FR-006**: A dynamic geocoding wrapper MUST expose whether the provider is configured (`isConfigured(): Promise<boolean>`, true when a `mapbox` config exists), MUST pass caller options through to the inner service, and MUST fall back to a stub returning `null` when no config exists.

**Synchronous timeout helper**

- **FR-007**: A shared synchronous-geocode helper MUST resolve with the result (or `null`) if the service answers within the timeout (default 4000 ms), MUST reject with a distinct timeout error (code `GEOCODE_TIMEOUT`) when the timeout elapses, MUST pass through the service's own exceptions unchanged (including the account error), MUST swallow a late rejection from a lost call without an unhandled rejection, and MUST always clear its timer.

**Address query formatter**

- **FR-008**: A shared, pure (no I/O) address-query formatter MUST join address parts in the order street, number, complement, addressLine2, suburb, city, state, postcode, country; trim each part; omit empty/null/undefined parts; use `', '` as the separator; and omit `city` when it equals `suburb` case-insensitively.
- **FR-009**: A shared address-equality helper MUST treat two addresses as the same when their formatted queries are equal after `trim().toLowerCase()`, ignoring extra `address_json` keys (`latitude`, `longitude`, `formattedAddress`, `provider`). While `PropertyEntity.fullAddress` exists, the formatter applied to a property entity MUST return the same string (locked by test).

**Data model & provenance**

- **FR-010**: Properties MUST gain a nullable permanent-geocoding marker timestamp (set when lat/lng were written from a permanent geocode; null for no coordinate, MANUAL or legacy temporary) and a nullable failure code (`VarChar(64)`; the reason a `FAILED` is not auto-retried). Branches MUST gain the same nullable marker. The migration MUST be expand-only (`ADD COLUMN … NULL`, no backfill), apply without drift, and MUST NOT drop the `Unsupported()` PostGIS index.
- **FR-011**: The new columns MUST NOT be exposed in any public API response or UI.
- **FR-012**: The entity props MUST be optional with a `null` default so existing fixtures and untyped test wirings keep compiling.
- **FR-013**: Lat/lng and the PostGIS `coordinates` column MUST only ever be written through the repository, which keeps them consistent; no write path may set lat/lng with a direct Prisma update.

**Property write paths**

- **FR-014**: A permanent `SUCCESS` (synchronous create, worker, or commit with a permanent mode) MUST set lat/lng, the marker to now, and the failure code to null.
- **FR-015**: Property create MUST use the shared timeout helper (replacing its private timeout and constant), keeping the configurable timeout constructor parameter; on account error or any other error/timeout it goes `PENDING` + job; on `null` it is `FAILED`.
- **FR-016**: The geocode worker MUST skip `MANUAL` and `SUCCESS`; on success set the marker and clear the code; on account error set `FAILED` + code, audit with the code, log an error, and **not** throw; on a generic error set `FAILED` without a code; on `null` set `FAILED` with "no results" and not clear lat/lng.
- **FR-017**: The retry sweep MUST re-enqueue only `FAILED` rows **without** a failure code (filtered by `failure_code IS NULL`), and log the count it skipped (from a repository count of blocked rows).
- **FR-018**: `POST /v1/properties/:propertyId/geocode` MUST keep its contract (AM/OP; 202 PENDING; 404; `PROPERTY_GEOCODING_MANUAL_OVERRIDE` for MANUAL) and additionally clear the failure code.

**Property update (`PATCH /v1/properties/:propertyId`)**

- **FR-019**: The route, RBAC, request and response are unchanged; only the latitude/longitude behavior changes, per User Story 2: both present/non-null/different → `MANUAL` + marker null, no job; both equal to stored → ignored; both null in a `MANUAL` → unlock; both null in a non-`MANUAL` → ignored (debug log); incomplete pair → ignored. The invariant "never `MANUAL` with a null coordinate" holds in every branch.

**Import preview & commit**

- **FR-020**: The import `found` verification variant MUST declare an optional `mode: 'permanent'` field (so serialization keeps it), and the verifier MUST set it. On an account error the verifier MUST short-circuit the batch: log `import.geocode_verify_permanent_unavailable` once with the remaining count and mark the rest `unverified` without calling Mapbox; other errors become `unverified` with a single aggregated warn carrying the failed count.
- **FR-021**: On commit, a `found` verification **with** a mode becomes `SUCCESS` with the marker; a `found` verification **without** a mode (pre-deploy) is treated as `unverified` → `PENDING`, no coordinates, geocode job enqueued.

**Branches (`POST`/`PATCH /v1/tenants/:tenantId/branches...`)**

- **FR-022**: The branch address schema MUST drop `latitude`/`longitude` (an old client sending them is stripped by validation, no 400) and MUST remain a plain `z.object` with no top-level `.transform`/`.refine`/`.superRefine`/`.passthrough`/`.strict`, so F01 can derive it with `.extend(...)`.
- **FR-023**: Branch create MUST geocode the address in permanent mode via the shared timeout helper using the shared query formatter; `address_json` carries lat/lng + marker only on success; on `null`/error/timeout it saves without coordinates and an explicit null marker, logging the appropriate warn/error. A geocoding failure MUST NEVER fail the save.
- **FR-024**: Branch update MUST: when `address` is absent, touch neither `address_json` nor the marker; when the address is unchanged (per the equality helper) and the marker is present, copy the stored lat/lng into the new `address_json` (`{ ...address, latitude, longitude }`) and keep the marker without calling Mapbox; when the address changed, or is unchanged but the marker is null, geocode — on success write the new JSON + lat/lng + marker now, on `null`/error/timeout write the new JSON **without** lat/lng and an **explicit** null marker.
- **FR-025**: Branch RBAC is unchanged (AM/OP any tenant; CL_ADMIN own tenant; CL_USER/INSP/TNT → 403 `AUTH_FORBIDDEN`). The container wiring order MUST be adjusted so the geocoding service is injected into the branch use cases (regression covered by the route test).

**Logs, audit & metrics**

- **FR-026**: Logs and audit metadata MUST match the English copy table in the task (account-error worker error, create fallback warn, retry skip info, legacy-preview info, coordinate-unchanged/null-ignored debug, import batch error/warn, branch account-error error, branch no-coordinate warn, and the `property.geocoding_failed` audit `metadata.code`). The `geocoding.failedCount` gauge keeps counting every `FAILED`; no new metric is added.

**Contract / build**

- **FR-027**: After the branch and import schema changes, the OpenAPI spec and the typed API client MUST be regenerated and committed; CI contract-freshness must pass.
- **FR-028**: The transition clause of rule N4 in `apps/backend/CLAUDE.md` §10 MUST be removed in this PR, and the final N4 text MUST be consistent with the permanent-by-default, no-temporary-on-account-error, FAILED+code-no-retry and MANUAL-only-when-changed rules.

### Key Entities *(data)*

- **Property geocoding provenance**: a property gains a nullable permanent marker timestamp (when lat/lng came from a permanent geocode) and a nullable failure code (why a FAILED is not auto-retried: `MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE` here; `LEGACY_PERMANENT_NO_RESULT` is TASK-X02-2). Coordinates remain `Decimal(10,7)` mirrored to a PostGIS point.
- **Branch geocoding provenance**: a branch gains a nullable permanent marker timestamp; its coordinates live inside `address_json` (not a column), so the marker lives in a column to keep the legacy script idempotent and the update able to decide whether it may keep the coordinates.
- **Geocoding mode & account error**: the port's mode option and the account-error type are the compliance boundary between storable (permanent) and non-storable (temporary) coordinates.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **CA1 (X02 plan)**: every request whose result is stored sends `permanent=true` — property create, the worker, the import verifier and the branch save.
- **CA2 (X02 plan)**: autocomplete stays temporary and its coordinates are never stored, for either properties or branches.
- **CA3 (X02 plan)**: with the account lacking permanent mode, no coordinate is stored; the error appears in the log (with `code`) and in the property status (`FAILED`).
- **CA4 (dec. 6)**: a `FAILED` caused by an account error is re-enqueued by neither the sweep nor pg-boss.
- **CA5 (dec. 4)**: every write from permanent mode fills the marker; coordinates from any other origin leave the marker null; the PostGIS `coordinates` column is always consistent with lat/lng.
- **CA6 (dec. 5 & 8)**: typed lat/lng different from the stored values become `MANUAL`; editing a property without changing the coordinates does not change the status; the web does not send coordinates that were not changed.
- **CA7 (dec. 9)**: committing a pre-deploy preview stores no temporary coordinate.
- **CA8**: the migration applies without drift; `openapi.json` and `api-types.ts` are regenerated; backend, shared and web lint, typecheck and tests pass.
- **CA9 (L-X02-01)**: permanent mode was confirmed in the spike by positive proof (the "Permanent Geocoding API" counter rises), recorded in `docs/ops/pre-deploy-smoke-checklist.md`, before the adapter step; the adapter URL and the refusal format in the tests come from the spike.
- **CA10 (L-X02-02)**: no `PATCH` stores `MANUAL` without a coordinate; editing a `SUCCESS` property by picking a new autocomplete suggestion re-geocodes (`PENDING` + job) instead of deleting the coordinates.
- **CA11 (L-X02-04)**: saving a branch without changing the address calls no Mapbox and preserves lat/lng and the marker; a changed address that fails leaves the marker null.
- **CA12 (L-X02-07)**: with the account lacking the feature, the import preview makes at most one call per batch and logs `import.geocode_verify_permanent_unavailable`.

## Assumptions

- **Mapbox spike (resolved 2026-10-29, L-X02-01, dec. 12–15)**: the spike was run against the dev account and **confirms v5** — `geocoding/v5/mapbox.places` with `permanent=true` returns 200 with coordinates and the `mapbox.places-permanent` endpoint is entitled (200). The adapter targets v5; the v6 contingency (dec. 13) is not triggered (v6 remains the documented fallback if a later account loses v5 permanent). Because the dev account does not refuse, the account-error tests use the provisional fixture (HTTP 403 + `permanent` message) and the dec. 14 fallback (403 without "permanent" ⇒ account error). The CA9 counter-rise proof is dashboard-only and stays a human pre-deploy smoke gate recorded in `docs/ops/pre-deploy-smoke-checklist.md`; the `places-permanent` 200 is the programmatic entitlement signal. See the Clarifications section for the literal spike output.
- **Account entitlement request runs in parallel**: the request to enable permanent mode for dev/staging/prod is opened on the spike day with a named owner; the smoke checklist records positive proof (the counter), not just a 200.
- **Permanent-mode cost is accepted**: permanent geocoding costs ~US$ 0.005 per request (no free tier) and is accepted for every write path, including every import-preview row. The daily sweep cost (`FAILED` rows without a code × US$ 0.005) is measured at rollout (dec. 22) and decides whether the 24-hour cool-off stays or becomes weekly (any change is a separate task).
- **Scope**: legacy re-geocoding, `preview_json` cleanup and the bulk `--retry-failed-permanent` flag are TASK-X02-2 and out of scope here. No provider/API change other than the single v6 adapter contingency. No branch geocoding job/retry/status, no branch-coordinate display, no new UI copy. Directions/Matrix terms belong to F04.
- **Multi-tenant**: this feature adds no cross-tenant platform-scoped entity; the new columns live on the already tenant-scoped `properties` and `branches` tables, so the §7 multi-tenant exception does not apply.
- **Exported contracts for F01**: `formatGeocodingQuery`, `isSameGeocodingAddress` (in `shared/domain/geocoding-address.ts`) and `geocodeWithTimeout` + `GEOCODE_SYNC_TIMEOUT_MS` (in the property application layer) are a fixed contract F01 will consume; their names and paths cannot change without notifying F01.
