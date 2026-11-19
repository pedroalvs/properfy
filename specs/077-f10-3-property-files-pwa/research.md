# Phase 0 — Research & Engineering Decisions

All decisions below are resolved; none remain as NEEDS CLARIFICATION. Each cites the F10 decision (D#), contract code (C.A#), or an existing codebase precedent it follows.

## D-R1 · Per-photo upload is a presign → PUT → confirm state machine

- **Decision**: Each photo goes through `POST /v1/property-files/presign {propertyId, appointmentId, type:'ISSUE', fileName, mime, sizeBytes}` → `PUT uploadUrl` (plain `fetch`, `Content-Type: <mime>`, raw `File` body) → `POST /v1/property-files/confirm {fileId}` with an `Idempotency-Key` header. The confirmed photo stays **PENDING** (the backend sets READY only when the issue is created), yielding a `fileId` the issue-create collects in `photoFileIds`.
- **Rationale**: Mirrors the merged F10-1 contract exactly (presign returns `{fileId, uploadUrl, storageKey, expiresAt}`; confirm takes `{fileId}` and keeps issue photos PENDING; create-issue atomically links + flips READY). Mirrors the existing PWA `AvatarUploader` precedent (`features/profile/components/AvatarUploader.tsx`) for presign→PUT→confirm.
- **Alternatives rejected**: a single multipart upload (no such endpoint; backend uses signed URLs); uploading through the typed `api` client (signed-URL PUT must bypass auth/middleware — use plain `fetch`, as `AvatarUploader` does).

## D-R2 · Photos upload on selection, not on submit (D12 + visibility ordering)

- **Decision**: As soon as the inspector picks a photo it begins uploading (presign→PUT→confirm) with its own progress row; the issue/decline is submitted only after the intended photos are confirmed (or the failed ones removed). One photo's failure never discards the already-confirmed ones.
- **Rationale**: D12 ("one photo at a time; a failure never loses confirmed photos; the issue is created only when all intended photos confirm or the user removes the failed ones"). It also fixes the **cant-do visibility ordering**: presigning an ISSUE photo requires inspector↔appointment visibility (D28); the appointment is still SCHEDULED/visible while the sheet is open, so photos must be uploaded *before* the cant-do REJECTED transition. Uploading on submit (after reject) would risk a 404 on presign.
- **Alternatives rejected**: batch-upload on submit (breaks per-photo failure isolation and the cant-do ordering).

## D-R3 · Idempotency-Key strategy

- **Decision**: The **create-issue** call and each **confirm** call carry an `Idempotency-Key` (D24). Pattern: a fresh key minted per attempt and held in a `useRef`, re-minted when the sheet opens — the `CantDoSheet` precedent (`idempotencyKey = useRef(generateIdempotencyKey())`, reset in the open `useEffect`). Confirm uses a per-`fileId` key (the backend hashes `{fileId, actor}`, so a retry of the same file is idempotent).
- **Rationale**: D24 (a mobile retry after timeout must not duplicate the issue or file). Matches `getOrCreateIdempotencyKey`/`generateIdempotencyKey` in `apps/pwa/src/lib/idempotency.ts` and how `useReportCantDo`/`useAcceptOffer` already pass `{'Idempotency-Key': key}` to `apiPost`/`api.POST`.

## D-R4 · The Files section mounts in the detail column (no new route, no tabs)

- **Decision**: A `<PropertyFilesSection appointmentId propertyId/>` is rendered as a new section in the existing single-column `AppointmentDetailPage` (`features/schedule/pages/AppointmentDetailPage.tsx`), near `JobDetailsSection`. Inside it, a `Segmented` control switches the type subtabs (Issues default → Documents → Reports → Other) with per-type counts from the list response `counts`.
- **Rationale**: The detail page is a vertical stack of `Card` sections with no tab pattern; adding a section matches the house convention. `Segmented` is the existing subtab primitive. No `router.tsx` change (a nuclear PWA file owned solely by track C — avoided to keep the PR narrow).
- **Alternatives rejected**: a dedicated `/schedule/:id/files` route (unnecessary; adds nuclear-file churn and a back-nav hop in the field).

## D-R5 · File/issue reads are online-only — no service-worker cache

- **Decision**: `usePropertyFiles`/`usePropertyIssues` are plain React Query reads with no SW runtime cache and no `INSPECTOR_API_CACHES` entry. Offline, the section shows a "You're offline. Connect to load files." state; it never serves stale file data. Only the route *schema* ships (as code), not responses.
- **Rationale**: Task/spec: "Precisa de conexão (sem fila offline); não entra no cache de dados do service worker, só o schema da rota." Avoids touching `src/sw/runtime-caching.ts` / `sw.ts` (nuclear files) and keeps today's offline guarantees unchanged.
- **Alternatives rejected**: caching files like the schedule (explicitly out of scope; files are not "today's work" the day depends on).

## D-R6 · Cant-do → issue orchestration (D18)

- **Decision**: `useReportCantDo` is changed to **return the `CantDoResponse`** (`{eventId, appointmentStatus:'REJECTED', …}`) instead of `void` (returning `null` only in the swallowed `CANT_DO_ALREADY_REPORTED` 409 case). `CantDoSheet` adds an optional `PhotoPicker`; on submit it (1) calls cant-do, then (2) if there are confirmed photos **and** a non-null result, calls `useCreatePropertyIssue` with `{propertyId, appointmentId, reason: <reasonLabel> + <note>, photoFileIds, cantDoEventId: result.eventId}`. If step 2 fails, the decline is **not** reverted — the error is reported/logged, not surfaced as a decline failure (D18).
- **Rationale**: D18 requires `source=INSPECTOR`, `cant_do_event_id` filled, reason = reason-label + note, and "if issue creation fails, log and do not revert the cant-do". The cant-do response carries `eventId` (`cantDoResponseSchema.eventId`), and the backend create-issue INSP branch ownership-verifies `cantDoEventId`. Photos are uploaded (PENDING) while SCHEDULED before the cant-do (D-R2), so create-issue after REJECTED only links them.
- **Alternatives rejected**: creating the issue before the cant-do (the decline is the critical event and must land first, D18); a combined backend endpoint (none exists — two calls, orchestrated client-side).

## D-R7 · Limit validation is backend-authoritative; client guard is a soft hint

- **Decision**: The PWA pre-filters the file picker with `accept` from `DEFAULT_PROPERTY_FILES_SETTING.issueImageMimes` and does a soft client-side size/count guard, but treats the backend presign/confirm/create rejections as authoritative, surfacing their messages (C.A5). There is no inspector platform-settings read endpoint, so the PWA does not fetch the per-agency effective limits.
- **Rationale**: C.A5 ("format or size out of configuration refused with a clear message, in presign and confirm") is satisfied by the backend. Using shared defaults only for the picker hint avoids false rejections when an agency customizes limits (backend stays the source of truth). The per-issue cap is the backend `maxPhotosPerIssue` (default 10), **not** the portal-only `PORTAL_MAX_PHOTOS_PER_ISSUE = 5`.
- **Alternatives rejected**: strict client-side validation against hard-coded limits (would reject valid files when an agency raised `maxFileSizeMb`, and drift from the backend).

## D-R8 · HEIC & preview rendering (D13)

- **Decision**: Issue photos accept `image/heic` (in `issueImageMimes`). Thumbnails use the signed download URL as an `<img>`; where the browser can't render it (HEIC on non-Apple), fall back to a generic file affordance + a download/open action. Documents: images preview inline, PDFs open in a new tab, other types download (C.4).
- **Rationale**: D13 ("HEIC accepted, no guaranteed preview; generic icon + download when the browser can't render"). C.4 ("preview image, PDF in new tab, individual download, in web and app").

## D-R9 · E2E hermetic stubbing incl. file input on WebKit (+0.5 day)

- **Decision**: `tests/e2e/property-files.spec.ts` stubs all `/v1/property-files*` and `/v1/property-issues*` routes (presign → a dummy signed URL that is itself stubbed to 200, confirm → PENDING file, create-issue → the new issue; list → fixtures). Photo selection uses Playwright `setInputFiles` with an in-memory buffer. Runs on all 4 projects (Chromium + WebKit); the WebKit file-input path is the known slow spot the estimate budgets for (+0.5 day).
- **Rationale**: Root CLAUDE.md §11 / PWA §10 — hermetic suite, every API mocked, Chromium + WebKit a CI gate. `setInputFiles` is the standard hermetic file-picker driver. **Baseline stubs**: `GET /v1/property-files` and `GET /v1/property-issues` fire on **every appointment-detail render** (the section auto-fetches on mount to show counts), so safe empty defaults go into `BASELINE_STUBS` (prefix entries, like the day-plan one) to keep unrelated detail specs quiet; `property-files.spec.ts` overrides them (FR-021, T030). The signed-URL PUT target must also be routed (it is a non-`/v1` origin, so the hermetic `/v1` catch-all doesn't cover it) — stub it explicitly.
- **Alternatives rejected**: mocking `window.fetch` (PWA §10 forbids monkey-patching fetch — openapi-fetch captures it at client creation; use `page.route`).

## D-R10 · Referential stability (PWA §11.11)

- **Decision**: Every array/object derived from a query payload (grouped files, sorted issues, counts) is wrapped in `useMemo` keyed on the raw query data, inside the hook or a pure `lib/` mapper.
- **Rationale**: PWA CLAUDE.md §11.11 — an unmemoized derived return caused a production render-loop freeze (PR #961). Pure mappers in `lib/` are unit-tested and memo-wrapped at the hook boundary.
