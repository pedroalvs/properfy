# Phase 0 Research — F04 Plan B PR-B (PWA reorder via server preview)

## R1 — How to derive "+N min vs. suggested" from a single-order endpoint

- **Decision**: Call the preview endpoint for two orders — the draft order and the aligned
  suggested order (`alignOrder(plan.suggestedOrder, reorderableIds)`) — and compute
  `deltaMin = round((draftFinishMs − suggestedFinishMs) / 60000)`. Cache the suggested-order
  preview by `(date, plan.version, suggestedOrderKey)` so it is fetched at most once per
  version. When the draft order equals the aligned suggested order, the delta is 0 with no
  extra call.
- **Rationale**: The shipped `PreviewDayPlanOrderResponse` returns `finishEta` for one order
  only, no delta. The old local `evaluateDraft` compared both orders over the *same* matrix.
  Comparing a MATRIX finish against `plan.finishEta` (Directions) would mix sources and give a
  wrong delta. Two MATRIX previews keep one comparison basis and reproduce the old number.
- **Alternatives rejected**: (a) extend the contract to return the delta — forbidden (PR-C/
  Pillar owns the contract; this PR is PWA-only). (b) compare against `plan.finishEta` — mixes
  Directions and Matrix sources, inconsistent. (c) keep local recompute for the suggested
  baseline only — still reads `routingInput`, defeats the ToS migration.

## R2 — Debounce + out-of-order protection

- **Decision**: Debounce the *draft order* fed into the React Query key by 400 ms
  (`useDebouncedValue`). React Query keyed on `(date, version, orderKey)` dedupes identical
  orders and, because the view renders only the data for the *current* key, a superseded
  in-flight request can never render out of order. `keepPreviousData` avoids a flash to empty
  between keys.
- **Rationale**: Matches the plan note's "debounce 400 ms" and the 30/min server budget. Query
  keying gives cancellation-by-irrelevance without manual request-id bookkeeping.
- **Alternatives rejected**: manual `AbortController` + request-id guard — more code, React
  Query already discards non-current keys.

## R3 — Started-day 422 (DAY_PLAN_ALREADY_STARTED) from preview

- **Decision**: Treat a 422 `DAY_PLAN_ALREADY_STARTED` from the preview as "live times
  unavailable for a started day": keep the reorder list usable, hide the delta, and let Save
  follow its normal rules (PUT may still accept a not-started-tail reorder). Report the
  preview/save asymmetry to the coordinator; do not change the backend.
- **Rationale**: PR-A's preview rejects any started day on today, but `PUT …/order` has no such
  guard, so Save still works. Degrading the preview (not the controls/Save) is non-regressing
  and stays inside PWA scope.
- **Alternatives rejected**: disabling reorder entirely once started — contradicts DB11's
  live-derived reorderable tail and would need a product decision; editing the backend preview
  guard — out of scope (Pillar's PR).

## R4 — Offline / 429 / provider-error degradation

- **Decision**: On offline (`useIsOnline` false) or a preview error, keep the last good preview
  when the order is unchanged; otherwise show a neutral "Route times are updating…"/"unavailable
  offline" state and never present guessed numbers as final. Save's offline disable is unchanged.
- **Rationale**: The preview is now a network dependency; the UI must not fabricate ETAs. Save
  already blocks offline, so correctness of saved data is unaffected.

## R5 — Accessibility with async results

- **Decision**: Announce the new position synchronously on each move ("Stop moved to position N
  of M."), then a second polite announcement with finish/delta when the preview resolves
  ("Finish ~10:47 am, +12 min vs. suggested."). Keyboard dnd-kit announcements unchanged.
- **Rationale**: Finish/delta are no longer known synchronously; a two-step announcement is the
  honest and still-usable pattern.

## R6 — Bundle impact

- **Decision**: After removing `evaluateSequence`/`toOptimizerInput`/`buildLegOverrides` from
  the reorder path, re-measure entry vs. lazy chunk gzip sizes (per the spec's bundle check) and
  record them in the PR. Leave the `@properfy/shared/route-planning` subpath export in place if
  any consumer still imports it; remove the PWA import only.
- **Rationale**: The import that justified the subpath (reorder) is going away; confirm the entry
  chunk does not grow and the optimizer no longer ships to the client at all.
