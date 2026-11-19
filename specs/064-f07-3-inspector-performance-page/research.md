# Research — Inspector Performance Web (F07-3)

No `NEEDS CLARIFICATION` remained in the Technical Context (the feature is a consumer of a merged contract and every F07 product decision is closed). Research here records the **reuse decisions** and the few **spec-vs-reality corrections** found by directly reading the `apps/web` primitives and shared helpers.

## Decision 1 — UI metric copy lives in the web feature, not the shared enum

- **Decision**: Define display labels, descriptions, per-metric units, and "No data" texts locally in `features/inspector-performance/lib/format-metric.ts`, matching the TASK-F07-3 UI table verbatim ("On-site check-ins", "Finished within 6 hours", "Tenant satisfaction", "Completed volume", "Accepted work", "Late notice given"). Keep `RELIABILITY_METRIC_KEYS` (shared) as the canonical key list/order.
- **Rationale**: F07-1 shipped terser shared labels ("Geofence", "Completion", "Volume", "Valid completion"); the drawer tests require the richer copy. The shared enum comment explicitly delegates: "TASK-F07-3 finalises the exact UI copy." Mutating the shared enum would also affect F08 (not yet merged) with no benefit.
- **Alternatives rejected**: Mutating shared `RELIABILITY_METRIC_LABELS` (wider blast radius, risks F08); using the terse shared labels (fails the tests).

## Decision 2 — Deterministic `D MMM YYYY` date formatter for subtitle/banners

- **Decision**: Add `formatReliabilityDate(civilDate)` → "1 Nov 2026" and `formatReliabilityDateRange(from, to)` → "1 Nov – 30 Nov 2026" in the feature lib, built from a fixed `['Jan',…,'Dec']` array and the `YYYY-MM-DD` parts (no `Intl`, no timezone). Use `formatInstantDateTime(value, PLATFORM_TIMEZONE)` from `@properfy/shared` for instants (`computedAt`, `settingsUpdatedAt`).
- **Rationale (verified)**: `formatCivilDate` (`packages/shared/src/utils/format-display-date.ts:167`) yields `dd/mm/yyyy` ("01/11/2026") and `formatShortDayLabel` yields "Thu 5 Nov" (weekday, no year) — neither matches the required copy. The ICU/locale-default date format drifts by Node version (memory `project_icu_locale_default_date_format_node_version_drift`), so an explicit month array keeps tests stable across CI Node and local Node.
- **Note**: The shared `formatCivilDate` (`dd/mm/yyyy`) remains fine for failure-row dates where that format is acceptable; only the subtitle/banner copy needs `D MMM YYYY`.
- **Alternatives rejected**: `toLocaleDateString`/`Intl` (non-deterministic across builds); the web `@/lib/format-date` wrappers (default to the user timezone, wrong for F07's `PLATFORM_TIMEZONE` display).

## Decision 3 — Row actionability within `DataTable`'s a11y model (verified)

- **Decision**: Render the "Inspector" cell as a focusable control (`<button>`/link) with `aria-label` "Open {name} details" that opens the drawer; use `onRowClick` for the pointer affordance. Render a visually-hidden label to name the table region.
- **Rationale (verified)**: `DataTable` (`apps/web/src/components/data/DataTable.tsx`) makes rows clickable via `onRowClick` but **not** keyboard-focusable and exposes **no** per-row `aria-label` and **no** `caption` prop; its design relies on focusable controls inside cells (explicit code comment). Column field is `label` (not `header`).
- **Alternatives rejected**: Relying on `onRowClick` alone (keyboard-inaccessible); building a bespoke `<table>` (unnecessary scope; `DataTable` covers loading/error/empty/mobile-card states).

## Decision 4 — Drawer focus restore is feature-owned (verified)

- **Decision**: Capture the triggering element when opening the drawer and refocus it on close; rely on `DrawerPanel` for focus-in-on-open, Escape, backdrop close, and body-scroll lock.
- **Rationale (verified)**: `DrawerPanel` (`components/ui/DrawerPanel.tsx`) moves focus into the panel on open but does **not** trap Tab and does **not** restore focus to the trigger on close. A deep-link open (`?inspector=` on first load) has no trigger — nothing to restore.
- **Alternatives rejected**: Assuming `DrawerPanel` restores focus (it does not — the test for Escape→focus-returns would fail).

## Decision 5 — Hook/query + envelope shape (verified)

- **Decision**: `useReliabilityRanking` → `api.GET('/v1/dashboard/inspector-performance')`, key `['reliability','ranking']`, `if (error) throw error`, return `data?.data`. `useInspectorReliability(id)` → `api.GET('/v1/dashboard/inspector-performance/{inspectorId}', { params: { path: { inspectorId: id } } })`, key `['reliability','inspector', id]`, `enabled: !!id`, surface 400/404 as a not-found drawer.
- **Rationale (verified)**: Both routes return an **enveloped** body `content['application/json'].data` (confirmed in `api-types.ts:13561+`), matching the `useInspectorWorkload` precedent's `data?.data` unwrap. Hook-mock fixtures therefore wrap the inner shape as `{ data: <ranking|detail> }`; the schema-shape fixtures parse the inner object directly.

## Decision 6 — Settings section reuses the platform-settings pattern

- **Decision**: `ReliabilityIndexSettingsSection` mirrors `RouteWeightsSettingsSection`: `usePlatformSetting('reliabilityIndex')` + `resolvePlatformSettingValue`, local form state + `validate()` with the exact F07-3 messages, `FormSection`/`FormField`/`NumberInput`, a Save `<Button loading disabled={!dirty||hasErrors}>`, `useSnackbar().showSuccess("Reliability settings saved. Scores are being recalculated.")`, and `onDirtyChange` reporting to `PlatformSettingsPage`. On save success it **additionally** `queryClient.invalidateQueries({ queryKey: ['reliability'] })` so the ranking refetches (the hook already invalidates `['platform-settings']`).
- **Rationale**: Established, tested pattern; keeps the section consistent with F04/F05 siblings and satisfies L-F07-11 (AM and OP both edit/save).

## Decision 7 — Reuse map (import paths, verified)

| Need | Import |
|---|---|
| Table | `DataTable`, `DataTableColumn` from `@/components/data` |
| Drawer | `DrawerPanel` `@/components/ui/DrawerPanel`, `DrawerHeader` `@/components/ui/DrawerHeader` |
| Header | `PageHeader` `@/components/layout/PageHeader`, `PageSectionHeader` `@/components/layout/PageSectionHeader` |
| States | `LoadingState`/`ErrorState`/`EmptyState`/`InfoBanner`/`NoPermissionState` from `@/components/feedback` |
| Tooltip | `Tooltip` `@/components/ui/Tooltip` (`label`, `children`) |
| Forms | `FormSection`, `FormField`, `NumberInput` from `@/components/forms/*`; `Button` |
| Settings hook | `usePlatformSetting` `@/features/platform-settings/hooks/usePlatformSetting`; `resolvePlatformSettingValue` from `@properfy/shared` |
| API client | `api` `@/services/api`; `toApiError`, `ApiError` `@/lib/api-error` |
| Snackbar | `useSnackbar` `@/hooks/useSnackbar` |
| Shared enums/schemas | `RELIABILITY_METRIC_KEYS`, `ReliabilityMetricKey`, `reliabilityRankingResponseSchema`, `inspectorReliabilityResponseSchema`, `allowedRejectionCodesFrom`, `reasonCodeLabel`, `formatInstantDateTime`, `formatRatingAverage`, `PLATFORM_TIMEZONE` from `@properfy/shared` |
| Router | `Loadable(lazyRetry(...))`, `AuthGuard`, `UserRole` in `app/router.tsx` |
| Menu | `NAV_ITEMS`, `filterNavItems`, `NavItem` in `components/shell/Sidebar.tsx` |

## Decision 8 — Freshness logic is a pure, clock-injectable function

- **Decision**: `lib/freshness.ts` exports pure helpers taking `{ isStale, snapshotDate, settingsUpdatedAt, computedAt, now }` → which banner(s) to show, so tests inject `now` without `localStorage` or timers. `FreshnessBanners` renders `InfoBanner variant="warning"` (role=status) for each active banner; used on both the page and the drawer. Stale banner suppressed before 05:00 Sydney; recompute banner has <15 min vs ≥15 min variants; no polling.
- **Rationale**: Matches L-F07-02/L-F07-10 and keeps the Sydney-wall-clock gate (05:00) testable by pinning `TZ` away from Sydney and passing a fixed `now`.
