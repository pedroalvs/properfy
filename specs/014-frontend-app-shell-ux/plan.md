# Implementation Plan: Frontend App Shell & UX Patterns

**Branch**: `014-frontend-app-shell-ux` | **Date**: 2026-04-08 | **Spec**: [`spec.md`](./spec.md)

**Note**: Phase 1 is fully implemented. The shell, DataTable, DrawerPanel, FilterBar, Snackbar, Dialogs, PageTemplates, role-based routing — all production-quality with 220+ component tests. This plan covers only the Phase 2 gap closure.

## Summary

The frontend app shell and UX pattern library is 95% complete. The remaining work is 8 gaps, of which only GAP-001 (map integration) has significant code impact. The rest are low-to-medium polish items.

## Technical Context

**Language/Version**: TypeScript 5.6 on React 18.3 + Vite 5.4
**Primary Dependencies**: React Router 6 (data router), TanStack React Query 5, Tailwind CSS 3.4, mapbox-gl 3.20, openapi-fetch
**Testing**: Vitest + @testing-library/react (220+ test files, component-level with mocked API)
**Target Platform**: Desktop-first SPA, mobile functional
**Project Type**: Monorepo web workspace (`apps/web`)
**Constraints**: No Playwright E2E yet. Maps require `VITE_MAPBOX_TOKEN` env. API types from `@properfy/shared`.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | N/A | Frontend — not applicable |
| II. Multi-Tenant Safety | PASS | ProtectedRoute + AuthGuard enforce role-based routing. Nav items filtered by role. |
| III. Test-Driven Development | PASS | 220+ component tests. Every shared component has tests. |
| IV. Contract-First APIs | PASS | `openapi-fetch` + `@properfy/shared` schemas. |
| V. Simplicity & Minimal Impact | PASS | Tailwind utility-first. No speculative abstractions. |

## Project Structure

```text
apps/web/src/
├── app/                         # Router, guards, error boundary
│   ├── router.tsx               # Route tree with lazy loading + lazyRetry()
│   ├── AuthGuard.tsx            # Role-based authorization
│   └── ProtectedRoute.tsx       # Authentication check
├── components/
│   ├── shell/                   # AppShell, Sidebar, MobileDrawer, SidebarItem, SidebarSubmenu
│   ├── ui/                      # DrawerPanel, Dialog, ConfirmDialog, Button, StatusChip
│   ├── data/                    # DataTable, RowActions, EntityListCard, TableSwitch
│   ├── filters/                 # FilterBar, FilterInput, FilterSelect, FilterAutocomplete, FilterDateRange, FilterBoolean
│   ├── feedback/                # Snackbar, EmptyState, ErrorState, LoadingState, InfoBanner
│   ├── layout/                  # PageHeader, TabsNav, ListFilterTableTemplate, TabsContentTemplate, GroupedListTemplate
│   └── map/                     # MapScreenLayout, MapContainer (PLACEHOLDER), MapMarker, MapPopup, MapFiltersPanel
├── features/                    # 20+ feature directories (pages + feature-local components)
├── hooks/                       # useAuth, useSnackbar, useApiQuery, useFormOptions
└── styles/                      # tokens.css (design token CSS custom properties)
```

## Current State: What's Already Built

| Category | Status | Components |
|----------|--------|------------|
| App Shell | COMPLETE | AppShell, Sidebar, MobileDrawer, SidebarItem, SidebarSubmenu, SidebarUser |
| Route Guards | COMPLETE | ProtectedRoute, AuthGuard, lazyRetry() |
| DataTable | COMPLETE | Generic typed columns, sorting, pagination (10/20/50), skeleton/error/empty states, mobile cards |
| Filters | COMPLETE | FilterBar (responsive grid), FilterInput (300ms debounce), FilterSelect, FilterAutocomplete, FilterDateRange, FilterBoolean |
| Drawers | COMPLETE | DrawerPanel (narrow 480px / wide 970px), DrawerHeader, backdrop + Escape close |
| Feedback | COMPLETE | Snackbar (success/error/info, auto-dismiss 5s, stack), ConfirmDialog (centered, loading), EmptyState, ErrorState |
| Page Templates | COMPLETE | ListFilterTableTemplate, TabsContentTemplate, GroupedListTemplate, MapScreenLayout |
| Map | PLACEHOLDER | MapScreenLayout works. MapContainer renders gray box. MapMarker/MapPopup exist but untested against real map. |

## Execution Strategy

### Phase 2 — Gap Closure

#### Wave 1: Map Integration (serial — highest impact, blocks 016)

| Gap | Impact | Work |
|-----|--------|------|
| GAP-001 | H | Replace `MapContainer` placeholder with real `mapbox-gl` initialization. Wire `MapMarker`/`MapPopup` to Mapbox event system. Configure `VITE_MAPBOX_TOKEN` from env. Enable the 3 map route redirects (`/appointments/map`, `/properties/map`, `/service-groups/map`). Add tests for map init and cleanup. |

#### Wave 2: UX Compliance (parallel)

| Gap | Impact | Work |
|-----|--------|------|
| GAP-003 | M | Create `useUrlFilters` shared hook using React Router `useSearchParams`. Migrate 3-5 key list pages (appointments, properties, inspectors) as pattern examples. |
| GAP-006 | M | Create `NoPermissionState` and `FilterRequiredState` components. Add to DataTable as additional state variants. Audit 5 key screens for completeness. |

#### Wave 3: Low-Impact Polish (parallel)

| Gap | Impact | Work |
|-----|--------|------|
| GAP-005 | L | Add optional `loading?: boolean` prop to `FilterBar`. Render inline spinner when true. |
| GAP-007 | L | Add `isMapPage` context or route check to Sidebar. Apply `bg-[#F5F5F5]` on map routes. |
| GAP-008 | L | Create `FloatingTotalBar` component for financial page. Gradient animated bottom bar. |

#### Deferred

| Gap | Reason |
|-----|--------|
| GAP-002 (Board/Kanban) | Explicitly out of scope per `frontend-decisoes-finais.md` |
| GAP-004 (TableSwitch) | Component exists and works. Per-page wiring pattern is acceptable. |

### Parallelization Summary

```
Wave 1:  GAP-001 (serial — map integration, blocks 016)

Wave 2:  GAP-003 ══╗
         GAP-006 ══╝ (parallel)

Wave 3:  GAP-005 ══╗
         GAP-007 ══╬══ (parallel)
         GAP-008 ══╝
```

### Implementation Checkpoints

#### Wave 1 Complete
- [ ] MapContainer renders a real Mapbox map with tiles
- [ ] Map routes no longer redirect to list pages
- [ ] MapMarker/MapPopup respond to real map events
- [ ] `VITE_MAPBOX_TOKEN` documented in `.env.example`

#### Wave 2 Complete
- [ ] `useUrlFilters` hook works on 3+ list pages
- [ ] NoPermissionState and FilterRequiredState components exist with tests
- [ ] 5 key screens implement all 5 mandatory states

#### Wave 3 Complete
- [ ] FilterBar shows spinner when loading
- [ ] Sidebar background changes on map routes
- [ ] FloatingTotalBar renders on financial page

## Cross-Feature Dependencies

- **GAP-001** (map) → blocks `016-geospatial-map-experiences`
- **GAP-003** (URL filters) → improves all list page UX, no blocker
- **GAP-006** (5 states) → dossier compliance, no blocker

## Security & Operational Notes

- `VITE_MAPBOX_TOKEN` must NOT be committed. Use `.env.local` or deploy-time injection.
- Map tiles are loaded client-side from Mapbox CDN. No server-side proxy.
- Snackbar never shows raw JSON — caller-level enforcement, no global sanitizer.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `lazyRetry()` on route chunks | Handles stale deploys where chunk hashes don't match | Plain `lazy()` fails silently on stale chunks |
| Imperative mapbox-gl init | mapbox-gl requires DOM manipulation, not declarative React rendering | react-map-gl adds dependency layer with version coupling risk |
| Local filter state (no shared hook) | Each page has unique filter combinations | Generic hook would be over-abstract for current scale |

## Notes

- This is a **frontend-only** spec. No backend changes needed.
- All frontend tests run via `pnpm --filter web test`.
- The web workspace uses `apps/web/CLAUDE.md` for coding conventions.
- Design tokens (colors, spacing, typography) are in `apps/web/src/styles/tokens.css` — this spec does not redefine them.
