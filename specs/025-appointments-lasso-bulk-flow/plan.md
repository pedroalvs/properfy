# Implementation Plan: Appointments Map UX — Lasso Flow + Bulk-Action Modal + Marker Detail Panel (025)

**Feature**: `025-appointments-lasso-bulk-flow`
**Branch**: `feat/appointments-map-ux` (NEW; off `develop @ 6035fc9`; NOT stacked on 022+023+024)
**Owner**: Arquiteto → Executor
**Spec**: `./spec.md` · **Design**: `docs/superpowers/specs/2026-05-11-appointments-lasso-flow-design.md` + 4 user mockups (2026-05-11)
**Constitution**: v1.4.0

## High-level architecture

Four related fixes/features land in one PR on a new branch off develop. All four touch the `/appointments` map UX surface. Backend changes are **additive only** (no migration; four new bulk endpoints delegating to existing state-machine + update use cases). Frontend gains three new components (`MapBulkActionModal`, `AppointmentMapDetailPanel`, `AppointmentCodePill`) and refactors two (`MapLassoSelect`, `AppointmentMapPage`).

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Backend (4 new bulk endpoints + 1 shared transition matrix)               │
│                                                                            │
│  apps/backend/src/modules/appointment/                                    │
│   application/use-cases/                                                   │
│    bulk-cancel-appointments.use-case.ts            (NEW)                   │
│    bulk-reschedule-appointments.use-case.ts        (NEW)                   │
│    bulk-status-transition.use-case.ts              (NEW)                   │
│    bulk-assign-inspector.use-case.ts               (NEW)                   │
│    execute-status-transition.use-case.ts           (REUSE — delegated to)  │
│    update-appointment.use-case.ts                  (REUSE — delegated to)  │
│    bulk-resend-reminder.use-case.ts                (EXISTS — unchanged)    │
│    bulk-edit-appointments.use-case.ts              (EXISTS — list page)    │
│    get-appointment.use-case.ts                     (MAYBE +clientName)     │
│                                                                            │
│   interfaces/appointment.routes.ts                                         │
│    + POST /v1/appointments/bulk-cancel                                    │
│    + POST /v1/appointments/bulk-reschedule                                │
│    + POST /v1/appointments/bulk-status-transition                         │
│    + POST /v1/appointments/bulk-assign-inspector                          │
│                                                                            │
│  packages/shared/src/                                                      │
│   schemas/appointment.ts                                                   │
│    + bulkCancelRequestSchema, bulkRescheduleRequestSchema,                │
│      bulkStatusTransitionRequestSchema, bulkAssignInspectorRequestSchema │
│    + bulkActionResultItemSchema, bulkActionResponseSchema                 │
│   permissions/role-matrix.ts                                               │
│    + appointment.bulk_cancel, appointment.bulk_reschedule,                │
│      appointment.bulk_status_transition,                                  │
│      appointment.bulk_assign_inspector                                    │
│   lib/appointment-transitions.ts                   (NEW — shared matrix)   │
│   pnpm generate:api → api-types.ts regenerated                             │
└──────────────────────────────────────────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Frontend                                                                   │
│                                                                            │
│  apps/web/src/features/appointments/                                       │
│   pages/AppointmentMapPage.tsx                                             │
│     - lassoState enum (idle | drawing | review | applying)                 │
│     - auto-fit useEffect: skip when lassoState !== 'idle'                  │
│     - onSelectionChange: fitBounds only if selection out-of-viewport       │
│     - ESC handler                                                          │
│     - render <MapBulkActionModal> when review/applying                     │
│     - render <AppointmentMapDetailPanel> on marker click (replaces popup)  │
│     - REMOVE <MapSelectionPanel> bottom strip                              │
│   components/                                                              │
│     MapBulkActionModal.tsx                          (NEW)                  │
│       - 2-step UX: list (checkboxes default UNCHECKED) → action form       │
│       - 7-column DataTable per spec §Modal column structure                │
│       - footer state matrix (0 vs ≥1 checked)                              │
│       - Bulk actions dropdown (Cancel / Reschedule / Change Status /       │
│         Assign Inspector / Re-send Reminder)                               │
│       - Add to group sub-modal + Create group sub-modal launchers          │
│     AppointmentCodePill.tsx                         (NEW)                  │
│       - mono-font chip; reused by modal column 2 + panel header            │
│     ConfirmationChannelIcons.tsx                    (NEW small)            │
│       - 2 icons (SMS + Email) red/green/gray                               │
│     AppointmentMapDetailPanel.tsx                   (NEW)                  │
│       - right-anchored side panel; header + CLIENT + PROPERTIES +          │
│         8 collapsible sections (lazy fetch on first expand)                │
│       - "MORE DETAILS" CTA → /appointments/:id in new tab                  │
│     MapAddToGroupModal.tsx                          (NEW)                  │
│       - existing-group picker; per-item add result                         │
│     MapSelectionPanel.tsx                           (DELETE)               │
│       - replaced by MapBulkActionModal                                     │
│   hooks/                                                                   │
│     useBulkCancelAppointments.ts                    (NEW)                  │
│     useBulkRescheduleAppointments.ts                (NEW)                  │
│     useBulkStatusTransition.ts                      (NEW)                  │
│     useBulkAssignInspector.ts                       (NEW)                  │
│     useBulkResendReminder.ts                        (EXISTS)               │
│     useAppointmentDetail.ts                         (EXISTS — reused for   │
│       lazy fetch in detail panel)                                          │
│  apps/web/src/components/map/                                              │
│   MapLassoSelect.tsx                                                       │
│    - prop lassoState replaces active boolean                               │
│    - MapboxDraw control kept alive across drawing → review                 │
│    - simple_select mode on draw.create (polygon persists)                  │
│    - custom paint layer for peach/orange polygon styling                   │
│    - cleanup only on lassoState === 'idle'                                 │
└──────────────────────────────────────────────────────────────────────────┘
```

## Backend changes (detailed)

### 1. Shared transition matrix

`packages/shared/src/lib/appointment-transitions.ts` (NEW):

```ts
import { AppointmentStatus } from '../enums';
import type { UserRole } from '../enums';

interface ClUserFlags { cancel_appointments?: boolean; reject_appointments?: boolean }

const BASE_MATRIX: Record<AppointmentStatus, Array<{ target: AppointmentStatus; allowedRoles: UserRole[]; clUserFlag?: keyof ClUserFlags; reasonRequired: boolean }>> = {
  DRAFT: [
    { target: 'AWAITING_INSPECTOR', allowedRoles: ['OP'], reasonRequired: false },
    { target: 'REJECTED', allowedRoles: ['OP', 'AM'], reasonRequired: true },
    { target: 'CANCELLED', allowedRoles: ['OP', 'AM', 'CL_ADMIN'], reasonRequired: true },
  ],
  AWAITING_INSPECTOR: [
    { target: 'CANCELLED', allowedRoles: ['OP', 'AM', 'CL_ADMIN'], reasonRequired: true },
    // SCHEDULED transition is system-driven (inspector accept); not in bulk modal
  ],
  SCHEDULED: [
    { target: 'CANCELLED', allowedRoles: ['OP', 'AM', 'CL_ADMIN'], reasonRequired: true },
    { target: 'REJECTED', allowedRoles: ['OP'], reasonRequired: true },
    // DONE transition by inspector flow; not in bulk modal
  ],
  DONE: [
    { target: 'DRAFT', allowedRoles: ['AM'], reasonRequired: true },  // reopen
  ],
  CANCELLED: [
    { target: 'DRAFT', allowedRoles: ['OP', 'AM'], reasonRequired: true },
  ],
  REJECTED: [
    { target: 'DRAFT', allowedRoles: ['OP', 'AM'], reasonRequired: true },
  ],
};

export function getValidTransitions(
  currentStatus: AppointmentStatus,
  role: UserRole,
  clUserFlags?: ClUserFlags,
): AppointmentStatus[] {
  const entries = BASE_MATRIX[currentStatus] ?? [];
  return entries
    .filter((e) => e.allowedRoles.includes(role) || (role === 'CL_USER' && e.clUserFlag && clUserFlags?.[e.clUserFlag]))
    .map((e) => e.target);
}

export function isReasonRequired(currentStatus: AppointmentStatus, targetStatus: AppointmentStatus): boolean {
  const entries = BASE_MATRIX[currentStatus] ?? [];
  return entries.find((e) => e.target === targetStatus)?.reasonRequired ?? false;
}
```

Both backend (for early rejection) and frontend (for footer gating) import from the same module — single source of truth.

### 2. Bulk Cancel use case

`apps/backend/src/modules/appointment/application/use-cases/bulk-cancel-appointments.use-case.ts` (NEW):

```ts
export class BulkCancelAppointmentsUseCase {
  constructor(
    private readonly executeTransition: ExecuteStatusTransitionUseCase,
    private readonly idempotency: IIdempotencyService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: { appointmentIds: string[]; reason: string; actor: AuthContext; actorTimezone?: string }) {
    const dayKey = formatDateInTz(this.clock(), input.actorTimezone ?? 'UTC');
    const results: BulkActionResultItem[] = [];
    for (const apptId of input.appointmentIds) {
      const idemKey = `bulk_cancel:${apptId}:${dayKey}`;
      const cached = await this.idempotency.getWithHash<BulkActionResultItem>(idemKey, 'bulk_cancel');
      if (cached) { results.push({ appointmentId: apptId, status: 'IDEMPOTENT_REPLAY' }); continue; }
      try {
        await this.executeTransition.execute({ appointmentId: apptId, targetStatus: 'CANCELLED', reason: input.reason, actor: input.actor });
        const result = { appointmentId: apptId, status: 'OK' as const };
        await this.idempotency.save?.(idemKey, 'bulk_cancel', result);
        results.push(result);
      } catch (e) {
        results.push(mapErrorToResult(apptId, e));
      }
    }
    return { results };
  }
}
```

`mapErrorToResult` translates known errors to per-item statuses: `INVALID_TRANSITION`, `FORBIDDEN`, `NOT_FOUND`, fall-through `ERROR`.

### 3. Bulk Reschedule, Status-Transition, Assign-Inspector use cases

Same pattern as Bulk Cancel:

- `BulkRescheduleAppointmentsUseCase` delegates to `UpdateAppointmentUseCase` with `{ scheduledDate, timeSlot? }` per item. Audit: existing `appointment.rescheduled` event.
- `BulkStatusTransitionUseCase` delegates to `ExecuteStatusTransitionUseCase` per item with caller-supplied `targetStatus, reason?`. State machine enforces reason requirements.
- `BulkAssignInspectorUseCase` delegates to `UpdateAppointmentUseCase` with `{ inspectorId }` per item. Validates inspector active + (optionally) eligible.

All four use cases share the same response envelope and idempotency key prefix pattern (`bulk_<action>:<appointmentId>:<dayKey>`).

### 4. Routes

`apps/backend/src/modules/appointment/interfaces/appointment.routes.ts` — add four route handlers using existing `success`/`paginated` helpers + Fastify `schema:{body,response}`. Each handler enforces the corresponding permission key via `authorizationService.assertRoles`. AM/OP/INSP existing tenant-scope rules apply.

### 5. `get-appointment.use-case.ts` — verify `clientName`

The `mapToOutput` function already pulls `tenantName` via the contact. **The "CLIENT" in the marker panel mockup is the AGENCY (tenant entity), not the contact's `tenantName`.** Audit:

- If `appointment.tenant.name` is NOT in the response (likely the case — `findById` does not eager-load the tenant), extend the use case with `tenantRepo.findById(appointment.tenantId)` → add `clientName: tenant.name` to the output. Single additive field.
- Verify via grep before implementing; do NOT duplicate if a field already exposes it.

### 6. Shared schemas + permissions

`packages/shared/src/schemas/appointment.ts`:

```ts
export const bulkCancelRequestSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1).max(100),
  reason: z.string().min(3).max(500),
});

export const bulkRescheduleRequestSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1).max(100),
  newDate: z.union([z.string().datetime(), z.string().date()]),
  newTimeSlot: z.string().optional(),
});

export const bulkStatusTransitionRequestSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1).max(100),
  targetStatus: z.nativeEnum(AppointmentStatus),
  reason: z.string().min(3).max(500).optional(),
});

export const bulkAssignInspectorRequestSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1).max(100),
  inspectorId: z.string().uuid(),
});

export const bulkActionResultItemSchema = z.object({
  appointmentId: z.string().uuid(),
  status: z.enum(['OK', 'INVALID_TRANSITION', 'FORBIDDEN', 'NOT_FOUND', 'ERROR', 'IDEMPOTENT_REPLAY']),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});

export const bulkActionResponseSchema = z.object({
  data: z.object({ results: z.array(bulkActionResultItemSchema) }),
});
```

Permissions in `packages/shared/src/permissions/role-matrix.ts`:

```ts
'appointment.bulk_cancel': { roles: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'], condition: 'cl_user_flag', conditionKey: 'cancel_appointments' },
'appointment.bulk_reschedule': { roles: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'] },
'appointment.bulk_status_transition': { roles: ['AM', 'OP'] },
'appointment.bulk_assign_inspector': { roles: ['AM', 'OP'] },
```

`pnpm generate:api` after wiring routes.

## Frontend changes (detailed)

### 1. `MapLassoSelect.tsx` refactor

- Prop API: `lassoState: 'idle' | 'drawing' | 'review' | 'applying'` (replaces `active: boolean`).
- MapboxDraw control mounted on `drawing`; kept alive through `review` and `applying`; removed (+`deleteAll`) on `idle`.
- On `draw.create`: switch to `simple_select` mode; polygon stays.
- Disable map pan while `lassoState === 'drawing'` (via `map.dragPan.disable()` / re-enable on transition out).
- Polygon styling: custom paint layer overrides (peach/orange fill `rgba(255, 178, 102, 0.18)`, solid orange outline `#FF8A33`, width 2). Applied via MapboxDraw `styles` prop OR a post-mount `setPaintProperty` call.
- New callback `onPolygonCleared?: () => void` (fires when the polygon is removed for any reason).

### 2. `AppointmentMapPage.tsx` refactor

- New `lassoState` state.
- Auto-fit useEffect guarded: skip when `lassoState !== 'idle'`.
- `handleLassoSelectionChange`:
  - 0 items → toast + clear polygon + `lassoState = 'idle'`.
  - ≥1 items → compute selectedBounds; if any selected marker is outside current viewport → `fitBounds(selectedBounds, padding 100)`; else no camera move. Set `lassoState = 'review'`.
- ESC handler at page level: while `lassoState === 'review'` → clear and idle.
- Render `<MapBulkActionModal>` when `review || applying`. Remove `<MapSelectionPanel>`.
- `handleMarkerClick`: keep existing `flyTo` (PR #3 fix) AND open `<AppointmentMapDetailPanel>` (replaces inline `<MapPopup>` for the appointments mode). Groups mode keeps the existing popup unchanged.

### 3. `MapBulkActionModal.tsx` (NEW)

- Built on existing `Dialog` primitive, width `880px`.
- Internal state: `checkedIds: Set<string>` (default empty), `step: 'review' | 'apply'`, `currentAction?: BulkAction`.
- Step 1 body: DataTable with 7 columns per spec.
- Step 1 footer: state matrix per spec (0 vs ≥1 checked).
- Step 2 body: action-specific form (reason / date / status / inspector); Back returns to step 1 preserving checked state.
- Step 2 on Apply: fires endpoint, transitions to `applying`, surfaces result summary; user closes → `lassoState = 'idle'` + invalidate queries.
- Bulk actions dropdown: render greyed-out items with hover tooltips when disabled (do NOT hide — keeps discoverability).
- "Add to group" → opens `<MapAddToGroupModal>` (NEW).
- "Create group" → opens existing `<MapGroupCreateModal>` (already wired).

### 4. `AppointmentCodePill.tsx` (NEW)

Small reusable chip. Props: `code: string`. Renders `<span class="rounded bg-peach/30 text-xs font-mono">{code}</span>`. Used by modal column 2 + detail panel header.

### 5. `ConfirmationChannelIcons.tsx` (NEW)

Renders two icons inline:
- 📧 (email) — colour based on email confirmation status (red=failed, green=sent, gray=pending/not-sent)
- 📱 (sms)  — colour based on sms confirmation status (same scheme)

Data source: the appointment's `tenantConfirmationStatus` (existing) PLUS the per-channel notification attempt status. **Verify during implementation**: if the marker list endpoint does not expose per-channel statuses, either (a) extend it additively with `notificationStatuses: { email, sms }`, or (b) accept a simpler 1-icon rendering and capture an improvement gap (GAP-405).

### 6. `AppointmentMapDetailPanel.tsx` (NEW)

- Built on the existing `DrawerPanel` primitive (used by Properties/Contacts detail drawers). Size: `narrow` (~480px).
- Triggered by marker click; replaces inline `<MapPopup>` for appointments mode.
- Header: `{serviceTypeName}` h2 · `<StatusChip>` · `formatDate(scheduledDate) {timeSlot}` · `#{appointmentCode}`. Close `×` button.
- Body:
  - Always-expanded: CLIENT (`{clientName}`) · PROPERTIES (`<AppointmentCodePill code={propertyCode}>` + `{propertyAddress}`).
  - 8 collapsible `<DisclosureSection>` components (reuse existing primitive OR build a small one) — each section is closed by default. First time any collapsible expands, fire `useAppointmentDetail(appointmentId, { enabled: true })` to hydrate; subsequent expands use the cached data.
- Footer: full-width outline button "MORE DETAILS" → `window.open('/appointments/:id', '_blank')` per `feedback_new_tab_detail.md`.
- Close on ESC / click outside / `×` — preserves map state (selected marker stays highlighted; lasso untouched).
- Click DIFFERENT marker → swap appointment in panel; collapsed sections reset; fetch on next expand.

### 7. `MapAddToGroupModal.tsx` (NEW)

- Sub-modal launched from `MapBulkActionModal`'s "Add to group" button.
- Body: searchable `<SelectInput>` listing existing service groups in the active selection's tenant set. If selection spans tenants → option disabled.
- On confirm: `POST /v1/service-groups/{groupId}/appointments` with body `{ appointmentIds: checkedIds }`. **Verify during implementation** whether this endpoint exists; if not, add it (additive; sibling to the existing create endpoint).
- Response: per-item result envelope identical to other bulk endpoints.

### 8. Hooks

Four new mutation hooks (`useBulkCancelAppointments`, `useBulkRescheduleAppointments`, `useBulkStatusTransition`, `useBulkAssignInspector`), each wrapping `useCreateMutation` against the new endpoint. Existing `useBulkResendReminder` reused. Existing `useAppointmentDetail` reused for the lazy panel fetch.

## Build sequence (implementation order)

1. **shared/** — new bulk request/response schemas; new permission keys; new transition matrix module + tests.
2. **backend application** — four new use cases (delegate to `ExecuteStatusTransitionUseCase` / `UpdateAppointmentUseCase`).
3. **backend routes** — four new endpoints with full Fastify schemas; permission gates.
4. **backend `get-appointment.use-case.ts`** — verify `clientName`; add additively if missing.
5. **OpenAPI regen** — `pnpm generate:api`; commit `api-types.ts`.
6. **backend tests** — Supertest per endpoint (happy path + mixed results + RBAC denial); use-case unit tests; idempotency replay test.
7. **frontend `MapLassoSelect`** — refactor to `lassoState` prop; custom paint layer; persistence; dragPan toggle.
8. **frontend `AppointmentCodePill`** — small chip primitive.
9. **frontend `ConfirmationChannelIcons`** — 2-icon inline.
10. **frontend `MapBulkActionModal`** — step 1 list + step 2 forms + footer state matrix.
11. **frontend `MapAddToGroupModal`** — group picker + dispatch.
12. **frontend `AppointmentMapDetailPanel`** — replace `MapPopup` with side panel; lazy fetch.
13. **frontend `AppointmentMapPage.tsx`** — wire `lassoState`, remove `MapSelectionPanel`, add detail panel + bulk modal renders, ESC handler.
14. **frontend DELETE** `MapSelectionPanel.tsx` + tests (superseded).
15. **frontend tests** — per component + page integration + lazy-fetch assertion + UUID-not-rendered assertion.
16. **Playwright happy path** (OP): lasso → modal opens with all unchecked → check 3 → "Bulk actions ▾" → Cancel → reason → Apply → "3 cancelled" toast.
17. **regression** — 022 BUG-001 source-scan + pg_typeof; 023 RelationsTab lazy-fetch; 024 v1.4.0 cross-tenant visibility; T-2-907 contract; BUG-023-001 portal-token whitelist.
18. **lint, typecheck, build, test** all green.
19. **PR** open against `develop` with reference label `feat.appointments.map_ux` and the four-issue acceptance criteria checklist.

## Test strategy

### Backend

- **Unit (use-case)**: each new bulk use case — happy path; per-item ERROR; idempotency replay; mixed results.
- **Routes (Supertest)**: per endpoint × per role: AM/OP allowed for all; CL_ADMIN allowed for cancel + reschedule; CL_USER with/without flag for cancel; payload cap (>100 → 400); reason required for transitions that demand one.

### Frontend

- **Component**:
  - `MapLassoSelect.test.tsx`: state lifecycle — control mounts on drawing, persists on review, custom paint layer applied, cleans on idle.
  - `MapBulkActionModal.test.tsx`: default all UNCHECKED; select-all toggle; footer state matrix (0 vs ≥1); Bulk actions dropdown gated by RBAC + state-machine validity; UUID assertion (no raw IDs rendered).
  - `AppointmentMapDetailPanel.test.tsx`: renders CLIENT + PROPERTIES from marker payload; collapsible sections closed by default; first expand triggers `useAppointmentDetail` fetch; subsequent expands reuse cache; switching marker resets collapse + clears cache for new ID.
  - `AppointmentMapPage.test.tsx`: lasso completion with markers visible in viewport → NO fitBounds call; lasso completion with marker outside viewport → exactly one fitBounds call with padding 100; ESC during review → polygon cleared + modal closed.
- **Hook**: each of the four bulk hooks posts the correct body; result envelope unwrapped correctly.

### Playwright

OP happy path covering all 4 issues: open map → click lasso icon → draw polygon enclosing 5 markers visible in viewport → assert NO zoom change → modal opens with 5 rows ALL UNCHECKED → check 3 → "Bulk actions ▾" → Cancel → reason → Apply → assert "3 cancelled" toast + polygon clears + modal closes. Then click a marker → assert detail panel opens with CLIENT + PROPERTIES populated → expand "Meeting location" → assert single GET fires → click "MORE DETAILS" → assert new tab opens.

### Regression

- 022 BUG-001 source-scan + Testcontainers `pg_typeof`.
- 023 RelationsTab lazy-fetch + Cross-form contract (T-2-907).
- 024 Constitution v1.4.0 cross-tenant visibility (no impact — 025 doesn't touch contact code).
- BUG-023-001 portal-token whitelist.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Default-UNCHECKED state surprises operators who expected "lasso = action target" | Empty state hint at the top of the modal: "Tick the rows you want to act on. Nothing happens until you check at least one." |
| Lasso polygon styling clashes with map theme | Peach/orange chosen by user mockup; revisit if QA pushes back. Custom paint layer can be tweaked without code structure changes. |
| Bulk action dropdown gets long with disabled items | Keep dropdown alphabetical; tooltip on disabled items explains why. If list grows past 7-8 items in future, switch to two-column layout. |
| Marker detail panel may need a backend field (`clientName`) that doesn't exist | Plan §5 mandates verification first; additive field-only change if missing. No migration. |
| ConfirmationChannelIcons may need per-channel statuses not on the list payload | Plan §step 5 + GAP-405 — accept 1-icon fallback if extension is large. |
| State-machine matrix divergence between frontend and backend | `appointment-transitions.ts` is the single source. Contract test asserts the table matches the backend's `AppointmentStateMachine` domain table. |
| `MapPopup` removed for appointments mode but still used in groups mode | Page renders the popup conditionally on `mode === 'groups'` only. Existing tests for the groups popup must still pass. |
| Bulk endpoints could be misused as a back-door around state-machine validation | All transitions go through `ExecuteStatusTransitionUseCase` (Constitution §State Machine Sovereignty). The bulk wrapper adds no transition logic. |

## Out of scope (explicit)

- Replacing `BulkEditModal` in the list page (kept — different UX for multi-field tick-and-set).
- Rectangle / circle lasso geometry.
- sessionStorage / reload-survival of lasso state.
- Parallel-execution optimisation for bulk loops.
- A "merge contacts that are the same person" affordance (not 025 scope — see GAP-301 in 024).
- Visual regression suite (defer screenshots to Playwright happy path).

## Definition of Done

- All FRs (401-460) satisfied; manual QA matrix green for all roles.
- Four new bulk endpoints + 1 transition-matrix module land with full Fastify schemas + permission gates + unit/integration tests.
- Frontend MapLassoSelect / MapBulkActionModal / AppointmentMapDetailPanel render per mockup; default-UNCHECKED footer state matrix verified by tests; UUID-not-rendered assertion green.
- 022 BUG-001 + 023 lazy-fetch + 024 v1.4.0 regression gates remain green.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green.
- `pnpm generate:api` re-run; `api-types.ts` reflects the four new endpoints.
- PR opened against `develop` from `feat/appointments-map-ux` with reference label `feat.appointments.map_ux` + four-issue acceptance checklist + screenshots of modal + detail panel + persistent polygon.
