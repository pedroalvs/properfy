# Phase 0 Research: F04-3 PWA Day Screen

No open `NEEDS CLARIFICATION` remained after the spec (all product decisions are closed and recorded as premises). This file records the design decisions that shape the implementation.

## D1 — Routing: nested `today` with a `route/:date` child, no `/profile` rename

- **Decision**: `router.tsx` exports its `routes` array; index and `*` resolve to `/today`; a `today` branch uses `TodayLayout` with children `route` and `route/:date`; `profile` and its children stay exactly as merged (F01-3/F02-3). An invalid `:date` in the path replaces to `/today/route`.
- **Rationale**: The design v3 puts the day as home, but keeping `/profile/*` and `/earnings/*` URLs intact avoids redirects, dead links in existing notices, and the cost/risk of a rename (reverted 2026-10-28). `More` simply points at `/profile`.
- **Alternatives rejected**: Rename `/profile`→`/more` (extra churn, broken deep links, no product value); a flat `/route` route (loses the two-pane master/detail wide layout `TodayLayout` gives).

## D2 — `useMatch('/today/route/*')` for wide-layout selection and More-active

- **Decision**: `TodayLayout` computes `hasSelection = useMatch('/today/route/*') !== null`; `BottomNavBar` marks More active via `useMatch` on `/profile/*` and `/earnings/*`.
- **Rationale**: F02 lesson — a single-segment `useMatch` misses nested routes; the `/*` form matches `route` and `route/:date`. More must stay active across the whole profile/earnings hub.
- **Alternatives rejected**: `useLocation().pathname.startsWith(...)` (fragile against query/hash, reinvents router matching).

## D3 — Data layer: TanStack Query keyed by civil date, STALE self-heal

- **Decision**: `useDayPlan(date)` → key `['inspector','day-plan', date]`; 404 codes map to `NOT_PUBLISHED`/`NOT_FOUND` states (no retry on 4xx); `status 'STALE'` triggers exactly one refetch after 2 s per plan `version`; network error with cache keeps old data + `isOffline`. `useCivilToday()` recomputes the date on visibility/focus/midnight timer.
- **Rationale**: The server already returns the recalculated plan to the inspector, so the PWA never resolves STALE itself — it only nudges one refetch to catch the brief server race, bounded per version to avoid loops. Civil-date keying + recompute handles the day boundary without the device tz leaking into business dates.
- **Alternatives rejected**: Polling STALE until resolved (loops, wasted requests); keying by a device-local date string (wrong across tz / midnight).

## D4 — Writes via new `apiPut`/`apiDelete`/`apiGetBlob`; `setQueryData` on origin change

- **Decision**: Add `apiPut`, `apiDelete`, `apiGetBlob` mirroring `apiPost` (Bearer + refresh + `withRetryAfter`). `useDayPlanOrigin` replaces the plan in cache with the server response (not an optimistic merge); `useRouteSheetDownload` streams a blob and revokes the object URL after 30 s.
- **Rationale**: The server returns the fully recomputed plan (final Directions ETAs) on origin change, so `setQueryData` with the response is authoritative and simplest. The PWA has no PUT/DELETE/blob helpers yet; adding them in the shared `useApiQuery` keeps one HTTP path with the existing refresh logic.
- **Alternatives rejected**: Optimistic origin update (ETAs would be wrong until refetch); a bespoke fetch for the sheet (bypasses auth/refresh).

## D5 — Offline: one minimal SW NetworkFirst route, logout-cleared

- **Decision**: Add exactly one route to `src/sw/runtime-caching.ts` for `^/v1/inspector/day-plans/\d{4}-\d{2}-\d{2}$` (GET), `cacheName 'api-day-plan-cache'`, `networkTimeoutSeconds 10`, `maxEntries 3`, `maxAgeSeconds 12 h`, `statuses:[200]`. Register the name in `INSPECTOR_API_CACHES` so logout deletes it.
- **Rationale**: `apps/pwa/CLAUDE.md` mandates caching "schedule for today" for offline; the plan needs the same. The response carries tenant contact PII, so bounding retention (3 entries, 12 h, 200-only) and clearing on logout are mandatory — otherwise one inspector's contacts survive to the next device user.
- **Alternatives rejected**: Caching the sheet or writes (sensitive binaries / mutations); a broad pattern catching AM/OP `/v1/day-plans/...` (leaks other inspectors' plans, wrong cache).

## D6 — Component reuse via two extractions

- **Decision**: Extract `AppointmentActionBar` (Check in/out + "More actions") from the F03 `AppointmentCard`, and `BaseAddressFields` (the structured F01 address inputs) from `ProfileAccountPage`. Both are consumed by the new Today/Route UI; the original screens use the extractions with no visible change.
- **Rationale**: The Next-inspection card needs the exact F03 action semantics, and the OriginSheet needs the exact F01 fields; extracting avoids divergent copies and keeps one source of truth. A DOM assertion guards against button-in-button when embedding the action bar in the card's `<article>`.
- **Alternatives rejected**: Re-implementing the action bar / address fields (duplication, drift, F03/F01 regressions).

## D7 — Navigate (01.6): Apple vs Google by UA + touch points

- **Decision**: `buildNavigationUrl({lat,lng,address}, {userAgent, maxTouchPoints})` returns Apple Maps for `/iPhone|iPad|iPod/` or (`Macintosh` with `maxTouchPoints > 1`, i.e. iPadOS), else Google Maps; with no plottable point the encoded full address replaces coordinates. Pure function, injected env, fully unit-tested.
- **Rationale**: iPadOS reports a desktop `Macintosh` UA; `maxTouchPoints` disambiguates. Pure + injected env makes platform branches testable without a real device.
- **Alternatives rejected**: `navigator.platform` (deprecated, unreliable); server-side detection (unnecessary, the link is client-only).

## D8 — F02 notice wiring (DB7) in this same PR

- **Decision**: Append `/today` to `INSPECTOR_NOTICE_TARGET_PATTERNS` as an exact static pattern (F02 D24), pass `targetPath: '/today'` in `PublishDayPlansUseCase`/`RecalculateDayPlanUseCase`, and make the SW `resolveClickTarget` open `/today` for route notices. The inbox path, deep link and fallback are unchanged.
- **Rationale**: Allowlist, Today screen and bar must land together — without `/today` allowed, the backend would reject the `targetPath` and the push would fall back to the inbox. Shipping all three in one PR keeps the contract consistent and the rollback clean (revert → fallback is safe).
- **Alternatives rejected**: Splitting the allowlist and the screen across PRs (temporarily broken deep link); a parameterized `/today/:x` pattern (over-broad, fails the exact-match tests).

## References (verified on `origin/develop` at PR #1331)

- `packages/shared/src/schemas/day-plan.ts` — `dayPlanResponseSchema`, `dayPlanStopSchema`, `setDayPlanOriginRequestSchema`, `toOptimizerInput`, `buildLegOverrides` present.
- `packages/shared/src/constants/inspector-notices.ts` — allowlist with 2 patterns, exact segment matcher; comment "F04 appends `/today`".
- `packages/shared/src/utils/format-display-date.ts` — `formatWallTimeRange`, `formatInstantDate*` present; `formatInstantTime` absent (to add).
- `packages/shared/src/api-types.ts` — all 5 `/v1/inspector/day-plans/{date}[...]` endpoints present.
