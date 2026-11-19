# UI Component Contracts (new) — F07-3

All new components live under `apps/web/src/features/inspector-performance/` unless noted. Types come from `@properfy/shared`; no `as any`.

## `InspectorPerformancePage` (pages/)

- **Route**: `/inspector-performance`, guarded `AuthGuard roles={[AM, OP]}`, lazy via `Loadable(lazyRetry(...))`.
- **Reads**: `useReliabilityRanking()`; the `?inspector=` search param (via router) to control the drawer.
- **Renders**: `PageHeader` (title "Inspector performance", subtitle, "Configure weights" secondary action); fixed `InfoBanner variant="info"`; `FreshnessBanners`; state ladder — `LoadingState`/`ErrorState`(onRetry=refetch)/`EmptyState`(snapshotDate null)/content; `RankingTable`; `NotEnoughDataList`; `ReliabilityDrawer` controlled by `?inspector=`.
- **Behavior**: opening a row sets `?inspector=<id>` (and remembers the trigger element for focus restore); closing clears it and restores focus.

## `RankingTable` (components/)

- **Props**: `{ rows: RankedInspector[]; onOpen: (id: string, trigger: HTMLElement | null) => void }`.
- **Renders**: `DataTable` columns Rank / Inspector / Score / Services; "Services" `hideOnMobile`. The Inspector cell renders a focusable button `aria-label="Open {name} details"` (truncate long names with `title`) that calls `onOpen`; `onRowClick` also calls `onOpen` (pointer). Score cell shows `score.toFixed(1)` + an `aria-hidden` bar (width `score/100`). Rank cell shows the number with `aria-label="Rank {n}"`. A visually-hidden label "Inspectors ranked by reliability score" names the region. When `rows` is empty, renders "No inspector has enough services to be ranked yet.".

## `NotEnoughDataList` (components/)

- **Props**: `{ items: NotEnoughDataInspector[]; minimumVolume: number; onOpen: (id, trigger) => void }`.
- **Renders**: nothing when `items` is empty; otherwise a `PageSectionHeader` "Not enough data" + explanatory text "Inspectors with fewer than {minimumVolume} services in the last 30 days are not ranked." + one focusable item per inspector: "{name} · {volume} of {minimumVolume} services" (`INSUFFICIENT_VOLUME`) or "{name} · No data for the weighted metrics" (`NO_WEIGHTED_DATA`), each opening the drawer.

## `ReliabilityDrawer` (components/)

- **Props**: `{ inspectorId: string | null; onClose: () => void }` (open when `inspectorId` is non-null).
- **Reads**: `useInspectorReliability(inspectorId)`.
- **Renders**: `DrawerPanel size="narrow" ariaLabel="{name} reliability details"` + `DrawerHeader title={name} onClose`; `FreshnessBanners`; header (big score / "Not enough data" / "No score yet"; "Rank {position} of {rankedCount}" unless null; "{volume} services · last 30 days"; "Inactive" badge when `inspectorStatus==='INACTIVE'`); for `SCORED`/`INSUFFICIENT_VOLUME`/`NO_WEIGHTED_DATA`, eight `MetricRow`s in `RELIABILITY_METRIC_KEYS` order; for `NOT_COMPUTED`, the "No score yet" message and no rows; footer two lines. Loading → skeleton; error → "We couldn't load this inspector's metrics." + Try again; 400/404 → "We couldn't find this inspector." + Close.

## `MetricRow` (components/)

- **Props**: `{ metric: ReliabilityMetricResult & { weight }; minimumRatings: number; volumeReferenceSource: 'MEDIAN'|'OVERRIDE'|null }`.
- **Renders**: label + description (local copy); the formatted value (see `format-metric.ts`) with a decorative bar whose value text sits beside it; "Weight {n}" or "Not weighted" (weight 0, de-emphasised). A `Tooltip label="{weightedSuccess} of {weightedEligible} weighted minutes"` on the value for every metric except SATISFACTION and VOLUME. Delegates failures to `MetricFailures`.

## `MetricFailures` (components/)

- **Props**: `{ appointmentFailures: ReliabilityMetricFailure[]; failureCount: number }`.
- **Renders**: nothing when `failureCount === 0`; otherwise a toggle button "Show {failureCount} issues" (`aria-expanded`) expanding a list of "{serviceDate} · {detail}" rows (serviceDate via shared `formatCivilDate`), each with an "Open appointment" link to `/appointments/:appointmentId` (same tab); a "Showing the 20 most recent of {failureCount}" note when `failureCount > 20`.

## `FreshnessBanners` (components/)

- **Props**: `{ isStale; snapshotDate; settingsUpdatedAt; computedAt; now?: Date }`.
- **Renders**: zero, one, or both warning banners from the pure `lib/freshness.ts` decision: stale ("Scores haven't been updated since {D MMM YYYY}. The nightly job didn't finish; operations has been notified.", only when Sydney wall-clock ≥ 05:00) and recompute ("Weights were changed at {time}. Scores will update within a few minutes." < 15 min, else "Weights were changed at {time} but scores haven't been recalculated yet. Operations has been notified."). Each an `InfoBanner variant="warning"` (`role="status"`). No polling.

## `lib/format-metric.ts` (pure)

- `metricLabel(key)`, `metricDescription(key, { minimumRatings })`, `formatMetricValue(metric, { minimumRatings, volumeReferenceSource })` → the display string / "No data" per metric; `formatReliabilityDate(civil)`, `formatReliabilityDateRange(from, to)` (deterministic `D MMM YYYY`); `formatScore(score)` → `score.toFixed(1)`.

## `ReliabilityIndexSettingsSection` (features/platform-settings/components/)

- **Props**: `{ onDirtyChange?: (dirty: boolean) => void }`.
- **Behavior**: `usePlatformSetting('reliabilityIndex')`; eleven fields with the exact validation messages (see spec FR-015); Save `PUT`s the full object, shows the success snackbar, and invalidates both `['platform-settings']` (hook) and `['reliability']` (added); anchor `id="reliability-index"`; visible/editable for AM and OP.
- **Wiring**: `PlatformSettingsPage` appends `<ReliabilityIndexSettingsSection onDirtyChange={setReliabilityDirty} />` and ORs its dirty flag into the page guard.

## Edit — `StatusTransitionDialog` (features/appointments/components/)

- Replace fixed `REJECTION_OPTIONS` with `allowedRejectionCodesFrom(currentStatus)` + `reasonCodeLabel`, for `targetStatus === 'REJECTED'`, still filtering `SYSTEM_ONLY_REJECTION_CODES`. Show the per-code hint for `INSPECTOR_NO_SHOW`/`NOT_EXECUTED`. Surface a `422 REJECTION_CODE_NOT_ALLOWED` without closing.

## Edit — `Sidebar` (components/shell/)

- Add Dashboard submenu child after "Workload": `{ icon: 'mdi-podium', label: 'Inspector performance', to: '/inspector-performance', roles: [AM, OP] }`.
