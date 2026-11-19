# Feature Specification: Inspector geocoded base address, privacy, backfill and app-state heartbeat

**Feature Branch**: `039-f01-1-inspector-base-heartbeat`
**Created**: 2026-10-30
**Status**: Draft
**Input**: TASK-F01-1 of `fase2-etapa1/tarefas/F01-tarefas.md` — backend + shared base of F01 "Inspector foundations". Contract 00.3, 00.4, 00.10; criterion **00.A5** (partial). Depends on TASK-X02-1 (permanent geocoding) merged.

## Overview

This is the foundational slice of F01 (Inspector foundations). It is backend + shared only — no UI ships here (web consumes it in TASK-F01-2, the PWA in TASK-F01-3). It delivers four capabilities the rest of F01, and F02/F04/F06, build on:

1. **A geocoded base address for every inspector.** The existing `Inspector.address` column becomes a validated Australian address (`inspectorBaseAddressSchema`, derived from the branch schema). It is **mandatory** on create, **changeable** but **never removable**, and is geocoded **synchronously in permanent mode** on save (reusing the X02 port, timeout and query helpers). A geocoding failure is not an error: the address is saved without coordinates and the client is told.
2. **Privacy by role.** The base `address` and its coordinates are visible only to AM/OP and to the inspector itself. `CL_ADMIN`/`CL_USER` stop receiving `address` (a change from today's behavior) and never receive any of the new fields.
3. **An app-state heartbeat.** A new `POST /v1/inspectors/me/app-state` lets the inspector's app report `{displayMode, pushPermission, appVersion}`; the server records first-install, last-seen, browser-push permission and app version on the `Inspector` row in a single SQL statement.
4. **A one-off backfill** that geocodes the addresses already stored on existing inspectors, idempotently and throttled, in permanent mode, with a cost/account-proof guard.

The slice also reserves the push-control slot in the inspector profile (the control itself is F02) and emits an `inspector.base_changed` domain event (no subscriber yet; F04 decides what to do with published day plans).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Every inspector has a geocoded base address (Priority: P1)

An operator (AM or OP) cannot create an inspector without a base address. On save the system geocodes the address in permanent mode and stores the coordinates; if geocoding fails (no result, error, timeout, or an account without permanent mode), the inspector is still created but without coordinates and the response says so. An operator can change an inspector's base address but cannot clear it. The inspector can change its own base address from its profile. Whenever the base is stored or changed, old coordinates are replaced by the new ones, or cleared together with the geocode timestamp if the new geocoding failed — a stale coordinate for a previous address is never kept.

**Why this priority**: The base address is the single block F04 (day plan / routing) and F06 (tenant time estimates) consume. Nothing downstream can be built without it, and making it mandatory and permanently geocoded is the whole point of the slice (criterion 00.A5, partial here).

**Independent Test**: `POST /v1/inspectors` without `address` → 400; with a valid address and a fake geocoder → 201 with numeric `baseLat`/`baseLng` and `baseGeocodeFailed: false`; `PATCH /v1/inspectors/:id {address:null}` → 400; a new address → 200 with new coordinates. All verifiable end-to-end through the inspector endpoints.

**Acceptance Scenarios**:

1. **Given** a `POST /v1/inspectors` body with no `address`, **When** it is validated, **Then** it is rejected with 400 `VALIDATION_ERROR` and a `details` issue at path `address`, and nothing is written.
2. **Given** a valid AU `address` and a geocoder that returns `{lat, lng}`, **When** an OP creates the inspector, **Then** it is created 201 with `baseLat`/`baseLng` numeric, `baseGeocodedAt` set, `baseGeocodeFailed: false`, and the `inspector.created` audit carries `address`, `baseLocated: true` and `baseGeocodedAt` but **no** `baseLat`/`baseLng`.
3. **Given** a valid `address` but a geocoder that returns `null`, throws, times out at 4000 ms, or is the stub (no Mapbox config), **When** the inspector is created, **Then** it is still created 201 with the `address` stored, coordinates null, `baseGeocodedAt` null and `baseGeocodeFailed: true`.
4. **Given** an existing inspector, **When** an OP sends `PATCH /v1/inspectors/:id {address:null}`, **Then** it is rejected with 400 (the base can never be removed); **When** the OP omits `address`, **Then** the address and coordinates are preserved, even if the stored address is a legacy incompatible shape.
5. **Given** an existing inspector with coordinates, **When** its base address is changed and the new geocoding fails, **Then** `baseLat`, `baseLng` and `baseGeocodedAt` are all cleared in the same write (no stale coordinate survives).
6. **Given** the same address resent (differing only by trim/case, e.g. `state:'nsw '` vs stored `'NSW'`, or `street:'1 GEORGE ST'` vs stored `'1 George St'`) while coordinates already exist, **When** the update is processed, **Then** the geocoder is **not** called and no `inspector.base_changed` event is emitted.
7. **Given** an inspector whose stored `address` is a legacy shape that does not parse, **When** any new valid address is saved, **Then** the geocoder **is** called (legacy is never treated as "same address").
8. **Given** a create or update body carrying `address.latitude`/`address.longitude`, **When** it is validated, **Then** those keys are silently stripped (no 400) and the stored coordinates come only from the geocoder.

### User Story 2 - The app reports its state via a heartbeat (Priority: P2)

When the inspector's app starts it reports its display mode (standalone vs browser), its browser push-permission state and its build version. The server stamps the last-seen time and app version on every heartbeat, records first-install the first time any device reports `standalone` (never overwritten afterwards), and derives the push flag from the permission. Across several devices, the last heartbeat wins for last-seen, version and push; the install timestamp is the first standalone from any device. The heartbeat is telemetry: no audit, idempotent, and rate-limited per user.

**Why this priority**: 00.10 — this is how the operation sees app adoption (the web adds the App/Push/Last-seen columns in TASK-F01-2). It depends on the inspector record but is independent of the base-address behavior.

**Independent Test**: `POST /v1/inspectors/me/app-state` as the inspector → 204; an OP reading the inspector then sees `appLastSeenAt`, `appVersion` and `pushEnabled`. Role, soft-delete and rate-limit cases are all verifiable through the endpoint.

**Acceptance Scenarios**:

1. **Given** an inspector whose `app_installed_at` is null, **When** it posts `{displayMode:'standalone', pushPermission:'granted', appVersion:'0.1.0'}`, **Then** the response is 204 and the row has `app_installed_at = now`, `app_last_seen_at = now`, `push_enabled = true`, `app_version = '0.1.0'`.
2. **Given** an inspector whose `app_installed_at` is already set, **When** it posts another `standalone` heartbeat, **Then** `app_installed_at` is unchanged while last-seen, push and version update.
3. **Given** a `browser` heartbeat (any permission other than `granted`), **When** processed, **Then** `app_installed_at` is untouched and `push_enabled = false`.
4. **Given** a device that reported `standalone` then a second device reporting `browser`/`default`, **When** both heartbeats are processed, **Then** `app_installed_at` is kept (last-write-wins for the rest, `push_enabled` reflects the latest).
5. **Given** an OP actor, **When** it calls `POST /v1/inspectors/me/app-state`, **Then** it is rejected with 403 `INSP_ONLY`.
6. **Given** a soft-deleted inspector, **When** a heartbeat is processed, **Then** it is rejected with 404 `INSPECTOR_NOT_FOUND` (the single UPDATE affected 0 rows).
7. **Given** the same user, **When** it sends 11 heartbeats within one minute, **Then** the 11th is rejected with 429; **Given** two different inspectors behind the same IP sending 10 each, **Then** none is rejected (the rate-limit key is the user, not the IP).

### User Story 3 - Inspector base address and location stay private from agencies (Priority: P2)

Agency users (`CL_ADMIN`, `CL_USER`) can list and read the inspectors eligible to them, but they never see an inspector's base `address`, its coordinates, or any app-adoption field — not in the list, the detail, or write responses. AM/OP and the inspector itself keep full visibility. This changes today's behavior: agency roles currently receive `address`.

**Why this priority**: This is a privacy change that alters an existing response and must ship with the base address. It is cross-cutting but layers on top of US1.

**Independent Test**: Read `GET /v1/inspectors` and `GET /v1/inspectors/:id` as a CL_ADMIN and confirm no `address`, coordinate or adoption key appears; read the same as OP and confirm they do. A regression test fails if a `CL_*` response carries `address`.

**Acceptance Scenarios**:

1. **Given** a CL_ADMIN or CL_USER, **When** it reads `GET /v1/inspectors` or `GET /v1/inspectors/:id`, **Then** the items carry no `address`, `baseLat`, `baseLng`, `baseGeocodedAt`, `appInstalledAt`, `appLastSeenAt`, `pushEnabled` or `appVersion`.
2. **Given** a CL_* actor, **When** it passes `?missingBaseAddress=true` on the list, **Then** the filter is ignored (it cannot see base state).
3. **Given** an AM or OP, **When** it reads the list or a detail, **Then** every item carries `address` (object or null) and, in the detail and list, the coordinates and adoption fields.
4. **Given** an INSP, **When** it reads its own record, **Then** it sees `address` and coordinates but not the adoption fields.

### User Story 4 - A one-off backfill recovers coordinates for existing addresses (Priority: P3)

An operator runs a script to geocode the addresses already stored on inspectors that have no coordinates yet. A dry run never calls Mapbox and never needs Mapbox configured — it reports what would be geocoded and lists every legacy address that does not parse. An apply run geocodes in permanent mode with a throttle, writes coordinates only where none exist yet (so a concurrent inspector/OP save is never overwritten), audits each geocoded row without coordinates, and refuses to run if the account lacks permanent mode. The report always estimates the request count and cost.

**Why this priority**: It closes the gap for inspectors created before this feature. It is operational and independent of the live request path.

**Independent Test**: Run the script against a fake Prisma + geocoder; dry run reports `{dryRun:true, scanned, compatible, incompatible, toGeocode, estimatedRequests}` with no geocoder calls; apply reports geocoded/notFound/failed/skippedConcurrent and writes via a compare-and-set.

**Acceptance Scenarios**:

1. **Given** rows with a stored address and null `base_lat`, **When** the dry run executes, **Then** it calls the geocoder 0 times and reports `toGeocode` and `estimatedRequests` equal to the number of compatible rows, with no `geocoded/notFound/failed`.
2. **Given** a legacy row whose address does not parse (e.g. `state:'New South Wales'`, postcode not 4 digits, or `country ≠ AU`), **When** the backfill runs, **Then** the row is listed as `incompatible` with its Zod `issues[].path`, is never normalized or rewritten, and is not geocoded.
3. **Given** `--apply` and an account with permanent mode, **When** a row is geocoded, **Then** coordinates are written via `updateMany({where:{id, base_lat:null}})` (never overwriting a concurrent save → `skippedConcurrent`), an `inspector.base_geocoded` audit is written (`actorType SYSTEM`, `after: {baseLocated:true, baseGeocodedAt}`, no lat/lng, `metadata.source:'backfill'`), and an `inspector.base_changed` event is emitted.
4. **Given** `--apply` with no Mapbox config (stub), **When** the script starts, **Then** it aborts before reading rows ("Mapbox integration not configured: refusing to run"); **Given** a dry run with no config, **Then** it runs and produces the report.
5. **Given** a `MapboxPermanentGeocodingUnavailableError` during apply, **When** it is raised, **Then** the whole run aborts with a non-zero exit; a generic error or timeout on one row counts as `failed` and the run continues.
6. **Given** the script is run twice, **When** the second run executes, **Then** rows already geocoded are not re-processed (selection excludes `base_lat` not null, `JsonNull` and `DbNull` addresses).

### Edge Cases

- **Empty-ish address** `{street:' ', suburb:' ', state:'X', postcode:'0', country:'AU'}` → 400 (trim + `min(1)` + AU state/postcode); the base is never stored "present but blank".
- **State casing/whitespace** `' nsw '` → stored `'NSW'`; resending `'NSW '` with existing coordinates → "same address", no geocode.
- **Full state name / non-AU country** in the API (`'New South Wales'`, `'NZ'`) → 400; the same value already stored (legacy) → `incompatible` in the backfill and banner variant 2 downstream, and any new save geocodes.
- **INSP with legacy incompatible address** edits only its phone → 200, `address` untouched, geocoder not called.
- **Unexpected geocoder exception on create** (a bug) → nothing is written, because geocoding runs before `userRepo.save` (no orphan `User` without `Inspector`).
- **JSON `null` address** (`JsonNull`) and SQL `NULL` address → both excluded from the backfill `scanned` set.
- **Two concurrent `standalone` heartbeats** → `app_installed_at` is written exactly once, by whichever single UPDATE commits first, and never overwritten; a later `browser` keeps it.
- **Static route precedence**: `POST /v1/inspectors/me/app-state` must resolve to its own handler, not to `/:inspectorId/...`.

## Requirements *(mandatory)*

### Functional Requirements

**Base address & geocoding**

- **FR-001**: The shared package MUST expose `inspectorBaseAddressSchema` (type `InspectorBaseAddress`), **derived** from `branchAddressSchema` with trimmed text fields, `state` restricted to `AU_STATES` (`NSW|VIC|QLD|WA|SA|TAS|ACT|NT`, trimmed + upper-cased), `postcode` a 4-digit string, and `country` the literal `'AU'` (default `'AU'`). Unknown keys — including client `latitude`/`longitude` — MUST be stripped (Zod strip mode), never a 400. `AU_STATES` MUST be exported for the web/PWA selects. Validation messages: invalid state → "Select a state", postcode → "Postcode must be 4 digits", country → "Only Australian addresses are supported".
- **FR-002**: `createInspectorSchema.address` MUST be the required `inspectorBaseAddressSchema`; `updateInspectorSchema.address` and `inspectorSelfUpdateSchema.address` MUST be `inspectorBaseAddressSchema.optional()` with **no** `.nullable()`, so `address:null` is a 400 (the base is non-removable).
- **FR-003**: On create and on any address change, the base MUST be geocoded synchronously in permanent mode using the X02 contract — the query from `formatGeocodingQuery`, the call through `geocodeWithTimeout(..., {mode:'permanent', timeoutMs: GEOCODE_SYNC_TIMEOUT_MS})`. A new service `geocodeInspectorBase` MUST return `{lat, lng, geocodedAt}` on success or `{failed: 'no_results'|'error'|'timeout'|'permanent_unavailable'}` otherwise, and MUST NEVER throw: errors/timeouts become `failed` + a log (`warn`, except `permanent_unavailable` which logs `error`). There MUST be no second query formatter and no own `Promise.race`.
- **FR-004**: Geocoding failure MUST NOT fail the request. Create/update respond success with the address stored, coordinates null, `baseGeocodedAt` null and `baseGeocodeFailed: true`.
- **FR-005**: The coordinate pair MUST be written atomically with the address in a single write that sets both coordinates or clears both (together with `base_geocoded_at`). A stale coordinate for a previous address MUST never remain.
- **FR-006**: On update the use cases MUST parse the **current** stored `address` with `inspectorBaseAddressSchema`; if it parses and `isSameGeocodingAddress(current, next)` (the X02 helper, D18) is true and coordinates already exist, they MUST NOT call the geocoder and MUST NOT emit `base_changed`. If the current address does not parse (legacy), they MUST always geocode.
- **FR-007**: The create order MUST be: validate → email-conflict check → `geocodeInspectorBase` (no write yet) → `userRepo.save` → `inspectorRepo.save` with coordinates (one write) → single `inspector.created` audit → `base_changed` event. Updates MUST geocode **before** the `update`, writing address + coordinates in one write. An email conflict MUST NOT call the geocoder.

**Heartbeat**

- **FR-008**: `POST /v1/inspectors/me/app-state` MUST accept `inspectorAppStateSchema` = `{displayMode: 'standalone'|'browser', pushPermission: 'granted'|'denied'|'default'|'unsupported', appVersion: string trimmed 1–40}` (strip mode) and respond 204 with no body. It is INSP-only (403 `INSP_ONLY` otherwise) and 404 `INSPECTOR_NOT_FOUND` for a soft-deleted inspector.
- **FR-009**: The heartbeat MUST set `app_last_seen_at = now` and `app_version` on every call, derive `push_enabled = (pushPermission === 'granted')`, and set `app_installed_at = COALESCE(app_installed_at, now)` only when `displayMode === 'standalone'` (never overwritten; `browser` never clears it). Across devices the last heartbeat wins for last-seen/version/push; install is the first standalone from any device. There is no per-device table.
- **FR-010**: The repository MUST perform the heartbeat in **one** SQL statement (`$executeRaw`, CASE + COALESCE, explicit casts) — never read-then-write and never two writes. `affected === 0` MUST raise `InspectorNotFoundError`. The heartbeat MUST NOT write an audit (telemetry only; a `debug` log with `request_id` is allowed).
- **FR-011**: Both `POST /v1/inspectors/me/app-state` **and** `PATCH /v1/inspectors/me` MUST be rate-limited at 10/min keyed by `authContext.userId` (IP fallback), with the limit running after `authenticate` so the key sees the auth context.

**Privacy & reads**

- **FR-012**: A field-visibility helper MUST be applied to get, list and write responses so that `CL_ADMIN`/`CL_USER` receive neither `address` nor `baseLat/baseLng/baseGeocodedAt` nor any adoption field; AM/OP receive all; INSP (own) receives `address` + coordinates but not the adoption fields. This removes the current leak of `address` to agency roles.
- **FR-013**: `GET /v1/inspectors` MUST accept `missingBaseAddress` (boolean query, coerced from `'true'|'false'`) and, for AM/OP, filter to inspectors with a null `base_lat` and include `address` on every item (list included). For CL_* the filter MUST be ignored. For INSP the list returns only the own record with `address`/coordinates and no adoption fields.
- **FR-014**: Response schemas MUST gain `baseLat`, `baseLng` (nullable numbers), `baseGeocodedAt`, `appInstalledAt`, `appLastSeenAt` (nullable instants), `pushEnabled` (nullable boolean), `appVersion` (nullable string), and `baseGeocodeFailed` (boolean, write responses only) — all `.optional()`. `address` stays `z.unknown().optional()` because legacy rows may hold another shape, and now appears in AM/OP list items. `GET /v1/me` MUST NOT change.

**Event, backfill, contract**

- **FR-015**: `INSPECTOR_EVENTS.BASE_CHANGED = 'inspector.base_changed'` MUST be emitted by create, OP update, self-update and the backfill, after the write, only when the address was stored/changed (not on "same address"), with payload `{inspectorId, hadCoordinates, hasCoordinates}`. It uses the existing domain event bus as an **optional** last constructor argument; a throwing subscriber MUST NOT fail the response. There is no subscriber in this feature; changing the base MUST NOT alter any `DayPlan`.
- **FR-016**: A one-off script `backfill-inspector-base-coords.ts` MUST select `deleted_at IS NULL AND base_lat IS NULL AND address ∉ {DbNull, JsonNull}`, parse each with `inspectorBaseAddressSchema` (incompatible rows listed with Zod issues, never rewritten), and in **dry run** call Mapbox 0 times and require no config. In `--apply` it MUST geocode through `geocodeInspectorBase` with a `--delay-ms` throttle (default 250 ms), write via `updateMany({where:{id, base_lat:null}})` (CAS → `skippedConcurrent`), write an `inspector.base_geocoded` audit per row (SYSTEM, no lat/lng, `metadata.source:'backfill'`), emit `base_changed`, abort before reading rows if Mapbox is unconfigured, abort the whole run on `MapboxPermanentGeocodingUnavailableError` (non-zero exit), and count generic errors/timeouts as `failed` and continue. The report MUST always include `estimatedRequests` (= rows to geocode); a cost estimate (`estimatedRequests × US$0.005`) above US$200 requires dev sign-off before apply in prod.
- **FR-017**: The migration MUST be expand-only: add seven nullable columns (`base_lat`, `base_lng` `Decimal(10,7)`; `base_geocoded_at`, `app_installed_at`, `app_last_seen_at` `timestamp(3)`; `push_enabled` boolean; `app_version` varchar(40)) with no default, no backfill in SQL, no dropped `Unsupported()` index. The repository MUST map `Prisma.Decimal` ↔ `number` and MUST write `Prisma.DbNull` instead of a raw `null` into the `Json?` address column.
- **FR-018**: `openapi.json` and `api-types.ts` MUST be regenerated (`generate:openapi` → `generate:types` → shared build) and committed; the diff MUST stay within the 150-file PR limit.

### Key Entities *(include if feature involves data)*

- **Inspector (extended)**: gains `base_lat`, `base_lng` (`Decimal(10,7)`, nullable), `base_geocoded_at`, `app_installed_at`, `app_last_seen_at` (nullable timestamps), `push_enabled` (nullable boolean), `app_version` (nullable varchar(40)). The existing `address` (`Json?`) becomes the validated base address for new writes; legacy rows keep whatever shape they have. **Platform-scoped: `Inspector` has NO `tenant_id`** (pre-existing; see Assumptions) and the new columns add none. Invariant: coordinates are written and cleared together with `base_geocoded_at`, always in one write.
- **InspectorBaseAddress** (shared value): the validated AU address shape used on the wire and for the geocoding query; structurally compatible with the X02 `GeocodableAddress`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (00.4)**: An inspector cannot be created without a base address; a valid address is geocoded in permanent mode and its coordinates are stored; the base can be changed but never removed (`address:null` → 400); on the OP update and the inspector self-update the two paths are audited.
- **SC-002 (00.A5, partial)**: A successfully saved base address has `base_lat`/`base_lng` populated (`baseGeocodedAt` set); a geocoding failure yields a saved address with null coordinates and `baseGeocodeFailed: true`, not an error. (Full 00.A5 — the base consumed by delivery 01 — is proven in F04.)
- **SC-003 (00.3, backend footprint)**: The backend exposes the base-address data the profile section will render and adds **no** preferences column and **no** SMS preference (D8); provable here by the absence of any preferences field in the schema/migration and the presence of the base-address fields in the inspector responses. The push-control slot itself is reserved in the profile UI by the PWA (TASK-F01-3) and its logic by F02 — out of scope for this backend task.
- **SC-004 (00.10)**: `POST /v1/inspectors/me/app-state` records first-install (first standalone, never overwritten), last-seen, browser-push permission and app version on the `Inspector` row in a single statement; AM/OP can then read `appInstalledAt`/`appLastSeenAt`/`pushEnabled`/`appVersion`.
- **SC-005 (privacy, D7)**: A `CL_ADMIN`/`CL_USER` response — list, detail or write — contains no `address`, coordinate or adoption key; a regression test fails if one appears. AM/OP and INSP keep their visibility.
- **SC-006**: The same address resent (differing only by trim/case) does not call the paid permanent geocoder and emits no `base_changed`; a legacy unparsable stored address always geocodes on the next save.
- **SC-007**: The heartbeat and `PATCH /me` are rate-limited per user (10/min): two inspectors behind one IP are independent; an 11th call from one user is 429.
- **SC-008**: The backfill is idempotent and safe: a dry run makes no Mapbox call and needs no config; an apply run never overwrites a concurrent save (CAS), audits without coordinates, aborts cleanly on an unconfigured or permission-less account, and reports `estimatedRequests`.
- **SC-009**: The shared contract (`openapi.json`, `api-types.ts`) is regenerated and committed; the diff stays within the 150-file PR limit.

## Assumptions

- **Platform-scoped entity exception (premise, root CLAUDE.md §7 rule 1)**: `Inspector` has **no `tenant_id`** because an inspector is cross-tenant (same precedent as `ServiceRegion` global and `IntegrationSetting`), and the seven new columns add none. Scope is guaranteed by RBAC — only AM/OP read/write any inspector, INSP is filtered to its own `inspectorId`, and CL_* reach only the eligible inspectors of their own tenant through the existing projection (and now without `address`/coordinates). A scoping integration test MUST prove a CL_*/INSP actor cannot read another inspector's base `address`, coordinates or adoption fields.
- **Geocoding port stays in `property/domain` (D4)**: `IGeocodingService` is imported across modules; it is **not** moved to `shared/domain` in this task (the F01 feature note floated moving it, but TASK-F01-1 decides to keep it in place to minimize the diff).
- **Permanent mode and cost (D4, D19)**: the X02 port's default `mode` is `permanent`; the sync timeout is `GEOCODE_SYNC_TIMEOUT_MS = 4000` with no own timeout in the Mapbox adapter. The backfill cost is `estimatedRequests × US$0.005` (Permanent Geocoding, no free tier — reconfirm the live price); a prod apply above US$200 needs dev sign-off and runs only in an environment whose positive proof of permanent mode X02 already recorded in `docs/ops/pre-deploy-smoke-checklist.md`.
- **Legacy addresses are never normalized (D5, D15)**: a stored address that does not parse under `inspectorBaseAddressSchema` stays as-is, shows banner variant 2 downstream, and always geocodes on the next save. "Same address" is `isSameGeocodingAddress` over **both** sides parsed by the schema (D18); an unparsable current side always geocodes.
- **Push flag before F02 (D9)**: `push_enabled` reflects only the browser permission (`Notification.permission === 'granted'`), not a real push subscription; F02 redefines it. F01 only reserves the profile slot (D8); there is no SMS preference.
- **Base change does not touch day plans (D17)**: `inspector.base_changed` has no subscriber in F01; F04 decides what a published `DayPlan` does with a base change.
- **No UI in this task (D10, D11)**: web (TASK-F01-2) adds the drawer address field and the App/Push/Last-seen columns + adoption section; the PWA (TASK-F01-3) adds the structured base-address form, the missing-base banner and the heartbeat caller. The install tour and the "More" tab are F04. TASK-F01-1 and TASK-F01-2 are promoted to staging and prod **together** (D14).
- **CLAUDE.md updates**: this PR updates `apps/backend/CLAUDE.md` and `packages/shared/CLAUDE.md` for the new inspector routes, columns, the `inspector.base_changed` event, the per-user rate-limit pattern and the privacy rule, as a step of the PR (root CLAUDE.md §13.11).
- **Downstream coordination (X03)**: F01-1 defines the inspector app-state; when a PWA E2E task (TASK-F01-3 or later) touches the stubbed endpoints, the X03 `BASELINE_STUBS` must gain an app-state stub (today only `/v1/me`). Recorded here for the coordinator; not implemented in this backend task.
