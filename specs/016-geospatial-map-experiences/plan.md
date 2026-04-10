# Implementation Plan: Geospatial Map Experiences

**Branch**: `015-permissions-rbac-matrix` (implementing 016 on current branch) | **Date**: 2026-04-10 | **Spec**: `specs/016-geospatial-map-experiences/spec.md`
**Input**: Feature specification from `/specs/016-geospatial-map-experiences/spec.md`

## Summary

Close the remaining gaps in the shared map foundation so all point-based map pages (appointments, properties, service groups) are fully functional. The spec overstates several gaps — exploration shows MapContainer already has real Mapbox GL integration, routes are enabled, and status color maps are centralized. The actual remaining work is: (1) backend appointment coordinates exposure, (2) auto-fit bounds to visible pins, (3) pin clustering for dense areas. This plan is surgical and reuses the 013/014/015 foundations.

## Technical Context

**Language/Version**: TypeScript 5.6 on React 18.3 (frontend), TypeScript 5.x on Node.js 20 (backend)
**Primary Dependencies**: Mapbox GL JS 3.x (already installed), Fastify, Prisma ORM, Zod
**Storage**: PostgreSQL (Supabase) — `properties.lat`/`properties.lng` (Decimal 10,7), existing columns; no schema changes
**Testing**: Vitest (unit), Supertest (backend integration), React Testing Library (frontend unit)
**Target Platform**: Modern browsers (Chrome, Firefox, Safari, Edge) + mobile web
**Project Type**: Cross-cutting map foundation enhancement
**Constraints**: Must not break existing RegionMap (production-ready), must reuse MapContainer and shared components, must not introduce new API endpoints
**Scale/Scope**: 3 map pages (appointments, properties, service groups), ~200 pins per page, bounding-box calculation from client-side data

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Clean Architecture | PASS | Backend changes stay in infrastructure/application layers. No domain pollution. |
| II. Multi-Tenant Safety | PASS | Appointment coordinate exposure inherits existing tenant scoping from `findAll()`. No new cross-tenant surface. |
| III. Test-Driven Development | PASS | Backend change has existing integration test coverage; frontend changes are additive with unit tests. |
| IV. Contract-First APIs | PASS | `appointmentResponseSchema` update in `packages/shared` is the source of truth; backend and frontend consume it. |
| V. Simplicity and Minimal Impact | PASS | Surgical fixes — no new components, no new API endpoints, no new dependencies. Reuses MapContainer, MapMarker, MapPopup. |
| Knowledge Classification | PASS | Spec clearly labels IMPLEMENTED, APPROVED, GAP. Implementation only closes GAPs. |

**Post-Phase 1 re-check**: PASS — design closes 3 concrete gaps without architectural deviation.

## Project Structure

### Documentation (this feature)

```text
specs/016-geospatial-map-experiences/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── map-data-contract.md
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
└── schemas/
    └── responses.ts            # MODIFY — add latitude/longitude to appointmentResponseSchema

apps/backend/src/modules/appointment/
├── infrastructure/
│   └── prisma-appointment.repository.ts    # MODIFY — findAll() to select property lat/lng
├── application/use-cases/
│   └── list-appointments.use-case.ts       # MODIFY — map property coords into output
└── interfaces/
    └── appointment.routes.ts               # Already returns full entity; no change

apps/web/src/
├── components/map/
│   └── MapContainer.tsx                    # Review — already exposes onMapReady; may need small API extension
├── features/appointments/pages/
│   └── AppointmentMapPage.tsx              # MODIFY — compute bounds, fit map after load
├── features/properties/pages/
│   └── PropertyMapPage.tsx                 # MODIFY — compute bounds
├── features/service-groups/pages/
│   └── ServiceGroupMapPage.tsx             # MODIFY — compute bounds
└── lib/
    └── map-bounds.ts                       # NEW — small utility: compute LngLatBounds from coordinates array
```

**Structure Decision**: Cross-cutting enhancement. No new modules. Changes are concentrated in 3 areas:
1. Shared schemas (appointment response)
2. Backend appointment module (2 files)
3. Frontend map components/pages (4 files + 1 utility)

## Complexity Tracking

No constitution violations. No complexity justifications needed.
