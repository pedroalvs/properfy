# Feature Specification: Platform settings registry, GPS precision and configurable geofence for field execution

**Feature Branch**: `038-f03-1-platform-settings-geofence`
**Created**: 2026-10-29
**Status**: Draft
**Input**: TASK-F03-1 of `fase2-etapa1/tarefas/F03-tarefas.md` — backend + shared base of F03 "Field events". Contract 00.7/00.8/03.1/03.2/03.3/03.16; criteria **00.A3** (partial) and **03.A2**.

## Overview

This is the foundational slice of F03 (Field events). It delivers three capabilities that the rest of F03, and F04/F05/F07/F08/F09/F10, build on:

1. A **platform settings** facility — a typed registry of platform-wide configuration keys, a short-lived read cache, and audited AM/OP-only read/write endpoints. F03 seeds the first key, `fieldEvents`. Other features extend it only by **appending a new key**.
2. A **configurable geofence** at inspector check-in, replacing today's hard-coded 200 m (PWA) × 500 m (backend) mismatch with the agency-tunable radius and mode (`FLAG` or `BLOCK`).
3. **Richer field-execution capture** — GPS accuracy, device time and distance recorded on both check-in and check-out, a check-in-window flag, and the removal of a pre-existing inspector-coordinate leak in the audit log for agency (`CL_*`) roles.

No UI ships in this task (PWA and web consume these contracts in TASK-F03-3 and TASK-F03-4).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operators configure platform-wide field settings (Priority: P1)

An operator (AM or OP) opens platform settings and adjusts the field-event configuration — the geofence radius and mode, the check-in-window tolerance, and completion-reminder timing — once, for the whole platform. The change takes effect across all agencies within a minute, and every change is recorded in the audit trail with who made it and the before/after values. Other operators and agency users cannot change or see these settings.

**Why this priority**: This is the foundation the whole of F03 (and F04/F05/F07/F08/F09/F10) stands on — the geofence and capture behavior read their thresholds from here, and later features add their own keys to the same registry. Nothing else in F03 can be built or tuned without it.

**Independent Test**: Call `GET /v1/platform-settings` and `PUT /v1/platform-settings/fieldEvents` as an operator; confirm the value round-trips, an audit entry is written with `tenant_id = NULL`, non-operator roles are rejected, and the registry is the single source of defaults when no row exists.

**Acceptance Scenarios**:

1. **Given** no stored row for `fieldEvents`, **When** an AM reads `GET /v1/platform-settings`, **Then** the `fieldEvents` section returns the registry defaults (radius 300 m, mode `FLAG`, window tolerance 15 min, completion reminder enabled, 30 min after window end) with `isDefault: true`, `updatedAt: null`, `updatedBy: null`.
2. **Given** a valid `fieldEvents` value, **When** an OP sends `PUT /v1/platform-settings/fieldEvents`, **Then** the value is stored, an audit entry `platform_setting.updated` is written (`tenant_id = NULL`, actor recorded, before = previous effective value, after = new value), and a subsequent read returns the new value with `isDefault: false` and `updatedBy`.
3. **Given** any role that is not AM or OP (CL_ADMIN, CL_USER, INSP, TNT), **When** it calls `PUT /v1/platform-settings/:key`, **Then** the request is rejected with 403 and nothing is written.
4. **Given** a `PUT` with an out-of-range value (e.g. radius 10), **When** it is validated per the key's schema, **Then** the request is rejected with 400 `VALIDATION_ERROR` carrying the validation issues, and nothing is written.
5. **Given** a `PUT` targeting a key not in the registry, **When** it is handled, **Then** the request is rejected with 404 `PLATFORM_SETTING_UNKNOWN_KEY`.
6. **Given** a successful `PUT`, **When** the write commits, **Then** a `platform_setting.updated.v1` domain event is emitted once with `{ key, before, after, actorId, occurredAt }`; a subscriber that throws does not fail the `PUT` (the response is still 200) and the failure is logged.

### User Story 2 - The geofence protects check-in with agency-tuned rules (Priority: P2)

When an inspector checks in, the system measures the distance to the property and compares it against the configured radius. In the default `FLAG` mode it records any breach for the operation to review without stopping the inspector. In `BLOCK` mode it refuses a check-in that is clearly at the wrong place, with a message that tells the inspector what to do. When it cannot measure reliably — no property coordinates, no GPS accuracy, or accuracy coarser than the radius — it automatically falls back to `FLAG` so a legitimate inspector is never stranded.

**Why this priority**: This is the headline field-safety behavior of F03 and the subject of criterion 03.A2. It ends the 200 m/500 m inconsistency and gives the operation a real, tunable control.

**Independent Test**: With `FLAG`, a far check-in is accepted and flagged; with `BLOCK`, a far check-in with good accuracy is rejected (422) while the automatic-fallback cases are accepted. Verifiable end-to-end via the start endpoint and the recorded flags/audit.

**Acceptance Scenarios**:

1. **Given** mode `FLAG` and a check-in 640 m from the property (radius 300), **When** the inspector checks in, **Then** the execution is created, `out_of_radius = true` is recorded, and an `inspection.geolocation_mismatch` audit is written with `phase = 'START'` and `thresholdMeters = 300`.
2. **Given** mode `FLAG` and a check-in 120 m away, **When** the inspector checks in, **Then** `out_of_radius = false` and no mismatch audit is written.
3. **Given** mode `BLOCK` and a check-in 640 m away with GPS accuracy 12 m, **When** the inspector checks in, **Then** the request is rejected with 422 `GEOFENCE_OUT_OF_RADIUS`, the message ends with "If you are at the right address, contact operations.", no execution is saved and no idempotency result is cached, and an `inspection.check_in_blocked` audit is written carrying `distanceMeters`, `radiusMeters`, `accuracyMeters` and **no** coordinate keys.
4. **Given** mode `BLOCK` but the property has no coordinates, or the device sent no accuracy, or accuracy is coarser than the radius, **When** the inspector checks in, **Then** the check-in is **accepted** (effective mode falls back to `FLAG`) with the corresponding fallback reason (`NO_PROPERTY_COORDINATES` / `NO_ACCURACY` / `POOR_ACCURACY`).
5. **Given** a check-in with the same `Idempotency-Key` retried after moving closer, **When** the first attempt was a `BLOCK` 422, **Then** the retry succeeds (the error was not cached).
6. **Given** any check-in after F03, **When** the execution is created, **Then** the applied radius is snapshotted on the execution (`geofence_radius_m`), including when there are no property coordinates and when the mode fell back.

### User Story 3 - Field execution captures precision, time and distance; inspector location stays private (Priority: P3)

Check-in and check-out record the device's GPS accuracy, the device's own timestamp, and the distance to the property (on check-out too, which previously recorded none). The check-in window is evaluated against the inspector's device time when that time is plausible, so an inspector who was genuinely on time but synced late is not penalized. Agency users never see the inspector's raw coordinates in the audit log — only distance, accuracy and flags.

**Why this priority**: This completes the data side of criterion 00.A3 and closes a real privacy leak (criterion D10), but it layers on top of the settings and geofence rather than standing alone.

**Independent Test**: Start/finish with and without the new optional fields; confirm the stored accuracy, device time, distances and window flag; confirm a CL_ADMIN reading `/v1/audit-logs` sees `[MASKED]` coordinates while AM/OP see them.

**Acceptance Scenarios**:

1. **Given** a check-in body without the new fields (an item queued offline before F03), **When** it is processed, **Then** it still succeeds, accuracy and device time are stored as null, and behavior is otherwise unchanged.
2. **Given** a check-in/check-out with `accuracy` and `clientOccurredAt`, **When** processed, **Then** accuracy and device time are stored, and on check-out the distance to the property and a `finish_out_of_radius` flag are recorded.
3. **Given** a check-in at 08:30 for a 09:00–11:00 slot (tolerance 15 min), **When** processed, **Then** `out_of_window = true` and no tenant notification is enqueued.
4. **Given** a punctual check-in whose device time is within −7 days / +5 min of the server time, **When** processed, **Then** the window is evaluated against the device time; when the device time is implausible (older than 7 days or more than 5 min in the future), `out_of_window = false` and the audit records `windowSkipped = 'IMPLAUSIBLE_CLIENT_TIME'` (never penalize without evidence).
5. **Given** a stored `inspection.started`/`geolocation_mismatch` audit that contains inspector coordinates, **When** a CL_ADMIN reads `/v1/audit-logs`, **Then** every coordinate key is returned as `'[MASKED]'` while non-coordinate values (e.g. `distanceMeters`) are intact; **When** an AM or OP reads the same entry, **Then** coordinates are intact.
6. **Given** a check-out, **When** the distance, flags, accuracy and device time are written, **Then** they persist in the **same transaction** as the finish/`DONE` transition (a transition failure persists nothing).

### Edge Cases

- **Old offline item** (`{latitude, longitude}` only): accepted; accuracy/time null; `BLOCK` falls back to `FLAG` (`NO_ACCURACY`); window uses server time.
- **Late sync (hours/days):** plausible `clientOccurredAt` (within −7 days / +5 min) sets the window; outside that it is implausible → `out_of_window = false` + `windowSkipped`. `started_at` is always the server time.
- **Device clock > 5 min fast:** implausible → `out_of_window = false` + `windowSkipped`.
- **Double-tap / same `Idempotency-Key`:** second call returns the cache; a geofence 422 is never cached, so a nearer retry with the same key can succeed.
- **Retry with a new key while an execution is in progress:** the existing execution is returned without re-evaluating the geofence.
- **Property mis-geocoded with BLOCK on:** inspector gets the 422 with the "contact operations" line; the operator inspects the `inspection.check_in_blocked` audit and `warn` log, fixes the property coordinates, and the inspector retries with the same key. No per-appointment override in this phase.
- **Absurd accuracy (> 99,999,999.99 m):** clamped to fit the column; never a 400 (a 400 would poison a queued item forever).
- **Invalid stored setting value:** the reader returns the registry defaults and logs an error once per reload; check-in never breaks on config.
- **Check-in on a day later than scheduled** (allowed by the day gate): `out_of_window = true`.
- **Radius changed between check-in and check-out:** check-out uses the current radius; the check-in snapshot explains the start flag.
- **Save hook registered for a key:** the hook's returned value is what gets stored, audited and emitted; an invalid value never reaches the hook; a throwing hook writes nothing.

## Requirements *(mandatory)*

### Functional Requirements

**Platform settings**

- **FR-001**: The system MUST expose a typed registry of platform settings keys in the shared package, where each key carries a validation schema, complete defaults, and a display `section` label. Adding configuration means **appending a new key**; keys are never repurposed across features.
- **FR-002**: The system MUST provide `GET /v1/platform-settings` (all keys, one entry each, ordered by `section`), `GET /v1/platform-settings/:key`, and `PUT /v1/platform-settings/:key`, restricted to AM and OP. All other roles MUST receive 403.
- **FR-003**: When no row is stored for a key, reads MUST return the registry defaults with `isDefault: true`; a stored value MUST be merged over the defaults and validated, and an invalid stored value MUST resolve to the defaults (not an error).
- **FR-004**: A successful `PUT` MUST upsert the value with the acting user, write a `platform_setting.updated` audit entry with `tenant_id = NULL` and before/after values, and store/audit/emit the value returned by a registered save hook for that key (if any), applied after validation and before the write. Saving the same value MUST still write and audit (no diff-skip). An unknown key MUST return 404 `PLATFORM_SETTING_UNKNOWN_KEY`; an invalid value MUST return 400 `VALIDATION_ERROR` with the validation issues and write nothing.
- **FR-005**: A successful `PUT` MUST emit a `platform_setting.updated.v1` domain event exactly once after the write, with `{ key, before, after, actorId, occurredAt }`; a failing subscriber MUST NOT fail the request. A failed write MUST emit no event.
- **FR-006**: Internal backend reads MUST go through a shared reader port (`IPlatformSettingsReader.get(key)`) with a short per-instance cache (30 s TTL, invalidated locally on write); other instances converge within the TTL.
- **FR-007**: The system MUST register the `fieldEvents` key with fields `geofenceRadiusMeters` (int 50–5000, default 300), `geofenceMode` (`FLAG`|`BLOCK`, default `FLAG`), `checkInWindowToleranceMinutes` (int 0–240, default 15), `completionReminderEnabled` (bool, default true), `completionReminderMinutesAfterWindowEnd` (int 0–720, default 30).

**Geofence & capture**

- **FR-008**: Check-in MUST evaluate the geofence using the configured radius and mode. In `FLAG` it MUST record `out_of_radius` and write `inspection.geolocation_mismatch` (`phase 'START'`, `thresholdMeters` = radius) when the distance exceeds the radius, without blocking. In `BLOCK` it MUST reject a confirmed breach with 422 `GEOFENCE_OUT_OF_RADIUS` and the message `You are {distance} m from the property. Check-in is only allowed within {radius} m. If you are at the right address, contact operations.`, writing an `inspection.check_in_blocked` audit (with `distanceMeters`, `radiusMeters`, `accuracyMeters`, **no coordinates**), persisting no execution and caching no idempotency result.
- **FR-009**: `BLOCK` MUST automatically fall back to `FLAG` when there are no property coordinates (`NO_PROPERTY_COORDINATES`), no accuracy (`NO_ACCURACY`), or accuracy greater than the radius (`POOR_ACCURACY`). The out-of-radius comparison MUST be strictly greater-than (distance == radius is inside).
- **FR-010**: The geofence MUST run **after** the existing-execution check, so retrying an in-progress execution returns it without re-evaluation; blocking must never override the day gate, T-1, confirmation or assignment checks that precede it.
- **FR-011**: Every check-in after F03 MUST snapshot the applied radius on the execution (`geofence_radius_m`), including the no-coordinates and fallback cases; a null snapshot means exclusively "execution created before F03".
- **FR-012**: Check-in and check-out MUST accept optional `accuracy` (non-negative, finite) and `clientOccurredAt` (ISO-8601 with offset) and store accuracy and device time. Check-out MUST compute and store the distance to the property and a `finish_out_of_radius` flag, and MUST write these in the same transaction as the finish/`DONE` transition. Check-out MUST never block.
- **FR-013**: The check-in window MUST be evaluated in the agency timezone against the effective event time, with the configured tolerance. The effective time is the device time when plausible (within −7 days / +5 min of the server), otherwise the server time; an implausible device time MUST yield `out_of_window = false` and `windowSkipped = 'IMPLAUSIBLE_CLIENT_TIME'` in the audit. An out-of-window check-in MUST NOT enqueue any tenant notification. `started_at` is always the server time.
- **FR-014**: Absurd accuracy values MUST be clamped to fit storage rather than rejected (never a 400 that would poison a queued offline item).
- **FR-015**: The start/finish responses and the inspector appointment-detail response MUST carry the new fields as **optional**, so responses cached under idempotency before the deploy stay valid. The detail response MUST expose `geofence { radiusMeters, mode }` read from the settings.

**Privacy**

- **FR-016**: New audits created by this feature MUST NOT store the inspector's raw latitude/longitude (distance, accuracy and flags only). The `check_in_blocked` and FINISH `geolocation_mismatch` audits MUST carry no coordinate keys.
- **FR-017**: Reads of `/v1/audit-logs` by a CL_ADMIN MUST mask every coordinate key (`latitude`, `longitude`, `inspectorLatitude`, `inspectorLongitude`, `startLatitude`, `startLongitude`, `finishLatitude`, `finishLongitude`, `propertyLatitude`, `propertyLongitude`) — including nested and array-held values — to `'[MASKED]'`, leaving non-coordinate values intact. AM and OP reads MUST be unchanged. Entries already fully redacted MUST NOT be re-masked.

### Key Entities *(include if feature involves data)*

- **PlatformSetting**: one row per configuration key (`key` unique, `value_json`, `updated_by_id`, timestamps). **Platform-scoped: it has NO `tenant_id`** (see Assumptions). Absence of a row means "use the registry defaults" — nothing is seeded.
- **InspectionExecution (extended)**: gains `start_accuracy_m`, `finish_accuracy_m`, `start_client_at`, `finish_client_at`, `finish_geolocation_distance_meters`, `out_of_radius`, `out_of_window`, `finish_out_of_radius`, `geofence_radius_m`. All nullable or defaulted (expand-only). Still has no `tenant_id` (unchanged; out of scope).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (03.A2)**: With FLAG, a check-in outside the radius records `out_of_radius = true` and the `inspection.geolocation_mismatch` audit (consumed by the F05 exception). With BLOCK, it is refused with 422 `GEOFENCE_OUT_OF_RADIUS` and the clear message above. The automatic fallback to FLAG is proven for "no coordinates", "no accuracy" and "accuracy > radius".
- **SC-002 (00.A3, partial)**: Check-in and check-out record the server date/time, the client (device) time, accuracy, distance and inspector.
- **SC-003**: `GET`/`PUT /v1/platform-settings` work for AM/OP, are audited, emit `platform_setting.updated.v1`, and reject all other roles; a hook registered in the save-hooks map defines the stored/audited/emitted value, and with no hook nothing changes.
- **SC-004**: Every check-in after F03 has `geofence_radius_m` populated.
- **SC-005**: A punctual check-in synced up to 7 days later is never `out_of_window`; an implausible device time never produces `out_of_window = true`.
- **SC-006**: Items queued offline before F03 (coordinates only) continue to be accepted.
- **SC-007**: A CL_ADMIN receives no inspector coordinate in `/v1/audit-logs`; the same fixture read by a CL_ADMIN contains no number under any coordinate key (a test that fails without the mask).
- **SC-008**: The diff stays within the 150-file PR limit; the shared contract (`openapi.json`, `api-types.ts`) is regenerated and committed.

## Assumptions

- **Platform-scoped entity exception (premise, CLAUDE.md §7 rule 1 / D9)**: `PlatformSetting` deliberately has **no `tenant_id`** because it configures cross-tenant behavior (inspectors are cross-tenant), with the same precedent as `IntegrationSetting` and global `ServiceRegion`. This spec records the exception and the scope is guaranteed by RBAC (only AM/OP read or write the endpoints) plus the shared reader port for internal reads. A scoping test MUST prove that CL_ADMIN/CL_USER/INSP/TNT cannot read or write platform settings via the API. `InspectionExecution` keeps having no `tenant_id` (unchanged; not in scope).
- **Onboarding defaults (D4, D17)**: radius 300 m, mode `FLAG`, window tolerance 15 min, completion reminder enabled, 30 min after window end. The platform is Sydney-only today, so the agency timezone is `Australia/Sydney`.
- **BLOCK is dormant at rollout (D27, L-F03-08)**: deploy with `FLAG`. Turning `BLOCK` on requires the PWA sending accuracy (TASK-F03-3 in production), X02 (permanent geocoding) in production, and a geocoding audit of active properties. There is no per-appointment override in this phase.
- **Last-write-wins (D18)**: `PUT` has no optimistic concurrency control; the UI will say "Changes apply within a minute."
- **Save-hooks map is empty here (D30, L-F08-08)**: `PLATFORM_SETTING_SAVE_HOOKS` ships empty; TASK-F08-2 registers the first hook. The update use case accepts the map as an optional constructor argument (default empty) so existing test wirings do not break.
- **`section` is a display label (L-F06-10)**: it equals the web `FormSection` title; `fieldEvents` uses `'Field events'`.
- **Audit coordinate masking scope (D10, L-F01-10)**: F01's `Inspector` audits already avoid `baseLat/baseLng`, so no new keys are added to the mask list for F01. Legacy `inspection.*` audits keep storing coordinates for AM/OP; only the read path masks them for CL.
- **CLAUDE.md transition clauses (L-X00-04)**: this PR removes the transition clauses the X00 PR left in the CLAUDE.md files for rules N6 (`apps/backend/CLAUDE.md` §7.1; `packages/shared/CLAUDE.md` §10.10) and N9 (root `CLAUDE.md` §7.9), as the owner task.
- **No UI in this task**: PWA (TASK-F03-3) and web (TASK-F03-4) consume these contracts later. Event capture, the `cant-do`/`late-notice` events, `INSPECTOR_UNABLE`, the OP alert and the completion reminder are TASK-F03-2.
