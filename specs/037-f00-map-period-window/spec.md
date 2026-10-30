# Feature Specification: Default Map Period Window + per-agency mapWindowDays (F00)

**Feature Branch**: `037-f00-map-period-window`  
**Created**: 2026-10-29  
**Status**: Draft  
**Input**: User description: "Default map period window on /map and per-agency mapWindowDays (AM/OP)"

## Context

Task **TASK-F00-1** of Properfy Phase 2, Stage 1. Contract items **E.1, E.2**; acceptance codes
**E.A1, E.A2** (reproduced verbatim in Success Criteria). Touches `packages/shared`, `apps/backend`
and `apps/web` (~27 files incl. the regenerated api-types). Depends only on **TASK-X00-1** (merged);
runs parallel to X01/X02-1/X03/F03-1 with no file overlap. **No migration** (new key in the
`settings_json` JSONB).

Today `/map` opens showing every appointment. After this task:
- The map opens showing only **today … today+N** (inclusive) in both modes (appointments, groups).
- `N` comes from the filtered agency's `settings_json.mapWindowDays`; platform default **14**.
- **AM/OP** can remove the window via a chip (visible even with the filter panel closed);
  **CL_ADMIN/CL_USER** cannot, but see a static period label.
- **AM/OP** can edit `mapWindowDays` for any agency in the agency drawer; CL_ADMIN cannot.

### Multi-tenant / RBAC note (root `CLAUDE.md` §7, constitution §RBAC)

No new entity is introduced; `mapWindowDays` lives in the existing tenant-scoped `Tenant.settings_json`.
This task **widens RBAC**: `OP` (a cross-tenant role per the constitution — its JWT never carries a
`tenantId`) gains a **narrow cross-tenant write** limited to the single settings key `mapWindowDays`
on any agency, enforced in `update-tenant.use-case.ts` via `OP_EXTRA_SETTINGS_KEYS = ['mapWindowDays']`.
Every other field stays AM-only for OP. Because this is an RBAC widening, it carries the full
checklist: the `role-matrix.ts` scope comment (no new `canPerform` key), the three canonical RBAC
docs updated (P2b), and real unit coverage (B1–B16/N1–N8) that is the true gate — route-level
integration tests with a mocked use case cannot prove the RBAC and must not assert the old OP-403.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Map opens on a bounded period, AM/OP can remove it (Priority: P1)

Every role opens `/map` and sees only appointments from today to today+N; the first request already
carries the window. AM/OP can drop the window with a chip to see overdue/future items.

**Why this priority**: This is the contract (E.1/E.A1) — the map stops loading everything at once.

**Independent test**: Render `/map` per role; assert the first `/v1/appointments` request carries
`fromDate=today`/`toDate=today+N`; click the AM/OP chip and assert the next request has no date filter.

**Acceptance Scenarios**:
1. **Given** any role on `/map`, **When** it opens, **Then** the first `/v1/appointments` request has
   `fromDate=today` and `toDate=today+N` (groups mode: `/v1/service-groups` with
   `scheduledDateFrom=today`/`scheduledDateTo=today+14`); no appointments request leaves without dates.
2. **Given** AM/OP, **When** they click the window chip's ✕, **Then** the next request omits the date
   filter and overdue/future items appear.
3. **Given** AM/OP with no agency filter, **Then** N=14; with an agency whose `mapWindowDays=30`
   filtered, N=30; groups mode always N=14.
4. **Given** the filter panel is closed, **Then** the window indicator is still visible beside the
   toggle button (AM/OP removable, CL static); when the window is removed, nothing shows outside the panel.
5. **Given** the filtered agency's `GET /v1/tenants/:id` is pending, **Then** the panel shows
   `Loading…` (never `0 appointments`) and no appointments request fires; on error it falls back to
   14/Sydney on the **first** response (no retry).

### User Story 2 — Editing `mapWindowDays` with scoped RBAC + audit (Priority: P1)

AM edits `mapWindowDays` on any agency; OP edits only that key on any agency; CL_ADMIN cannot. A PATCH
that leaves nothing to write after permission filtering performs no update, audit or event.

**Why this priority**: E.2/E.A2 — the setting must be editable with correct RBAC and audit.

**Independent test**: Unit-test the use case per actor×payload (B1–B16, N1–N8); assert `update`/`audit`/
`event` calls and the audited before/after `settingsJson.mapWindowDays`.

**Acceptance Scenarios**:
1. **Given** AM, **When** PATCH `{settings:{mapWindowDays:30}}` on any agency, **Then** 200 and
   `tenant.updated` with before/after `settingsJson.mapWindowDays` differing.
2. **Given** OP (JWT `tenantId=null`), **When** the same PATCH on any agency, **Then** 200 + audit as above.
3. **Given** OP, **When** PATCH carries any other field/key (alone or with `mapWindowDays`), **Then**
   403 `AUTH_FORBIDDEN`, nothing written, nothing audited.
4. **Given** CL_ADMIN on its own agency, **When** PATCH `{settings:{mapWindowDays:60}}`, **Then** 200,
   the value is unchanged and no audit is written (silent discard; empty-PATCH guard).
5. **Given** any role, **When** nothing remains after permission filtering, **Then** 200 with no
   `update`, no `tenant.updated`, no event; the 404 for a missing target still applies (guard runs
   after `findById`).

### User Story 3 — CL fixed window + out-of-panel indicator (Priority: P2)

CL_ADMIN/CL_USER get a fixed window with a static label and a clamped Date Range; everyone sees the
window state even with the panel closed.

**Why this priority**: UX completeness of E.A1 (L-F00-01/05); depends on US1's window being computed.

**Acceptance Scenarios**:
1. **Given** CL, **Then** no removable chip; editing/clearing the Date Range never produces a request
   outside today..today+N, the inputs always show what was requested (clamp on `onChange`), and a help
   text `Dates are limited to today + {N} days (…)` appears, linked by `aria-describedby`.
2. **Given** the agency drawer in edit mode, **Then** "Map window (days)" shows for AM (with the rest)
   and for OP (alone), and is absent for CL_ADMIN; the Save button is disabled until something changes.

### Edge Cases

- `Today + N days` spans N+1 civil days (N counts days *after* today); N=1 → today and tomorrow.
- GET agency 5xx/network → fallback 14/Sydney on first failure (no retry); a later successful refetch
  with a different N reapplies the window iff `windowActive`.
- CL types a date outside the window → the input snaps to the window edge; inverted range → both inputs
  become the full window.
- AM/OP clear both dates manually → "no window" (request without dates), equivalent to the chip.
- Switching the filtered agency with the window active recomputes N/today and reapplies; with the chip
  removed, dates stay cleared.
- Open via `/map?mode=groups` → groups 14/Sydney; switching to Appointments fires the first request with
  dates. URL date params are ignored.
- AM personal timezone ≠ agency timezone → "today" is the **agency's** (`tenant.timezone`), never
  `user.timezone`. Agency timezone changed in settings → map lags up to 30s (`staleTime`), accepted.
- Changing N while the map is open (drawer save invalidates `['tenant-admins', id]`) reapplies the
  window iff `windowActive`. Midnight does not auto-advance "today" (no timer).

## Requirements *(mandatory)*

### Functional Requirements

**Shared (P1):**
- **FR-001**: Add `mapWindowDays: z.number().int().min(1).max(90).optional()` to `tenantSettingsSchema`
  (no `.default()`), and export `MAP_WINDOW_DAYS_DEFAULT = 14` from `packages/shared/src/schemas/tenant.ts`.
  `updateTenantSchema.settings` accepts it. Regenerate `openapi.json` + `api-types.ts` (`pnpm generate:api`).

**Backend (P2/P2a/P2b):**
- **FR-002**: Route validation rejects `mapWindowDays` outside integer 1..90 (incl. `"14"` string) with
  `400 VALIDATION_ERROR`; off-route callers revalidate in the use case with
  `tenantSettingsSchema.shape.mapWindowDays`, throwing `ValidationError` `field: 'settings.mapWindowDays'`.
- **FR-003**: Use-case RBAC per actor: **AM** full (any agency, any key); **OP** (remove from the
  `(CL_ADMIN || OP) && actor.tenantId === tenantId` condition — that branch is dead because OP's JWT has
  no `tenantId`) takes a new cross-tenant path: any top-level field present → 403; `settings` absent/`{}`
  → 403; any settings key outside `OP_EXTRA_SETTINGS_KEYS = ['mapWindowDays']` → 403 (no silent discard,
  whole request refused); only valid `settings.mapWindowDays` → normal flow (`findById`→404 → `deepMerge`
  → `update` → audit → event). **CL_ADMIN** own tenant as today (mapWindowDays not in the allow-list →
  silently discarded). **CL_ADMIN other / CL_USER / INSP** → 403.
- **FR-004** (empty-PATCH guard, P2a, deliberate behavior change for every role): after permission
  filtering, `settings` reduced to `{}` becomes `undefined`; if `updateData` is empty, the use case does
  **not** call `tenantRepo.update`, `auditService.log` or emit `TENANT_EVENTS.UPDATED`, returning the
  current tenant (200). The guard runs **after** `findById` (missing target still 404). Any real change
  audits as today (narrow guard — equal values still write and audit).
- **FR-005** (audit): existing `tenant.updated` shape; E.A2 = before vs after `settingsJson.mapWindowDays`
  differ, for AM **and** OP. OP 403 → no `update`/`log`. `metadata.actor_tenant_id` is NOT added (out of scope).
- **FR-006** (docs/RBAC, P2b): keep `role-matrix.ts` `'tenant.update': { roles: ['AM','OP'] }` and add a
  scope comment (`OP: only settings.mapWindowDays …`); introduce no `canPerform('tenant.update')` in the
  drawer. Update `specs/002-tenants-branches/contracts/tenant-endpoints.md` (PATCH + the OP lines in
  list/GET/deactivate), `specs/015-permissions-rbac-matrix/spec.md:98`, `specs/backend/tenant.spec.md`.

**Web — window computation (P4/P5/P6):**
- **FR-007**: New pure lib `apps/web/src/features/appointments/lib/map-period-window.ts`:
  `resolveMapWindowDays(settingsJson)` (default 14 on absent/invalid), `resolveWindowTimezone(tz)`
  (valid IANA else `PLATFORM_TIMEZONE`), `computeWindowRange(N, today)` (`{from: today, to: addCivilDays(today,N)}`,
  inclusive), `clampRangeToWindow(range, window)`, `formatWindowLabel(N)` (`Today + {N} days` / `Today + 1 day`),
  and `buildDefaultAppointmentFilters`/`buildDefaultGroupFilters` (replacing the `DEFAULT_*` constants).
- **FR-008**: New `useMapPeriodWindow` hook resolves N + timezone + `windowReady` per role/mode (table in
  §4 of the task): CL uses its own agency (`user.tenantId`); AM/OP use the filtered agency via
  `useTenantAdminDetail(id, { retry: false })` (hook gains an optional `options` param) or 14/Sydney when
  none; groups always 14/Sydney. **Never** `user.timezone`. Agency query uses `retry: false`; while
  `!windowReady` the appointments query is `enabled: false` and the header shows `Loading…`.
- **FR-009**: `useMapWindowFilters` exposes one `onFiltersChange(next)` entry per mode: (1) `tenantId`
  change → recompute + reapply window, never disables; (2) `dateFrom/dateTo` change → manual edit: AM/OP
  set `windowActive=false`, CL clamp on `onChange`; (3) other fields pass through untouched. Internal
  reapplications (open, agency switch, N change, `resetDates`) use a setter that bypasses rule (2).
  Chip ✕ (AM/OP only) sets `windowActive=false` and clears both dates. `windowActive[mode]` starts `true`.
- **FR-010**: Wire into `AppointmentMapPage` (≤~20 lines): initial state from builders, `enabled: windowReady`,
  `Loading…` header while `!windowReady`, agency-switch reapply, `?mode=groups` opening (appointments state
  starts `windowActive=true`). Do not touch the dead `DEFAULT_MAP_FILTERS`. The F09 density layer keeps its
  own `PLATFORM_TIMEZONE` "today"; the two are not unified (L-F09-06).

**Web — UI (P3/P7/P7b):**
- **FR-011**: Window chip in `AppointmentMapFilterPanel` above the Date Range in both modes, visible only
  for AM/OP with `windowActive`: `<button aria-label="Remove date window: today plus {N} days" title="Show all dates">`
  with text `Today + {N} days` + `mdi-close`; keyboard-operable; after removal focus goes to the "From" input.
  CL never renders it; CL Date Range gets `min=today`/`max=today+N` + `helperText` linked by `aria-describedby`.
- **FR-012**: New `MapWindowChip` component (`removable`/`static` variants) rendered beside
  `MapFilterToggleButton` (visible panel open or closed): AM/OP removable (same action/aria), CL static
  `<span>` `Today + {N} days` `aria-label="Showing today plus {N} days"`; nothing when `!windowActive`/`!windowReady`.
- **FR-013**: Agency drawer (edit mode only) gains a "Map" `FormSection` with `TextInput type=number` (1–90),
  help text `Days ahead of today the map shows by default (1–90). Default: 14 (today through 14 days ahead).`,
  prefilled via `resolveMapWindowDays`, inline error `Enter a whole number between 1 and 90.`. AM sees it
  with everything; OP sees **only** "Map" and PATCHes exactly `{settings:{mapWindowDays:<n>}}`; CL_ADMIN
  doesn't see it; create mode omits it. In edit mode Save is `disabled={!isDirty || isSaving}` for all roles.

### Key Entities

No new entity. `Tenant.settings_json` (tenant-scoped JSONB) gains an optional `mapWindowDays` integer
1–90; default behavior (14) is a constant, not a stored default.

## Success Criteria *(mandatory)*

### Contract acceptance (E.A1 / E.A2) and task criteria

- **E.A1-1**: On `/map`, the **first** `/v1/appointments` request for **every** role carries `fromDate=today`
  and `toDate=today+N`; groups → `/v1/service-groups` with `scheduledDateFrom=today`, `scheduledDateTo=today+14`;
  no appointments request opens without dates.
- **E.A1-2**: CL_ADMIN/CL_USER see no removable chip; clearing/editing the Date Range never requests outside
  today..today+N, inputs always show the requested period (clamp on `onChange`), and the `Dates are limited to
  today + {N} days (…)` help text shows.
- **E.A1-3**: AM/OP remove the window via the chip (explicit action, approved 2026-10-27); the next request
  has no date filter.
- **E.A1-4**: AM/OP without an agency filter → N=14; with an agency of `mapWindowDays=30` → N=30; groups → 14.
- **E.A1-5** (L-F00-01): with the panel closed, the window indicator shows for all four roles (AM/OP removable,
  CL static); removed → nothing outside the panel.
- **E.A1-6** (L-F00-04): while the agency GET is unresolved the panel shows `Loading…` (never `0 appointments`);
  a GET failure frees the map with 14/Sydney on the first response, no retry.
- **E.A1-7** (L-F00-07): changing status/branch/time/search does not change `windowActive`; switching the
  agency with the window active does not disable it.
- **E.A2-1**: AM writes `mapWindowDays` on any agency → 200 and `tenant.updated` with differing
  before/after `settingsJson.mapWindowDays`.
- **E.A2-2**: OP writes `mapWindowDays` on **any** agency → 200 and `tenant.updated` with before/after.
- **E.A2-3**: OP sending any other field/key (alone or with `mapWindowDays`) → 403, no write, no audit.
- **E.A2-4**: CL_ADMIN sending `mapWindowDays` on its own agency → 200, the value is unchanged and no audit
  is written (when nothing else changed).
- **E.A2-5**: the drawer shows "Map window (days)" for AM (with the rest) and OP (alone), not for CL_ADMIN.
- **E.A2-6** (L-F00-06): in edit mode the drawer Save is disabled while nothing changed (AM, OP, CL_ADMIN).
- **Empty-PATCH guard**: a PATCH with nothing left after permission filtering (any role) → 200 with no
  `update`, no `tenant.updated`, no event; a real change audits normally.
- **Gates**: shared build+test, backend typecheck+lint+test, web typecheck+lint+test all pass; ~27 files (<150).

## Assumptions

- **A-1** (Q15, 2026-10-27): Mixed model — AM/OP open with the window and can remove it; CL has a fixed
  window with no chip. **No server-side limit** (CL already sees the same data in list/export).
- **A-2** (window start, 2026-10-27): today → today+N; overdue items appear only when AM/OP remove the window.
- **A-3** (Q20, 2026-10-27): AM and OP edit; OP gets the **most restricted** widening — only `mapWindowDays`
  on any agency, via `OP_EXTRA_SETTINGS_KEYS`; everything else stays blocked for OP; CL_ADMIN does not edit.
- **A-4** (2026-10-27): CL_ADMIN sending `mapWindowDays` → silently discarded (200, no 403); empty-PATCH
  after filtering → no update/audit/event (deliberate behavior change for all roles).
- **A-5** (2026-10-27): agency GET failure on the map → N=14 + `PLATFORM_TIMEZONE`, query freed (map never blocks).
- **A-6** (2026-10-27): platform default 14; no filtered agency → 14; groups always 14.
- **A-7** (L-F00-03): `Today + {N} days` spans N+1 civil days — intentionally different from F09's
  retrospective exact-N preset; the two "today" sources (F00 agency-tz window, F09 Sydney density) coexist
  and are not unified (L-F09-06).
- **A-8** (L-F00-09): timezone source is always `tenant.timezone` from the GET (or `PLATFORM_TIMEZONE`),
  never `user.timezone`; a ≤30s lag after an agency timezone change is accepted.
- **A-9** (L-F00-08): `/map` reads no date params from the URL; `?mode=groups` stays the only honored param.
- **A-10** (L-F00-10): no feature flag; rollback = revert the PR (no migration; existing `mapWindowDays`
  values go inert under `passthrough` and re-apply on redeploy; no backfill). After a revert OP returns to
  403 on PATCH and the map opens unbounded.
- **A-11** (merge order with F09, L-F09-09): both F00 (P2b) and TASK-F09-1 edit `role-matrix.ts` and
  `AppointmentMapPage.tsx`/`FilterDateRange.tsx`; whoever merges second rebases and keeps both.
- **A-12**: X01 (#1311) is not a dependency; F00 bases on `origin/develop` (which has X00). If F00 ends up
  touching `Sidebar.tsx` it only respects X01's canonical order (it does not — F00 reads the `/map` route only).
