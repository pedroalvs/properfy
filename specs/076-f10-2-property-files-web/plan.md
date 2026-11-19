# Implementation Plan: Property Files & Issues — Web (F10-2)

**Branch**: `076-f10-2-property-files-web` | **Date**: 2026-11-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/076-f10-2-property-files-web/spec.md`

## Summary

Deliver the web UI for property files & issues by consuming the already-merged F10-1 backend + shared contract (PR #1351, `develop` @ `ebf1b8e7`). One reusable `PropertyFilesPanel` (Files tab → Issues/Documents/Reports/Other subtabs) is mounted on both appointment and property detail; authorized roles upload/version/delete files and create/mark-seen/delete issues; unseen issues drive a sidebar dot, a row border and a "With issues" list filter; and a Platform settings "Files" section edits the `propertyFiles` key. No backend/schema/`api-types.ts` change and no `pnpm generate:api` (TASK-F10-4 owns the next contract regen). Approach: reuse the existing typed client (`services/api.ts` + `hooks/useApiQuery.ts`), the presign→PUT→confirm pattern (`useInspectorDocumentUpload`), the generic `usePlatformSetting` hook (F03-4), the `TabsNav`/`FilterSegmented`/`DrawerPanel`/`ConfirmDialog`/`FilterBoolean`/`FilterInput` primitives, and add two small additive primitives (`SidebarItemBadge`, `DataTable.rowClassName`).

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; React 18 + Vite 5  
**Primary Dependencies**: React Router 6, TanStack Query 5, Tailwind 3, `openapi-fetch` typed by `@properfy/shared` `paths`, `@properfy/frontend-standards` (`cn`)  
**Storage**: N/A in the web layer — files live in Supabase Storage via backend signed URLs (presign/confirm/download). Per-viewer UI prefs only (none needed here).  
**Testing**: Vitest + React Testing Library (unit/component, co-located); Playwright (hermetic E2E, all API stubbed, Chromium) — CI gate `test-web-e2e`  
**Target Platform**: Modern browsers; responsive to phone width  
**Project Type**: Web SPA (`apps/web`) in a pnpm + Turborepo monorepo  
**Performance Goals**: Unseen-count query `staleTime` ≈ 60 s (runs shell-wide); no per-screen refetch storm; derived hook values referentially stable  
**Constraints**: No backend/schema/`api-types.ts` change; no `pnpm generate:api`; additive-only shared-component changes; dashboards frozen; English only; `jsx-a11y` lint `--max-warnings 0`  
**Scale/Scope**: ~1 reusable panel + subcomponents, 2 detail integrations, 2 list integrations, 1 sidebar primitive + wiring, 1 platform-settings section; well under the 150-file PR cap

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| I. Clean Architecture | N/A to the frontend layer; the web follows the mandated `features/<domain>/{components,hooks,pages,types}` structure and keeps business logic out of pages. **PASS** |
| II. Multi-Tenant Safety | No new tenant-scoped query is introduced in the web layer. Isolation (cross-tenant → **404**), INSP T-1 visibility and CL_USER read-only are enforced by the F10-1 backend; the web only renders the contract and gates actions by the shared role-matrix (`usePermissions`). No raw ids/coords rendered. **PASS** |
| III. TDD | Red→green per PR; Vitest/RTL unit+component and hermetic Playwright E2E, mirroring F03-4/F09-2 precedents. **PASS** |
| IV. Contract-First | Consumes the generated `api-types.ts` `paths` as the single source of truth; adds no contract change and does not regenerate. **PASS** |
| V. Simplicity & Minimal Impact | Reuses existing primitives/hooks/upload flow; the only new shared code is the additive `SidebarItemBadge` and `DataTable.rowClassName` (both optional, no behaviour change to existing call sites). No speculative abstraction. **PASS** |

**Result: PASS — no violations.** Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/076-f10-2-property-files-web/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (consumed contract shapes + UI view-models)
├── quickstart.md        # Phase 1 output (how to run/verify)
├── contracts/
│   └── ui-contract.md   # Phase 1 output (routes consumed, query keys, component props)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/web/src/
├── features/
│   ├── property-files/                 # NEW feature folder (the reusable panel + hooks)
│   │   ├── components/
│   │   │   ├── PropertyFilesPanel.tsx          # Files tab + subtabs host (appointment + property)
│   │   │   ├── FileSubtabList.tsx              # Document/Report/Other list + search + upload
│   │   │   ├── PropertyFileCard.tsx            # single file card (preview/PDF/download/version/delete)
│   │   │   ├── IssueSubtab.tsx                 # Issues list + "Report issue"
│   │   │   ├── PropertyIssueCard.tsx           # issue card (origin badge, photos, seen/mark-seen)
│   │   │   ├── CreateIssueDrawer.tsx           # reason + photo-by-photo upload drawer
│   │   │   ├── FileVersionsDrawer.tsx          # "Versions" drawer
│   │   │   └── UploadFileControl.tsx           # hidden input + presign→PUT→confirm trigger
│   │   ├── hooks/
│   │   │   ├── usePropertyFiles.ts             # GET /v1/property-files (by property/appointment, type)
│   │   │   ├── usePropertyIssues.ts            # GET /v1/property-issues
│   │   │   ├── usePropertyFileUpload.ts        # presign → PUT → confirm (mirrors useInspectorDocumentUpload)
│   │   │   ├── useCreatePropertyIssue.ts       # photo-by-photo + POST /v1/property-issues (Idempotency-Key)
│   │   │   ├── useMarkIssueSeen.ts             # POST /:id/seen (invalidates lists + unseen-count)
│   │   │   ├── useDeletePropertyFile.ts        # DELETE /v1/property-files/:id
│   │   │   ├── useDeletePropertyIssue.ts       # DELETE /v1/property-issues/:id
│   │   │   ├── useAddFileVersion.ts            # POST /:id/versions → presign → PUT → confirm
│   │   │   ├── useDownloadPropertyFile.ts      # GET /:id/download (5-min URL)
│   │   │   └── useUnseenIssueCount.ts          # GET /v1/property-issues/unseen-count (staleTime 60s, gated)
│   │   ├── lib/
│   │   │   ├── file-type.ts                    # subtab ↔ PropertyFileType map, mime/preview helpers
│   │   │   └── issue-format.ts                 # source label, seen-status text (Sydney date helpers)
│   │   ├── types/index.ts
│   │   └── index.ts
│   └── platform-settings/
│       └── components/PropertyFilesSettingsSection.tsx   # NEW section (usePlatformSetting('propertyFiles'))
├── components/
│   ├── shell/
│   │   ├── Sidebar.tsx / SidebarItem.tsx       # add optional `badge`; wrap icon; wire unseen-count
│   │   └── SidebarItemBadge.tsx                # NEW additive primitive (yellow dot + aria-label)
│   └── data/DataTable.tsx                      # add optional `rowClassName?: (row) => string | undefined`
├── features/appointments/
│   ├── pages/AppointmentDetailPage.tsx         # add FILES_TAB after Portal Activity (gated)
│   ├── components/AppointmentTable.tsx         # rowClassName for hasUnseenIssues border
│   ├── components/AppointmentFilters.tsx       # "With issues" FilterBoolean
│   ├── hooks/useAppointmentList.ts             # withIssues in schema + params builder
│   └── types/index.ts                          # hasUnseenIssues?/fileCounts? on Appointment
├── features/properties/
│   ├── pages/PropertyDetailPage.tsx            # add Files tab after Appointments (gated)
│   ├── components/PropertyTable.tsx            # rowClassName for hasUnseenIssues border
│   ├── components/PropertyFilters.tsx          # "With issues" FilterBoolean
│   ├── hooks/usePropertyList.ts                # withIssues in schema + params builder
│   └── types/index.ts                          # hasUnseenIssues?/fileCounts? on Property
└── apps/web/CLAUDE.md                          # record feature + new primitives (PR step)

apps/web/tests/e2e/
├── property-files.spec.ts                      # NEW hermetic spec (border/dot/mark-seen, property↔appointment)
├── helpers.ts                                  # add default unseen-count + file/issue list stubs
├── platform-settings.spec.ts                   # add propertyFiles stub
└── route-weights.spec.ts                       # add propertyFiles stub (shares the settings page)
```

**Structure Decision**: New `apps/web/src/features/property-files/` owns the reusable panel and all F10 hooks; the appointment/property/platform-settings features and the two shell/data primitives receive additive edits only. This keeps the panel reusable across both detail surfaces (the plan's single-component requirement) and confines shared-component churn to two optional props.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
