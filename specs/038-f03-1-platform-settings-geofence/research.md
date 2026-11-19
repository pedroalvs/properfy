# Research — F03-1 Platform settings, GPS precision & geofence

No open `NEEDS CLARIFICATION` remained after the spec: TASK-F03-1 resolved every decision upstream (D4, D5, D8, D9, D10, D15–D17, D19, D24, D25, D27, D29, D30, D31 and L-F03-05/06/08/10). This file records the design decisions and why the alternatives were rejected.

## D-1 · PlatformSetting has no `tenant_id`

- **Decision**: `platform_settings` is a platform-scoped table with no `tenant_id`; absence of a row means "use the registry defaults" (nothing is seeded).
- **Rationale**: it configures cross-tenant behavior (inspectors are cross-tenant). Same precedent as `IntegrationSetting` and global `ServiceRegion`. Enforced by RBAC (AM/OP-only API) + the internal reader port. Audit uses `tenant_id: null` + `metadata.actor_tenant_id`.
- **Alternatives rejected**: per-tenant rows (wrong scope — a geofence radius is a platform policy, and F04/F05/F07/F08 need one cross-tenant source); env vars / hard-coded constants (operation cannot tune them, and the task forbids it).

## D-2 · Typed registry in shared, one key per feature

- **Decision**: `PLATFORM_SETTINGS_REGISTRY` maps each key to `{ schema, defaults, section }`. `PlatformSettingKey`/`PlatformSettingValue<K>` are derived types; `resolvePlatformSettingValue(key, stored)` merges stored JSON over defaults and parses, returning `{ value, valid }` (defaults + `valid: false` on failure). Features extend by appending a key, never repurposing one.
- **Rationale**: a single typed source of defaults and validation; the backend reader and the web page both consume it; invalid stored JSON degrades to defaults instead of breaking the hot path (check-in must never fail on config).
- **Alternatives rejected**: ad-hoc per-key schemas scattered in the backend (breaks contract-first and the web form); throwing on invalid stored value (would break check-in).

## D-3 · Read cache: per-instance 30 s TTL, event + hooks for extension

- **Decision**: `PlatformSettingsService implements IPlatformSettingsReader` with an injectable clock and a 30 s TTL map; `invalidate(key)` clears the local entry on write. A `platform_setting.updated.v1` domain event fires after commit (subscribers via `Promise.allSettled`). An optional `PLATFORM_SETTING_SAVE_HOOKS` map (empty here) lets a feature derive the stored value after validation.
- **Rationale**: avoids a DB hit per check-in; cross-instance convergence within the TTL is acceptable for config (documented in UI as "changes apply within a minute"). Event + hooks keep the update use case closed to feature-specific logic (F07 subscribes; F08 registers a hook) — no feature edits the use case.
- **Alternatives rejected**: no cache (DB read on every check-in); Redis/pub-sub invalidation (constitution bans Redis; TTL is sufficient); optimistic concurrency on `PUT` (D18: last-write-wins is accepted for low-frequency operator edits).

## D-4 · Geofence: FLAG default, BLOCK with automatic fallback, strict `>`

- **Decision**: pure `evaluateGeofence({ distanceMeters, accuracyMeters, radiusMeters, mode })` → `{ outOfRadius, effectiveMode, fallbackReason, blocked }`. `out_of_radius` is `distance > radius` (equality is inside). `BLOCK` downgrades to `FLAG` when there are no coordinates (`NO_PROPERTY_COORDINATES`), no accuracy (`NO_ACCURACY`), or accuracy > radius (`POOR_ACCURACY`). It runs **after** the existing-execution check.
- **Rationale**: criterion 03.A2; never strand a legitimate inspector when the measurement is unreliable; a retry of an in-progress execution must not be re-blocked.
- **Alternatives rejected**: blocking whenever out of radius regardless of accuracy (false negatives strand inspectors); `>=` comparison (would block an inspector exactly at the boundary).

## D-5 · Client time plausibility window −7 days / +5 min

- **Decision**: pure `resolveEffectiveEventTime(clientOccurredAt, serverNow)` → `{ effectiveAt, clientTimePlausible }`. Plausible window is −7 days / +5 min. Implausible → effective time is the server time, `out_of_window = false`, audit `windowSkipped = 'IMPLAUSIBLE_CLIENT_TIME'`. Absent client time → server time, `clientTimePlausible: null`.
- **Rationale**: an inspector who was on time but synced late (Friday → Monday) must not be penalized; a wrong/forward device clock must not fabricate an out-of-window flag. "Never penalize without evidence."
- **Alternatives rejected**: trusting any client time (clock-skew abuse / accidental future clocks); always using server time (penalizes legitimate offline check-ins synced later).

## D-6 · Capture is additive and backward-compatible

- **Decision**: `accuracy` and `clientOccurredAt` are optional on start/finish requests; all new response/detail fields are `optional()`. Accuracy is clamped to `Decimal(10,2)` max rather than rejected. `geofence_radius_m` is snapshotted on every post-F03 check-in.
- **Rationale**: offline items queued before F03 (coordinates only) must still sync; idempotency-cached responses (24 h TTL) must still validate against the response schema after deploy; a 400 on absurd accuracy would poison a queued item forever; the radius snapshot explains the flag even if the setting later changes.
- **Alternatives rejected**: required fields (breaks offline queue + idempotency cache); rejecting absurd accuracy with 400 (poisons the queue).

## D-7 · Coordinate masking on read for CL, no coordinates in new audits

- **Decision**: new audits (`check_in_blocked`, FINISH `geolocation_mismatch`) carry no coordinate keys. A pure `maskCoordinateKeys` walks objects/arrays and replaces a fixed set of coordinate keys with `'[MASKED]'`; `list-audit-logs` applies it for `CL_ADMIN` reads only (AM/OP untouched; `FULL`-redacted entries untouched).
- **Rationale**: criterion D10 privacy; the existing `/v1/audit-logs` CL path leaks `inspection.started` coordinates today. Masking on read fixes legacy rows without rewriting audit history (which belongs to the retention/erasure feature 020).
- **Alternatives rejected**: rewriting legacy audit rows (out of scope, destructive); dropping coordinates from AM/OP too (AM/OP legitimately need them for investigations).

## Testing approach

- Pure domain services (`evaluateGeofence`, `isOutOfCheckInWindow`, `resolveEffectiveEventTime`, `maskCoordinateKeys`) are table-tested in isolation — cheapest, highest-signal.
- Use-case tests extend the existing `start`/`finish`/`get-appointment-detail` suites; all untyped test wirings that `new StartInspectionUseCase(...)` etc. are updated for the new `IPlatformSettingsReader` dependency (`project_adding_usecase_dep_breaks_untyped_test_wirings`).
- Timezone-dependent tests pin `process.env.TZ` away from Sydney (`feedback_tz_dependent_test_must_pin_away`).
- Integration-db tests (testcontainers, serial) cover the endpoints, the geofence end-to-end, and the audit-log masking against a real row.
