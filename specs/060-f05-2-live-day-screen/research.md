# Phase 0 Research: Live Day screen (web)

All items are resolved; there is no open `NEEDS CLARIFICATION`. This file records the technical decisions that shape the design, with rationale and the alternatives rejected.

## D-R1 · Polling with TanStack Query

- **Decision**: `useQuery` with `refetchInterval: isLive ? 30_000 : false`, `refetchIntervalInBackground: false`, `placeholderData: keepPreviousData`.
- **Rationale**: Matches D3; the PWA precedent `features/offers/hooks/useMarketplaceOffers.ts:33-34` uses the same shape. `keepPreviousData` avoids the list/route flickering on selection/mode changes and polls. Tab-hidden pause is free with `refetchIntervalInBackground: false`.
- **Alternatives rejected**: WebSocket/SSE (no infra; D3 explicitly rules it out); manual `setInterval` (loses Query dedupe, focus pause and `dataUpdatedAt`).

## D-R2 · `geometryMode` in the query key (D18)

- **Decision**: `queryKey ['live-day', date, geometryMode, selectedId]`; `geometryMode = all | selected | none` derived from `showAll`/selection; send `includeGeometry` and `inspectorId` only when relevant.
- **Rationale**: The 30 s poll must never carry geometry the screen does not draw (D18). Keying on mode + inspector makes React Query cache/refetch correctly and `keepPreviousData` keeps the prior route visible until the new one resolves.
- **Alternatives rejected**: Always `includeGeometry=all` (payload blow-up; hits the server 60-route guard); geometry in a separate query (duplicates the roster round-trip).

## D-R3 · `isLive = date >= data.today` (server today)

- **Decision**: Compute `isLive` from the server's `today` field: `date >= today`. Before the first response, `isLive = true`.
- **Rationale**: The response exposes both `today` and `isToday`, but tomorrow must also poll, so `isToday` alone is insufficient. The browser clock is never trusted for business "today" (L-F05-05; memory: Sydney-only timezone).
- **Alternatives rejected**: `isToday` (excludes tomorrow); browser `new Date()` (clock-skew bug).

## D-R4 · `RouteLayer` — the web's first line layer

- **Decision**: New `components/map/RouteLayer.tsx` porting the PWA `useOfferRoute` idempotent pattern (`getSource` before `addSource`, `setData` on update, cleanup on unmount, re-add on map recreation). Two line layers filtered by `properties.approximate` (solid vs dashed `[1.5,1.5]`), inserted `beforeId` the first `symbol` layer. Comma-form HSL only in paint (`inspectorRouteColor(id).mapbox`).
- **Rationale**: Web has no line layer yet; the PWA pattern is proven. Space-form `hsl(a b c)` silently breaks the whole Mapbox style (#1302), so the component rejects it and the test pins the format.
- **Alternatives rejected**: Importing the PWA hook (web must not import PWA); a single layer toggling dasharray (cleaner to filter two layers by the per-feature `approximate` flag the `dayPlanGeometrySchema` already carries).
- **Note**: Because F04 serves straight-line geometry only (Plan B), `routeApproximate` is always true today and every feature is `approximate`. The dual-layer design still implements the solid path so it is correct if real road geometry is ever served.

## D-R5 · Per-inspector colour and state encoding

- **Decision**: Colour from shared `inspectorRouteColor(inspectorId) → { mapbox, hex, index }` (stable FNV-1a hash). Use `mapbox` only in paint, `hex` only in CSS (dot, pin border, legend). **State** is encoded in pin head colour + MDI icon + text — never the inspector colour.
- **Rationale**: One source of truth for the colour across dot, line and legend (contract item 1). Keeping the two meanings (state vs identity) on different channels avoids colour overload and meets WCAG 1.4.1 (D6, L-F05-12).
- **Alternatives rejected**: A per-day colour allocation (would break the "stable colour" decision and the cross-product consistency).

## D-R6 · `computeMarkerOffsets` extraction

- **Decision**: Move `computeMarkerOffsets` to `components/map/marker-offsets.ts` (content unchanged); `AppointmentMapPage` swaps its import; `components/map/index.ts` re-exports it.
- **Rationale**: Importing it from a page would pull that page's chunk into the lazy Live Day chunk. Extraction is import-only (no behaviour change), so `AppointmentMapPage.test.tsx` stays green.
- **Alternatives rejected**: Duplicating the function (dead-code / drift risk).

## D-R7 · `MapScreenLayout` `storageKey` + collapsible mobile (L-F05-04)

- **Decision**: Add `storageKey?: string` (default `'appointments-map.filter-panel.width'`, so `/map` is untouched) and a collapsible mobile mode below `md` (768 px): bottom-anchored full-width panel, 16 px gutter, `max-h-[50dvh]` internal scroll, "Map / List" button (`aria-expanded`). `/map` inherits the mobile mode; Live Day uses `storageKey 'live-day.panel.width'`.
- **Rationale**: Today the panel is a fixed floating card at every width (no mobile stacking, verified). The shared component is the right place so `/map` and Live Day behave identically on phones. The default preserves the saved width for existing `/map` users.
- **Alternatives rejected**: A Live-Day-only layout (would fork the map chrome and leave `/map` broken on phones).
- **Risk**: `/map` is shared — QA `/map` on desktop (saved width) and at 375 px (lasso + filters) before the PR.

## D-R8 · Frozen list order during interaction (L-F05-08)

- **Decision**: `useFrozenOrder` holds the last computed order while a pointer is over the list or focus is inside it, releasing on the first interaction-free render, on filter/date change, and on unmount.
- **Rationale**: A poll must not reshuffle rows under the Operator's cursor/focus (L-F05-08). Releasing on filter/date change and unmount prevents a stuck-frozen order if `pointerleave`/`focusout` never fires.
- **Alternatives rejected**: Sorting only on explicit refresh (loses live reordering value); never freezing (rows jump under the cursor).

## D-R9 · Menu placement (X01 / L-X01-03)

- **Decision**: Insert the "Live Day" child between "Overview" and "Inspector notices" in the Dashboard submenu. Menu tests assert by label and relative position, never absolute index/count; the roles test uses the real `SidebarSubmenu`/`SidebarItem` (no mocks, L-X01-02).
- **Rationale**: Canonical X01 order (Overview · Live Day · Inspector notices · Analytics · Workload), already documented in `Sidebar.tsx`. "Inspector notices" (F02-2) is already merged, so Live Day slots before it.
- **Alternatives rejected**: After Workload (contradicts L-X01-03); index-based tests (brittle as other features add children).

## D-R10 · Testing approach

- **Decision**: Vitest + Testing Library with the existing `mapbox-gl` mock (as in `MapContainer`/`MapMarker` tests) and the `api` client mocked; fake timers for polling and "Updated N s ago"; a11y asserted via explicit ARIA/keyboard invariants (no axe engine). No new Playwright E2E (manual browser QA per the spec; the web E2E gate is unaffected since no stubbed route table changes).
- **Rationale**: The feature is pure client logic over a mocked contract; component + selector unit tests cover the acceptance scenarios (01.A4 via a sequence of mocked responses, 01.A5 via per-type copy). The repo has no axe tooling and prior analogous web features (F02-2, F03-4, F09-2) shipped without it, so asserting the concrete ARIA/keyboard invariants (progressbar roles, `aria-pressed`, `aria-current`, focus order, colour-not-alone) is both faithful to the a11y bar and consistent with precedent, without adding a workspace dependency. Memory notes applied: `findBy` × polling rerender → fake clock + `waitFor` final assertion; `jsdom localStorage` unreliable → guard `MapScreenLayout` width tests.
- **Alternatives rejected**: adding `vitest-axe`/`jest-axe` (no repo precedent; a workspace-wide test dependency disproportionate to one screen, and jsdom+axe is flakier than targeted ARIA assertions); E2E for the whole screen (slower, and the stubbed-route hermetic suite is out of scope for this task).
