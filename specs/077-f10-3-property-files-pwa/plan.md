# Implementation Plan: PWA — Property Files, Report Issue & Photos on "Can't do this job"

**Branch**: `077-f10-3-property-files-pwa` | **Date**: 2026-11-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/077-f10-3-property-files-pwa/spec.md`

## Summary

Add to the inspector PWA a read-only **Files** section in the service detail (type subtabs Issues/Documents/Reports/Other, download), a **"Report issue"** flow (reason + per-photo upload), and **optional photos** on the existing **"Can't do this job"** sheet that auto-create an issue. This is a pure **consumer** of the already-merged F10-1 backend/shared contract (`develop` @ `ebf1b8e7`): no backend, Prisma, migration, `openapi.json` or `api-types.ts` change (only TASK-F10-4 regenerates `api-types.ts`, per D19). The slice reuses the existing presign → PUT → confirm upload pattern (`AvatarUploader` precedent), the `Idempotency-Key` helper, the `Sheet`/`Segmented` primitives, and React Query.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; React 18; Vite 5
**Primary Dependencies**: React, TanStack Query 5, `openapi-fetch` (typed by `@properfy/shared` `paths`), React Hook Form + Zod, `@properfy/shared`, `@properfy/frontend-standards` (`cn`/CVA/tokens), `@radix-ui/react-dialog` (via `Sheet`), `lucide-react`. **No new runtime dependency.**
**Storage**: N/A on the client. Issue photos are PUT to a Supabase signed URL returned by the backend presign; all persistence is backend-owned (F10-1).
**Testing**: Vitest (unit/component, mock camera/file + presign/confirm/create); Playwright E2E (`tests/e2e`, hermetic, Chromium + WebKit) — a CI gate (`test-pwa-e2e`).
**Target Platform**: Mobile PWA — iOS Safari (WebKit), Android Chrome, tablet (iPad/foldable wide layout).
**Project Type**: Mobile PWA (`apps/pwa`), consumer of the backend REST contract.
**Performance Goals**: photos upload one at a time with per-photo progress (mobile-data friendly, D12); derived query data memoized (PWA CLAUDE.md §11.11 — no render-loop regression).
**Constraints**: online-only (no offline queue, no auto-retry — D12/task); **no** backend/schema/`api-types` change (FR-020); ≤150 files/PR; `pnpm --filter pwa check:ds` (design-system guard) must pass; all user-facing text English.
**Scale/Scope**: one new `features/property-files/` folder (components + hooks + pure libs + tests), a new section mounted in `AppointmentDetailPage`, additive changes to `CantDoSheet` + `useReportCantDo`, and one E2E spec. Expected well under 150 files.

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.4.0.*

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | ✅ PASS | Backend concern; this slice touches only `apps/pwa`. Follows the PWA feature-folder convention (components/hooks/lib), pure logic isolated in `lib/` for unit tests. |
| II. Multi-Tenant Safety | ✅ PASS | No new scope decision. The backend enforces tenant/INSP-visibility (D28) and returns 404 for out-of-scope resources (C.A2); the PWA passes the mandatory `appointmentId` and surfaces the backend's result. No raw coordinates or peer identity exposed (backend masks `uploadedByUserId`/`createdByUserId`). |
| III. TDD | ✅ PASS | Red→green→refactor. Vitest for the per-photo upload state machine, the issue-create orchestration, the cant-do→issue linking, and components; Playwright E2E for the two acceptance flows on Chromium + WebKit. |
| IV. Contract-First APIs | ✅ PASS | Consumes the committed OpenAPI/`api-types.ts` unchanged. No contract edit (FR-020). Reuses shared Zod types/enums from `@properfy/shared`. |
| V. Simplicity & Minimal Impact | ✅ PASS | Reuses `Sheet`, `Segmented`, the `AvatarUploader` presign/PUT/confirm pattern, `getOrCreateIdempotencyKey`/`generateIdempotencyKey`, React Query. No new dependency, no speculative abstraction. `CantDoSheet`/`useReportCantDo` changed additively. |

**Branching note (not a deviation):** the constitution's "develop on `staging`" predates the current workflow; root `CLAUDE.md` §12 (authoritative, and session instructions) sets PRs → `develop`. This PR targets `develop`.

No violations → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/077-f10-3-property-files-pwa/
├── spec.md              # /speckit.specify output (done)
├── plan.md              # this file
├── research.md          # Phase 0 — UX/engineering decisions
├── data-model.md        # Phase 1 — consumed DTOs + client upload state machine
├── contracts/
│   └── consumed-endpoints.md   # the 6 F10-1 routes this slice calls (read-only reference)
├── quickstart.md        # Phase 1 — how to run & test the slice
└── tasks.md             # /speckit.tasks output (next step)
```

### Source Code (repository root) — `apps/pwa` only

```text
apps/pwa/src/
├── features/
│   ├── property-files/                      # NEW feature folder
│   │   ├── components/
│   │   │   ├── PropertyFilesSection.tsx     # the Files section (Segmented subtabs) mounted in the appointment detail
│   │   │   ├── IssueList.tsx                 # Issues subtab list + "Report issue" button
│   │   │   ├── IssueCard.tsx                 # one issue (reason/origin badge/date + photo thumbnails + download; author masked for INSP, no seen-status)
│   │   │   ├── FileList.tsx                  # Documents/Reports/Other list rows (download / PDF new tab / image preview)
│   │   │   ├── ReportIssueSheet.tsx          # reason + PhotoPicker, submit → create issue
│   │   │   ├── PhotoPicker.tsx               # reusable per-photo picker + progress/error list (shared by ReportIssueSheet + CantDoSheet)
│   │   │   └── __tests__/
│   │   ├── hooks/
│   │   │   ├── usePropertyFiles.ts           # GET /v1/property-files?appointmentId= (React Query)
│   │   │   ├── usePropertyIssues.ts          # GET /v1/property-issues?appointmentId=
│   │   │   ├── useIssuePhotoUpload.ts        # per-photo presign→PUT→confirm state machine
│   │   │   ├── useCreatePropertyIssue.ts     # POST /v1/property-issues (+ Idempotency-Key), invalidates issues/files/detail
│   │   │   ├── useFileDownload.ts            # GET /v1/property-files/:id/download → open signed URL
│   │   │   └── __tests__/
│   │   └── lib/
│   │       ├── property-file-view.ts         # pure: group/sort files by type, counts, "No photos"/"Photo removed" labels, preview-kind
│   │       ├── issue-photo-validation.ts     # pure: accept-hint + soft client guard from DEFAULT_PROPERTY_FILES_SETTING
│   │       ├── property-file-error.ts        # pure: map ApiError (503/404/409/413/bad-type) → user message (FILE_STORAGE_UNAVAILABLE_MESSAGE)
│   │       └── __tests__/
│   └── field-events/                         # MODIFIED (F03-3)
│       ├── components/CantDoSheet.tsx        # add optional PhotoPicker section; on submit → cant-do then create-issue (D18)
│       └── hooks/useReportCantDo.ts          # return CantDoResponse (eventId) instead of void
├── features/schedule/pages/
│   └── AppointmentDetailPage.tsx             # MODIFIED: mount <PropertyFilesSection appointmentId propertyId/>
└── tests/e2e/
    └── property-files.spec.ts                # NEW hermetic E2E (Chromium + WebKit): report-issue + cant-do-with-photo
```

**Structure Decision**: a self-contained `features/property-files/` folder (mobile-first PWA convention) with pure logic in `lib/` for cheap unit tests, consumed by the detail page. `PhotoPicker` + `useIssuePhotoUpload` are shared by both the Report-issue and Can't-do flows so the per-photo upload logic exists once. No nuclear PWA file (`router.tsx`, `BottomNavBar.tsx`, `sw.ts`) is touched — the Files section mounts inside an existing page, and file reads are **not** cached in the service worker (online-only), so no `INSPECTOR_API_CACHES`/`runtime-caching.ts` change.

## Complexity Tracking

> No constitution violations — no entries.
