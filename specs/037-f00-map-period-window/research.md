# Phase 0 Research — F00 map period window

No `NEEDS CLARIFICATION` survived the spec. The decisions with real risk are recorded here.

## Decision 1 — Timezone source is the agency, never the user (L-F00-09)

**Decision**: "today" for the window uses `resolveWindowTimezone(tenant.timezone)` (valid IANA else
`PLATFORM_TIMEZONE`), where `tenant` is the filtered agency (AM/OP) or the user's own agency (CL). Never
`user.timezone`.

**Rationale**: AM/OP `user.timezone` is a personal display preference; a Perth agency filtered by a
São Paulo AM must compute "today" in Perth, or the window is off by a day. The agency GET already carries
both `timezone` and `settingsJson`, so N and the timezone come from one object. CL's personal and agency
timezones coincide, but sourcing both from the agency GET keeps one code path.

**Alternatives**: `user.timezone` (the natural trap the other screens use) — rejected: wrong "today" for
AM/OP. Test H2 fails if the source is wrong (fixed clock at an instant where UTC and Sydney diverge).

## Decision 2 — Empty-PATCH guard runs after findById (FR-004, approved 2026-10-27)

**Decision**: after permission filtering, if `updateData` is empty, skip `update`/`audit`/`event` and
return the current tenant (200). The guard runs **after** `findById`, so a missing target is still 404.

**Rationale**: CL_ADMIN sending only `mapWindowDays` (a discarded key) must not write `tenant.updated`
with before==after (violates E.A2-4). This is a deliberate, approved behavior change for every role;
it is narrow — equal values on an allowed key still write and audit (no value-diff guard, L-F00-06).

**Alternatives**: a value-diff audit guard — rejected (out of scope, L-F00-06); 403 for CL_ADMIN's
`mapWindowDays` — rejected (keep silent discard, A-4).

## Decision 3 — OP write is a new path; the old OP branch is dead (L-F00-02, risk)

**Decision**: remove `OP` from `(CL_ADMIN || OP) && actor.tenantId === tenantId` (OP's JWT never has a
`tenantId`, so that branch never fired) and add a dedicated OP path gated by
`OP_EXTRA_SETTINGS_KEYS = ['mapWindowDays']`.

**Rationale**: the real RBAC gate is the use-case unit tests; route integration tests with a mocked use
case stay green regardless, so a future session could "restore" the OP-403 unless the three canonical
RBAC docs (P2b) and the `role-matrix` scope comment are updated. `role-matrix.ts` has no per-key scope,
so neither `canPerform('tenant.update')` (would 403 OP on `name`/`timezone`) nor narrowing to `['AM']`
(would hide the drawer's "Map" section from OP in a future gate) is correct — a scope comment is.

**Alternatives**: a `scope` field on `role-matrix` or a separate `tenant.update_map_window` action —
rejected (out of scope, L-F00-02).

## Decision 4 — `Today + N days` = N+1 civil days, distinct from F09 (L-F00-03 / L-F09-06)

**Decision**: `computeWindowRange(N, today) = { from: today, to: addCivilDays(today, N) }` — inclusive,
N days *after* today, N+1 civil days. Copy says `Today + {N} days` / `Today + 1 day`.

**Rationale**: F09's density preset is retrospective and exactly N days; unifying the copy would mislead.
The two "today" sources coexist in `AppointmentMapPage` (F09 density uses `PLATFORM_TIMEZONE` by design,
F00 uses the agency tz) and must not be merged.

## Decision 5 — First request must carry the window (`enabled: windowReady`, risk)

**Decision**: the appointments query is `enabled: windowReady`; while the agency GET resolves, the
header shows `Loading…` (never `0 appointments`, since React Query v5 `isLoading` is `false` when
disabled), and the agency GET uses `retry: false` so a failure falls back to 14/Sydney on the first
response.

**Rationale**: without gating, CL would fire an unbounded (or default-14) request before the agency GET,
violating E.A1-1. `useTenantAdminDetail` gains an optional `options` param so the map observer can pass
`retry: false` while the drawer keeps the default retry.

## Decision 6 — Reuse, no new dependency

Reuse `deepMerge` (does not remove keys → "reset to default" means writing 14), `FilterDateRange`
(gains optional `min`/`max`/`helperText`), `useTenantAdminDetail`, the shared date helpers, and
`filter-styles.ts` tokens for the chip. `MapWindowChip` is the only new component (two variants). No
`.default(14)` on the schema (it would inject 14 into every settings parse and change existing payloads).
