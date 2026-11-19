# Phase 1 Data Model — F00

**No relational model change, no migration.** One optional key is added to the existing tenant-scoped
`Tenant.settings_json` JSONB. The sections below document the setting shape and the PATCH RBAC contract.

## Setting: `mapWindowDays`

| Item | Value |
|---|---|
| Location | `settings_json.mapWindowDays` (camelCase in the JSONB) |
| Schema | `mapWindowDays: z.number().int().min(1).max(90).optional()` in `tenantSettingsSchema` |
| Range | 1–90 inclusive; non-integer / `"14"` string / 0 / 91 rejected (400) |
| Default | **no `.default()`** in the schema; effective default = `MAP_WINDOW_DAYS_DEFAULT = 14` (exported from `packages/shared/src/schemas/tenant.ts`) |
| Migration | none (new JSONB key) |
| Tolerant read (web) | `resolveMapWindowDays(settingsJson)` → the value when it passes the schema, else `14` (absent, null, 0, 91, 7.5, string, legacy invalid) |
| Reset to default | write `14` explicitly (`deepMerge` never removes keys) |

## Contract: `PATCH /v1/tenants/:tenantId` (shape unchanged; new RBAC path)

Request body unchanged (`updateTenantSchema`); OP example `{ "settings": { "mapWindowDays": 30 } }`.

**Route validation (all roles, before the use case):** `mapWindowDays` outside int 1..90 →
`400 VALIDATION_ERROR`. Off-route callers revalidate in the use case (`ValidationError`,
`field: 'settings.mapWindowDays'`).

**RBAC matrix (role × target):**

| Role / target | `settings.mapWindowDays` | other settings keys | top-level fields |
|---|---|---|---|
| AM / any agency | write (200 + audit) | write | write |
| OP / any agency | **write (200 + audit)** | **403** | **403** |
| CL_ADMIN / own agency | **silent discard (200; no update/audit if nothing else remains — guard)** | allow-list writes, rest discarded | `name/appointmentCodePrefix/timezone` |
| CL_ADMIN / other agency | 403 | 403 | 403 |
| CL_USER, INSP | 403 | 403 | 403 |

Evaluation order: AM (full) → OP (new cross-tenant path: any top-level field or `settings` absent/`{}`
or any key ∉ `OP_EXTRA_SETTINGS_KEYS` → 403; else normal flow) → CL_ADMIN own (as today) → others 403 →
**empty-PATCH guard** (after `findById`): empty `updateData` → no update/audit/event, return current (200).

**Response 200**: `tenantResponseSchema` unchanged; `settingsJson.mapWindowDays` reflects the stored value.
**Errors**: `400 VALIDATION_ERROR` · `403 AUTH_FORBIDDEN` · `404 TENANT_NOT_FOUND` · existing conflicts unchanged.

**Audit** (`tenant.updated`, existing shape): E.A2 = before vs after `settingsJson.mapWindowDays` differ,
for AM and OP. OP 403 → no `log`/`update`. Empty-PATCH after filtering (any role) → no `log`/`update`/event.

## Web UI contracts (new/extended)

- `map-period-window.ts`: `resolveMapWindowDays`, `resolveWindowTimezone`, `computeWindowRange`,
  `clampRangeToWindow`, `formatWindowLabel`, `buildDefaultAppointmentFilters`, `buildDefaultGroupFilters`.
- `useMapPeriodWindow` → `{ windowDays, timezone, today, windowReady, windowActive[mode], onFiltersChange, resetDates }`.
- `FilterDateRange` gains optional `min?`, `max?`, `helperText?` (renders `<p id>` wired via `aria-describedby` to both `DateInput`s).
- `MapWindowChip` → props for `removable` (AM/OP, `onRemove`, `returnFocusRef`) vs `static` (CL label).
- `useTenantAdminDetail(id, options?: { retry?: false })` — optional second param, spread into the query.
