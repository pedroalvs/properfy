# Phase 0 Research — F10-2 (Property Files & Issues, Web)

All unknowns resolved against the merged F10-1 contract and the verified `apps/web` codebase. No `NEEDS CLARIFICATION` remain.

## D1 — Typed API client & Idempotency

- **Decision**: Use the existing `api` client (`services/api.ts`, `createClient<paths>`) directly for calls needing headers or DELETE, and the `useApiQuery.ts` hooks (`usePaginatedQuery`/`useDetailQuery`) for plain GETs. Idempotency via `createIdempotencyKeyManager` from `@properfy/shared`, passed as `headers: { 'Idempotency-Key': mgr.current() }`, rotated on success.
- **Rationale**: `useApiQuery.ts` wrappers do not support request headers and expose no `apiDelete`; confirm and create-issue require `Idempotency-Key`, and deletes are DELETE. The `ReversePaymentModal` precedent shows the manager pattern.
- **Alternatives**: Adding header support to the generic hooks — rejected (scope creep, violates "change only what the task requires").

## D2 — Error surfacing & 503

- **Decision**: Surface errors with `toApiError(err, status)` → `getErrorMessage`/`getFieldErrors`. For storage unavailability, show the shared `FILE_STORAGE_UNAVAILABLE_MESSAGE` when `status === 503` or `code === 'STORAGE_NOT_CONFIGURED'`.
- **Rationale**: `STORAGE_NOT_CONFIGURED` is already on the shared `DISPLAYABLE_SERVER_ERROR_CODES` allowlist, so its 5xx message is shown; the shared constant guarantees one consistent string across web/PWA/portal (D16).
- **Alternatives**: Custom 503 copy — rejected (shared constant is the single source).

## D3 — Upload flow (presign → PUT → confirm)

- **Decision**: Mirror `useInspectorDocumentUpload`: `POST /v1/property-files/presign` → `fetch(uploadUrl, { method:'PUT', body:file, headers:{'Content-Type':file.type}, signal })` with a 60 s `AbortController` → `POST /v1/property-files/confirm` (`Idempotency-Key`). New version uses `POST /v1/property-files/{id}/versions` for the presign step, same PUT+confirm tail.
- **Rationale**: Identical signed-URL pattern already proven; F10's presign response is typed (no cast needed).
- **Alternatives**: Multipart FormData (tenant-logo pattern) — rejected (F10-1 is presign-based; size is validated at confirm, not multipart).

## D4 — Issue creation (photo-by-photo, D12/D20)

- **Decision**: For each selected photo: presign (`type: ISSUE`) → PUT → confirm; show per-photo status; a failed photo can be removed; then `POST /v1/property-issues` (`Idempotency-Key`) with `photoFileIds` = the confirmed photos. Create only when all intended photos are confirmed or failed ones removed.
- **Rationale**: F10-1 keeps an ISSUE photo `PENDING` until the create-issue transaction links it; only confirmed photos link, else 409 (C.A5/D20). Matches the "one photo at a time, a failure doesn't lose the rest" rule (D12).
- **Alternatives**: Batch upload then create — rejected (a single failure would block the whole issue and lose confirmed photos).

## D5 — Author/seen identity (no names in contract)

- **Decision**: Display author as the **source label** (INSPECTOR→"Inspector", STAFF→"Staff", RENTAL_TENANT_PORTAL→"Tenant"); seen status as "Seen · {dd/MM HH:mm}" (+ "by you" when `seenByUserId === current user`). Never render a raw id.
- **Rationale**: The F10-1 DTOs carry only user ids, not names; the audit timeline resolves `actorName` server-side but files/issues do not, and client-side id→name resolution is not tenant-safe across AM/OP/CL and is out of F10-2 scope (contract is merged; only F10-4 regenerates it). Project rule forbids raw ids in UI. The plan authorizes the "minimal reading" when the text asks for more than the acceptance criteria test — and no C.A code tests author names.
- **Alternatives**: Load `/v1/users` to resolve names — rejected (cross-tenant RBAC holes, heavy fetch, inspectors not in the users list). Flagged to coordinator as a possible future backend enrichment (out of scope).

## D6 — Subtab primitive

- **Decision**: `TabsNav` both for the Files tab (added to the detail page's existing tab bar) and for the four subtabs inside the panel. `TabsNav` carries a numeric `badge` per tab, which renders the "Issues (n)" counts natively.
- **Rationale**: No `SubTabs` primitive exists. `TabsNav` already models tabs-with-count-badges and is the detail-page convention, so the subtabs read as a nested tab bar with counts; each tab is a native `<button role="tab">` (keyboard operable). `FilterSegmented` was considered but it has no count affordance and renders a visible caption, which is wrong for nested subtabs.
- **Alternatives**: `FilterSegmented` (counts crammed into labels + redundant caption) — rejected. New SubTabs primitive — rejected (reuse first).

## D7 — Sidebar indicator placement (A1)

- **Decision**: Appointment unseen-issues dot on the **Map** item (`/map`); property dot on **Properties**. Add an optional `badge?` to `SidebarItem`/`NavItem`; new `SidebarItemBadge` primitive renders the dot with `aria-label="N unseen issues"`. Query `GET /v1/property-issues/unseen-count` gated by `canPerform('property_issue.unseen_count')` (AM/OP/CL_ADMIN).
- **Rationale**: There is no "Appointments" sidebar item — appointments are reached via Map; Map is the faithful target. X01 ships no per-item badge (D-X01), so the primitive is new here.
- **Alternatives**: No appointment dot (rely on border+filter) — kept as the coordinator's veto option; default is Map.

## D8 — Row border (A5)

- **Decision**: Add optional `rowClassName?: (row) => string | undefined` to `DataTable`, applied in both desktop `<tr>` and mobile card; `AppointmentTable`/`PropertyTable` pass `(r) => r.hasUnseenIssues ? 'border-l-4 border-l-warning' : undefined` (the existing `warning` design token).
- **Rationale**: `DataTable` has no per-row class hook today; this is the minimal additive change. Use a Tailwind token, not a raw color (CLAUDE.md).
- **Alternatives**: Per-table custom render — rejected (duplicates row markup, both tables need it).

## D9 — "With issues" filter (A4)

- **Decision**: Add `withIssues` boolean to each list's filter schema/state/defaults and params builder; render a `FilterBoolean` next to the existing boolean filters; wire to the `withIssues` query param. Available to all list-viewing roles (backend filter is role-agnostic: "has any non-deleted issue"). On the appointment board, include it in `hiddenFilters` unless trivially supported (decide in tasks).
- **Rationale**: Mirrors the F01-2 `missingBaseAddress` precedent exactly; backend already accepts the param.
- **Alternatives**: Gate to AM/OP/CL_ADMIN only — rejected (backend supports all roles; CL_USER can view issues read-only).

## D10 — Platform settings section

- **Decision**: New `PropertyFilesSettingsSection` using `usePlatformSetting('propertyFiles')`, following the `TenantEtaNoticesSection`/`FieldEventsSettingsSection` skeleton (toFormState/validate/toValue, dirty, `onDirtyChange`); client-side bounds from `propertyFilesSettingSchema`; rendered on `PlatformSettingsPage` with a new dirty flag ORed into the page's discard confirm. Arrays (`allowedMimes`/`issueImageMimes`) use a checkbox group; `retentionDays` uses a "keep forever" toggle + number.
- **Rationale**: F03-4 established "a future feature adds a key + a section, never touches the hook/page plumbing."
- **Alternatives**: Free-text MIME entry — rejected (error-prone; a bounded checkbox set over the known MIME list is clearer).

## D11 — React Query keys & invalidation

- **Decision**: Keys: `['property-files', {propertyId|appointmentId, type}]`, `['property-issues', {propertyId|appointmentId}]`, `['property-issues','unseen-count']`. Mutations (create/mark-seen/delete issue, upload/version/delete file) invalidate the relevant file/issue keys **and** `['appointments']`, `['properties']`, and `['property-issues','unseen-count']` so list borders and the sidebar dot refresh. Unseen-count hook sets `staleTime: 60_000`.
- **Rationale**: Matches the F03-4 lesson (child keys under the parent prefix; transitions/mutations invalidate the prefix). Lists carry `hasUnseenIssues`, the sidebar carries the count — both derive from issue state.
- **Alternatives**: Manual refetch — rejected (TanStack invalidation is the convention).

## D12 — Testing approach

- **Decision**: Vitest/RTL co-located for each component/hook (MIME reject, mark-seen idempotency, border show/hide, New version preserves prior, sidebar badge, With issues filter, 503 message, no-raw-id guard). One hermetic Playwright `property-files.spec.ts` (row with `hasUnseenIssues:true` → border + dot → Mark as seen (stub) → both clear; property panel shows "Appointment #code" + "Open appointment" — C.A1 web side). Add a default unseen-count stub (and file/issue list stubs) to `helpers.ts`, plus a `propertyFiles` stub to the existing settings specs, so shell-loading specs stay hermetic.
- **Rationale**: Root CLAUDE.md §11 — Playwright is hermetic (all API stubbed); the cross-surface proof is a backend supertest in F10-1. Mounting new shell/detail fetches can pollute existing specs (F03-4 mockOnce lesson) → stub the new endpoints centrally.
- **Alternatives**: Real E2E — impossible under the hermetic rule.
