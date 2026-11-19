# Data Model — Inspector Performance Web (F07-3)

This feature **creates no entity, table, or migration**. It consumes shapes already defined and merged in `@properfy/shared` (F07-1/F07-2). They are reproduced here as the authoritative render contract; the web layer must never redeclare them — it imports the generated types from `packages/shared/src/api-types.ts` and the Zod schemas from `@properfy/shared` for fixtures.

## Consumed response shapes

### `ReliabilityRankingResponse` — `GET /v1/dashboard/inspector-performance`

| Field | Type | Notes for the UI |
|---|---|---|
| `snapshotDate` | civil date \| null | `null` → empty state ("No scores yet") |
| `windowFrom`, `windowTo` | civil date \| null | subtitle window, `formatCivilDate` (no conversion) |
| `computedAt` | instant ISO \| null | subtitle "Updated …", `formatInstantDateTime` in `PLATFORM_TIMEZONE` |
| `isStale` | boolean | stale banner (only when Sydney clock ≥ 05:00) |
| `settingsUpdatedAt` | instant ISO \| null | recompute banner when `> computedAt` |
| `minimumVolume` | int ≥ 1 | "Not enough data" copy ("… fewer than {minimumVolume} …") |
| `volumeReference` | number > 0 \| null | not shown on the ranking (shown per-metric in drawer) |
| `volumeReferenceSource` | `'MEDIAN' \| 'OVERRIDE'` \| null | — |
| `ranked[]` | array | the ranking table (server order) |
| `ranked[].position` | int ≥ 1 | "Rank {position}"; ties already numbered by server (1,2,2,4) |
| `ranked[].inspectorId` | uuid | row key + `?inspector=` deep link |
| `ranked[].inspectorName` | string | truncate with `title` if long |
| `ranked[].score` | number 0–100 | one decimal (`toFixed(1)`) + decorative bar |
| `ranked[].volume` | int ≥ 0 | "Services" column |
| `ranked[].completedCount` | int ≥ 0 | not shown on ranking |
| `notEnoughData[]` | array | the "Not enough data" block |
| `notEnoughData[].inspectorId` | uuid | row key + deep link |
| `notEnoughData[].inspectorName` | string | — |
| `notEnoughData[].volume` | int ≥ 0 | "{volume} of {minimumVolume} services" |
| `notEnoughData[].status` | `'INSUFFICIENT_VOLUME' \| 'NO_WEIGHTED_DATA'` | `NO_WEIGHTED_DATA` → "No data for the weighted metrics" |

### `InspectorReliabilityResponse` — `GET /v1/dashboard/inspector-performance/{inspectorId}`

| Field | Type | Notes for the UI |
|---|---|---|
| `inspectorId` | uuid | — |
| `inspectorName` | string | drawer `aria-label` "{name} reliability details", header |
| `inspectorStatus` | `'ACTIVE' \| 'INACTIVE'` | `INACTIVE` → "Inactive" badge, hide "Rank" |
| `status` | `'SCORED' \| 'INSUFFICIENT_VOLUME' \| 'NO_WEIGHTED_DATA' \| 'NOT_COMPUTED'` | drives header + metric list |
| `snapshotDate`, `windowFrom`, `windowTo`, `computedAt` | civil/instant \| null | drawer freshness/footer |
| `isStale`, `settingsUpdatedAt` | boolean / instant \| null | drawer freshness banners (same as page) |
| `score` | number 0–100 \| null | header big score (one decimal) / "Not enough data" / "No score yet" |
| `position` | int ≥ 1 \| null | "Rank {position} of {rankedCount}" (omit if null) |
| `rankedCount` | int ≥ 0 | — |
| `volume` | int ≥ 0 | "{volume} services · last 30 days" |
| `completedCount` | int ≥ 0 | volume metric copy |
| `minimumVolume` | int ≥ 1 | INSUFFICIENT_VOLUME header, not-enough-data copy |
| `minimumRatings` | int ≥ 1 | SATISFACTION "Not enough ratings · {n} of {minimumRatings} needed" |
| `volumeReference` | number > 0 \| null | VOLUME metric "median {n}" / "reference {n} (fixed)" |
| `volumeReferenceSource` | `'MEDIAN' \| 'OVERRIDE'` \| null | chooses "median" vs "(fixed)" wording |
| `metrics[]` | array of `ReliabilityMetricResult & { weight }` | eight rows, canonical order |

### `ReliabilityMetricResult` (per metric, `metrics[]` item + `weight`)

| Field | Type | UI use |
|---|---|---|
| `metric` | `ReliabilityMetricKey` | key → label/description (local UI copy) |
| `rate` | number 0–1 \| null | `null` → metric's "No data" text; else `Math.round(rate×100)%` |
| `eligibleCount` | int ≥ 0 | denominator ("… of {eligibleCount} services"), SATISFACTION ratings count |
| `successCount` | int ≥ 0 \| null | numerator ("{successCount} of …") |
| `averageRating` | number \| null | SATISFACTION "{avg to 2dp} / 5" |
| `volumeReference` | number > 0 \| null | VOLUME "median {n}" |
| `weightedSuccess`, `weightedEligible` | number ≥ 0 | tooltip "{weightedSuccess} of {weightedEligible} weighted minutes" (not SATISFACTION/VOLUME) |
| `volume` | int ≥ 0 | — |
| `activeDays` | int ≥ 0 \| null | VOLUME pro-rata "{completed} in {activeDays} days · median {n} / 30 days" |
| `failureCount` | int ≥ 0 | "Show {failureCount} issues" + ">20" cap note |
| `failures[]` | `{ appointmentId, serviceDate, detail }` (≤20) | expandable list, "Open appointment" link |
| `weight` | int 0–10 | "Weight {n}" / "Not weighted" (0) |

## `reliabilityIndex` platform setting (read/written by the settings section)

`GET/PUT /v1/platform-settings/reliabilityIndex` — value shape (from `PLATFORM_SETTINGS_REGISTRY.reliabilityIndex`):

| Field | Type / range | Field in the section |
|---|---|---|
| `weights` | `Record<ReliabilityMetricKey, int 0–10>` (all 8 keys) | eight "Weight" inputs |
| `minimumVolume` | int 1–200 | "Minimum services to be ranked" |
| `volumeReferenceOverride` | int 1–1000 \| null | "Fixed volume reference (optional)" (empty → `null`) |
| `minimumRatings` | int 1–50 | "Minimum ratings for satisfaction" |

Client validation mirrors the server schema; at least one weight must be > 0.

## No new entity / multi-tenant note

No `tenant_id`-bearing entity is added. The rendered reliability data is platform-scoped (inspectors are cross-tenant), consistent with the documented exception to root `CLAUDE.md` §7.1; the web layer enforces nothing at the data level but restricts **visibility** to AM/OP via the route guard and the menu `roles` (D4).
