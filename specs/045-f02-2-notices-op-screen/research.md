# Research — Inspector notices Web (045)

No unresolved `NEEDS CLARIFICATION` remained from the plan; this file records the
grounding decisions and the patterns reused from the codebase.

## D-R1 · List page pattern

- **Decision**: Build the list with `ListFilterTableTemplate` + `DataTable` +
  `DataTablePagination`, driven by a `useInspectorNoticeList` hook modeled on
  `features/service-regions/hooks/useServiceRegionList.ts` (`usePaginatedQuery`, resets to
  page 1 on filter change).
- **Rationale**: Matches the established AM/OP list screens (service-regions, appointments);
  the clickable/focusable row pattern (`tabIndex=0` + `onKeyDown`) is already solved by
  `DataTable`, satisfying jsx-a11y under `--max-warnings 0`.
- **Alternatives**: a bespoke table — rejected (duplicates pagination/a11y, violates §V).

## D-R2 · Form & validation

- **Decision**: A controlled form (useState) — the web workspace's convention — that assembles
  the publish payload and validates it against the shared `publishInspectorNoticeSchema` from
  `@properfy/shared`, surfacing per-field custom messages. The shared schema enforces the
  shape/limits; the UI owns the copy ("Title must be 120 characters or fewer").
- **Rationale**: `react-hook-form` is **not** a dependency of `apps/web` (only the PWA has it);
  every existing web form (`ServiceRegionFormDrawer`, `AppointmentFormDrawer`) is controlled.
  Adding RHF for one drawer would violate §V (simplicity) and diverge from the pattern. Reusing
  the shared Zod schema still satisfies §IV (contract is the source of truth).
- **Alternatives**: adding react-hook-form + @hookform/resolvers to the web — rejected (new
  dependency, pattern divergence); a fully hand-rolled validator ignoring the schema —
  rejected (would drift from the contract).

## D-R3 · Typed API client & the `error: never` caveat

- **Decision**: Call the three F02-1 endpoints through `openapi-fetch` (`services/api.ts`)
  typed by the generated `api-types.ts`. Read errors off the HTTP status / `response` object
  and the parsed `{ error: { code } }` envelope, **not** off a typed `error` field.
- **Rationale**: Known memory gotcha — routes that declare only a 200/201 type the
  `openapi-fetch` `error` as `never`; mapping the contract error codes
  (`INSPECTOR_NOTICE_NO_RECIPIENTS`, `INSPECTOR_NOTICE_INVALID_RECIPIENTS`,
  `INSPECTOR_NOTICE_REGION_INACTIVE`) must go through the status + envelope. No `as any`
  (web typed-client cleanup WEB-10): use `params.path` for path params.
- **Alternatives**: `as any` casts — rejected (WEB-6/WEB-10 forbade them; lint zero-warnings).

## D-R4 · Idempotency-Key lifecycle

- **Decision**: `crypto.randomUUID()` generated once when the drawer opens, held in a ref,
  reused on every retry, regenerated only on reopen after success/close; sent as the
  `Idempotency-Key` header on `POST /v1/inspector-notices`.
- **Rationale**: D16 — two concurrent/retried POSTs must not create two notices; the backend
  verifies the key inside the publish transaction.
- **Alternatives**: a per-click UUID — rejected (breaks idempotency on retry).

## D-R5 · Sydney-time night-time phrase & date display

- **Decision**: Compute the ConfirmDialog night-time phrase and all civil date/time display
  through the shared Sydney-timezone helpers (`lib/display-timezone.ts`, `lib/format-date.ts`
  which wrap `packages/shared` `formatWallTime*`/`formatCivilDate`), never the browser
  timezone. The `[21:00, 07:00)` test and the `critical-confirm-copy.ts` lib take an injected
  `now` so tests pin the clock.
- **Rationale**: CLAUDE.md §9 — business-rule time is Sydney (`PLATFORM_TIMEZONE`), never the
  browser; tests that depend on timezone pin `TZ` away from Sydney.
- **Alternatives**: `new Date()` + `toLocaleTimeString` with the browser zone — rejected
  (wrong for operators outside Sydney; edge case 12).

## D-R6 · Inspector multi-select (new building block)

- **Decision**: Build a scoped `InspectorMultiSelect` that paginates
  `GET /v1/inspectors?status=ACTIVE&pageSize=100` to `totalPages` (pattern:
  `features/appointments/hooks/useAppointmentFilterOptions.ts`), with client search,
  "Select all shown"/"Clear", a 500 cap and native checkboxes (Space toggles, no arrow-key
  requirement).
- **Rationale**: No generic form multi-select exists in web (`FilterMultiSelect` is a filter
  bar widget, not a form control). Scoped to this feature per §V (no speculative generic).
- **Alternatives**: extend `FilterMultiSelect` — rejected (different semantics, would widen a
  filter-bar primitive's API for one caller).

## D-R7 · Sidebar insertion & routes

- **Decision**: Append the "Inspector notices" child to the existing Dashboard `submenu`
  between Overview and Analytics (F05 "Live Day" not yet merged), preserving the canonical
  X01 order documented in `Sidebar.tsx`. Register `/inspector-notices` and
  `/inspector-notices/:noticeId` under the authenticated layout with
  `AuthGuard roles={[UserRole.AM, UserRole.OP]}` (pattern: `service-groups` routes).
- **Rationale**: X01 owns the canonical order; F02 only appends (L-X01-03). Route guard
  mirrors the Sidebar child's `roles` exactly (constitution RBAC).
- **Alternatives**: reordering the group — rejected (X01 rule; other features depend on order).

## D-R8 · No E2E, no storage

- **Decision**: Unit tests only (Vitest + RTL); no new Playwright spec (end-to-end QA is
  manual in F02-3). Run the existing web E2E suite in CI mode to prove no regression. Use no
  `localStorage`/`sessionStorage` on this screen.
- **Rationale**: Task scope ("sem Playwright novo"); jsdom localStorage is unreliable in web
  tests (memory). Success-path drawer assertions use `waitFor` (findBy state-transition race,
  memory).
