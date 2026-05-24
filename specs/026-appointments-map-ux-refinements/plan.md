# Implementation Plan: Appointments Map UX Refinements (026)

**Feature**: `026-appointments-map-ux-refinements`
**Branch**: `feat/026-appointments-map-ux-refinements` (NEW; off `develop` AFTER 025 merges; do NOT branch off `feat/appointments-map-ux`)
**Owner**: Arquiteto → Executor
**Spec**: `./spec.md` · **Predecessor**: 025 `feat/appointments-map-ux`
**Regras matrices**: items 3 + 5 (LITERAL — reuse `ServiceGroupValidator` + `ReopenForRescheduleUseCase`).

## High-level architecture

Layered refinement. Items 1, 2, 6, 7 are pure frontend. Item 4 is a UI relabel + dropdown reduction (no backend change beyond the existing endpoints). Item 3 needs **two new backend endpoints** (`POST /v1/service-groups/:groupId/appointments` + `POST /v1/service-groups/:groupId/eligibility-check`) that thin-wrap the existing `ServiceGroupValidator`. Item 5 needs **one new bulk endpoint** that wraps the existing `ReopenForRescheduleUseCase` + extends it with `tokenRepo.revokeAllForAppointment`.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Backend (new use cases + routes, reusing existing domain validators)      │
│                                                                            │
│  apps/backend/src/modules/service-group/                                   │
│   application/use-cases/                                                   │
│    add-appointments-to-group.use-case.ts            (NEW)                  │
│      - Uses ServiceGroupValidator (existing — domain/service-group.        │
│        validator.ts spec 005 line 244)                                    │
│      - For-of per appointment id: validates eligibility → if OK, adds     │
│        link + auto-transitions DRAFT → AWAITING_INSPECTOR via              │
│        ExecuteStatusTransitionUseCase                                      │
│    check-appointments-eligibility-for-group.use-case.ts (NEW — read-only) │
│      - Returns per-appointment + per-group eligibility hints              │
│   interfaces/service-group.routes.ts                                       │
│    + POST /v1/service-groups/:groupId/appointments                        │
│    + POST /v1/service-groups/:groupId/eligibility-check                   │
│                                                                            │
│  apps/backend/src/modules/appointment/                                     │
│   application/use-cases/                                                   │
│    bulk-reopen-for-reschedule.use-case.ts          (NEW)                   │
│      - For-of: delegates to ReopenForRescheduleUseCase per item            │
│      - Same-group constraint check (rejects spans-groups items as          │
│        INVALID_SCOPE)                                                      │
│      - After successful per-item reopen: tokenRepo.revokeAllForAppointment │
│        + audit tenant_portal.tokens_revoked                                │
│      - Reuses idempotency pattern from bulk-cancel                         │
│    reopen-for-reschedule.use-case.ts               (EXTEND — additive)     │
│      - Inject ITenantPortalTokenRepository (optional)                      │
│      - After successful reopen: call revokeAllForAppointment + audit       │
│      - Single-item endpoint behaviour preserved (still emits               │
│        appointment.rescheduled per spec 006)                               │
│   interfaces/appointment.routes.ts                                         │
│    + POST /v1/appointments/bulk-reopen-for-reschedule                     │
│                                                                            │
│  packages/shared/src/                                                      │
│   schemas/appointment.ts                                                   │
│    + bulkReopenForRescheduleRequestSchema                                  │
│   schemas/service-group.ts                                                 │
│    + addAppointmentsToGroupRequestSchema                                   │
│    + eligibilityCheckRequestSchema, eligibilityCheckResponseSchema         │
│   permissions/role-matrix.ts                                               │
│    + appointment.add_to_group                                             │
│    + appointment.bulk_reopen_for_reschedule                               │
│   pnpm generate:api → api-types.ts regenerated                             │
└──────────────────────────────────────────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Frontend                                                                   │
│                                                                            │
│  apps/web/src/components/ui/                                               │
│   ViewportAwareDropdown.tsx                          (NEW — generic)       │
│    - Wraps a trigger + menu; auto-flips per viewport edges                  │
│    - Used by Bulk actions ▾ dropdown; reusable elsewhere                    │
│                                                                            │
│  apps/web/src/components/map/                                              │
│   MapScreenLayout.tsx                                                       │
│    - Already supports sidePanelOpen; verify overlay-not-push CSS           │
│   MapFilterToggleButton.tsx                         (NEW)                  │
│    - Top-left pill button, "Filters" label + mdi-filter-variant            │
│                                                                            │
│  apps/web/src/features/appointments/                                       │
│   pages/AppointmentMapPage.tsx                                             │
│    - Filter panel state: default CLOSED; sessionStorage read/write         │
│    - Render <MapFilterToggleButton> top-left                                │
│    - <MapBulkActionModal> now anchored top-right (prop position)           │
│   components/                                                              │
│     MapBulkActionModal.tsx                                                  │
│      - Position prop: 'top-right' | 'centered' (default top-right desktop) │
│      - Compact width 480px; max-height calc(100vh - 32px)                  │
│      - <AppointmentCodePill> rows pass new onClick → opens detail panel    │
│      - Footer: separate [Add to group] button (left of [Create group])     │
│      - Bulk actions dropdown reduced to 4 items + relabel                  │
│      - Dropdown wrapped in <ViewportAwareDropdown>                          │
│     AppointmentCodePill.tsx                                                 │
│      - Accepts optional onClick + role="button" + aria-label               │
│      - Cursor pointer + hover bg when onClick provided                      │
│     MapAddToGroupSubModal.tsx                       (NEW)                  │
│      - Calls /v1/service-groups/.../eligibility-check on open               │
│      - Filters groups; surfaces ineligible-appointment banner; confirms    │
│        with POST /v1/service-groups/:groupId/appointments                  │
│     MapBulkRescheduleForm.tsx                       (NEW — was inline)     │
│      - Date input + dropdown picker (useTimeSlotOptions)                   │
│      - No numeric slot input                                                │
│      - Same-group precheck before enabling submit                          │
│   hooks/                                                                   │
│    useAppointmentsEligibilityCheck.ts               (NEW)                  │
│    useAddAppointmentsToGroup.ts                     (NEW)                  │
│    useBulkReopenForReschedule.ts                    (NEW)                  │
└──────────────────────────────────────────────────────────────────────────┘
```

## Backend changes (detailed)

### 1. `AddAppointmentsToGroupUseCase`

`apps/backend/src/modules/service-group/application/use-cases/add-appointments-to-group.use-case.ts`:

```ts
export class AddAppointmentsToGroupUseCase {
  constructor(
    private readonly groupRepo: IServiceGroupRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly validator: ServiceGroupValidator,            // EXISTING (spec 005 line 244)
    private readonly executeTransition: ExecuteStatusTransitionUseCase,
    private readonly auditService: IAuditService,
  ) {}

  async execute(input: { groupId: string; appointmentIds: string[]; actor: AuthContext }) {
    const group = await this.groupRepo.findById(input.groupId);
    if (!group) throw new GroupNotFoundError();
    if (!isAddableStatus(group.status)) throw new GroupInTerminalStateError();

    const results: AddAppointmentsResult[] = [];
    for (const apptId of input.appointmentIds) {
      const appt = await this.appointmentRepo.findById(apptId);
      const validation = this.validator.canAddToGroup(appt, group);
      if (!validation.ok) {
        results.push({ appointmentId: apptId, status: validation.reasonCode });  // INVALID_STATUS | INVALID_TENANT | …
        continue;
      }
      try {
        await this.groupRepo.addAppointment(input.groupId, apptId);
        if (appt.status === 'DRAFT') {
          await this.executeTransition.execute({ appointmentId: apptId, targetStatus: 'AWAITING_INSPECTOR', actor: input.actor });
        }
        this.auditService.log({ action: 'appointment.added_to_group', entityType: 'appointment', entityId: apptId, tenantId: appt.tenantId, metadata: { groupId: input.groupId } });
        results.push({ appointmentId: apptId, status: 'OK' });
      } catch (e) {
        results.push(mapErrorToResult(apptId, e));
      }
    }
    return { results };
  }
}
```

Validator reuse is the key — `service-group.validator.ts` already enforces: non-terminal group + same tenant + same serviceType + capacity ≤ 30 + same date+timeWindow + appointment not already in another group + appointment status ∈ {DRAFT, AWAITING_INSPECTOR}.

### 2. `CheckAppointmentsEligibilityForGroupUseCase` (read-only)

`apps/backend/src/modules/service-group/application/use-cases/check-appointments-eligibility-for-group.use-case.ts`:

```ts
export class CheckAppointmentsEligibilityForGroupUseCase {
  constructor(
    private readonly groupRepo: IServiceGroupRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly validator: ServiceGroupValidator,
  ) {}

  async execute(input: { groupId: string; appointmentIds: string[]; actor: AuthContext }) {
    const group = await this.groupRepo.findById(input.groupId);
    const appointments = await this.appointmentRepo.findByIds(input.appointmentIds);

    const eligibleAppointmentIds: string[] = [];
    const ineligibleAppointmentIds: Array<{ id: string; reasonCode: string }> = [];

    for (const appt of appointments) {
      const validation = this.validator.canAddToGroup(appt, group);
      if (validation.ok) eligibleAppointmentIds.push(appt.id);
      else ineligibleAppointmentIds.push({ id: appt.id, reasonCode: validation.reasonCode });
    }

    const groupReasons: string[] = [];
    if (!isAddableStatus(group.status)) groupReasons.push('GROUP_IN_TERMINAL_STATE');
    if (group.currentSize + eligibleAppointmentIds.length > 30) groupReasons.push('GROUP_CAPACITY_EXCEEDED');

    return {
      eligibleAppointmentIds,
      ineligibleAppointmentIds,
      groupAccepts: groupReasons.length === 0,
      groupReasons,
    };
  }
}
```

### 3. `BulkReopenForRescheduleUseCase`

`apps/backend/src/modules/appointment/application/use-cases/bulk-reopen-for-reschedule.use-case.ts`:

```ts
export class BulkReopenForRescheduleUseCase {
  constructor(
    private readonly reopenForReschedule: ReopenForRescheduleUseCase,  // EXISTING (spec 006 GAP-003)
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly idempotency: IIdempotencyService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: { appointmentIds: string[]; newDate: string; newTimeSlot: string; reason?: string; actor: AuthContext; actorTimezone?: string }) {
    // Same-group precheck
    const appointments = await this.appointmentRepo.findByIds(input.appointmentIds);
    const groupIds = new Set(appointments.map((a) => a.serviceGroupId ?? null));
    if (groupIds.size > 1 || groupIds.has(null)) {
      return { results: input.appointmentIds.map((id) => ({ appointmentId: id, status: 'INVALID_SCOPE' as const, error: { code: 'INVALID_SCOPE', message: 'Bulk reschedule limited to appointments within the same group' } })) };
    }

    const dayKey = formatDateInTz(this.clock(), input.actorTimezone ?? 'UTC');
    const results: BulkActionResultItem[] = [];
    for (const apptId of input.appointmentIds) {
      const idemKey = `bulk_reopen_reschedule:${apptId}:${dayKey}`;
      const cached = await this.idempotency.getWithHash<BulkActionResultItem>(idemKey, 'bulk_reopen_reschedule');
      if (cached) { results.push({ appointmentId: apptId, status: 'IDEMPOTENT_REPLAY' }); continue; }
      try {
        await this.reopenForReschedule.execute({ appointmentId: apptId, newDate: input.newDate, newTimeSlot: input.newTimeSlot, reason: input.reason, actor: input.actor });
        // Portal token revoke is now part of ReopenForRescheduleUseCase itself — see §4 below
        const result = { appointmentId: apptId, status: 'OK' as const };
        await this.idempotency.save?.(idemKey, 'bulk_reopen_reschedule', result);
        results.push(result);
      } catch (e) {
        results.push(mapErrorToResult(apptId, e));
      }
    }
    return { results };
  }
}
```

### 4. `ReopenForRescheduleUseCase` extension (additive)

`apps/backend/src/modules/appointment/application/use-cases/reopen-for-reschedule.use-case.ts`:

Add optional `tokenRepo: ITenantPortalTokenRepository` constructor dependency. After the existing reschedule + audit emit:

```ts
// Regras-mandated refactor (026 FR-543): revoke active portal tokens on reschedule
// for consistency with feature 007 portal flow.
if (this.tokenRepo) {
  await this.tokenRepo.revokeAllForAppointment(input.appointmentId);
  this.auditService.log({
    action: 'tenant_portal.tokens_revoked',
    entityType: 'appointment',
    entityId: input.appointmentId,
    tenantId: appointment.tenantId,
    metadata: { reason: 'operator_reschedule' },
  });
}
```

The single-item endpoint behaviour is preserved; the additive change applies to BOTH single-item and bulk paths (because both delegate to the same use case). Existing tests stay green if they used the constructor without `tokenRepo` (default `undefined` → no-op).

### 5. Routes

`apps/backend/src/modules/service-group/interfaces/service-group.routes.ts`:

- `POST /v1/service-groups/:groupId/appointments` — body `addAppointmentsToGroupRequestSchema`; auth `appointment.add_to_group` (AM/OP).
- `POST /v1/service-groups/:groupId/eligibility-check` — body `eligibilityCheckRequestSchema`; auth `appointment.add_to_group` (same key — read-only preview).

`apps/backend/src/modules/appointment/interfaces/appointment.routes.ts`:

- `POST /v1/appointments/bulk-reopen-for-reschedule` — body `bulkReopenForRescheduleRequestSchema`; auth `appointment.bulk_reopen_for_reschedule` (AM/OP/CL_ADMIN per matriz 2.2).

All three with Fastify `schema:{body,response}`.

### 6. Shared schemas + permissions

`packages/shared/src/schemas/service-group.ts`:

```ts
export const addAppointmentsToGroupRequestSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1).max(30),
});

export const eligibilityCheckRequestSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1).max(30),
});

export const eligibilityCheckResponseSchema = z.object({
  data: z.object({
    eligibleAppointmentIds: z.array(z.string().uuid()),
    ineligibleAppointmentIds: z.array(z.object({ id: z.string().uuid(), reasonCode: z.string() })),
    groupAccepts: z.boolean(),
    groupReasons: z.array(z.string()),
  }),
});
```

`packages/shared/src/schemas/appointment.ts`:

```ts
export const bulkReopenForRescheduleRequestSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1).max(30),
  newDate: z.union([z.string().datetime(), z.string().date()]),
  newTimeSlot: z.string().min(1),
  reason: z.string().min(3).max(500).optional(),
});
```

`packages/shared/src/permissions/role-matrix.ts`:

```ts
'appointment.add_to_group': { roles: ['AM', 'OP'] },
'appointment.bulk_reopen_for_reschedule': { roles: ['AM', 'OP', 'CL_ADMIN'] },
```

`pnpm generate:api` after routes wired.

## Frontend changes (detailed)

### 1. `ViewportAwareDropdown` (new generic primitive)

`apps/web/src/components/ui/ViewportAwareDropdown.tsx`:

- Props: `trigger: ReactNode`, `children: ReactNode`, `placement?: 'auto' | 'top' | 'bottom' | 'left' | 'right'`.
- Logic: on open, measure trigger's `getBoundingClientRect()` + viewport size; compute the placement with the most available space; apply `position: absolute` + `top/left` styles.
- On window resize → recompute.
- On scroll → close if trigger goes off-screen.
- Click outside → close.

Roll-our-own (no new dependency). ~80 lines + tests.

### 2. `MapBulkActionModal` refactor

`apps/web/src/features/appointments/components/MapBulkActionModal.tsx`:

- New prop `position?: 'top-right' | 'centered'` (default `'top-right'` on desktop, `'centered'` on mobile based on a `useMediaQuery` hook).
- Top-right CSS: `position: fixed; top: 16px; right: 16px; width: min(480px, calc(100vw - 32px)); max-height: calc(100vh - 32px); pointer-events: auto;`.
- Wrap the existing modal content in a div that does NOT use the `Dialog` backdrop overlay when `position === 'top-right'` (the backdrop blocks the map). Mobile path keeps the Dialog backdrop.
- Bulk actions dropdown wrapped in `<ViewportAwareDropdown>` with `placement="auto"`.
- Dropdown items reduced to 4: Cancel · Reschedule · Send confirmation email · Change status. Order alphabetical. Re-send Reminder renamed (label only — endpoint unchanged).
- Footer reshuffled: `[Close]` left; right group: `[Bulk actions (N) ▾]` · `[Add to group]` · `[Create group (N)]`.
- `Add to group` button — gated by `canPerform('appointment.add_to_group')`; opens `MapAddToGroupSubModal`.

### 3. `AppointmentCodePill` clickable

`apps/web/src/features/appointments/components/AppointmentCodePill.tsx`:

- Accept `onClick?: () => void` prop. When provided: `role="button"`, `aria-label="Open details for appointment {code}"`, `cursor-pointer`, `hover:bg-peach/40`, keyboard `onKeyDown` Enter/Space invokes onClick.
- When `onClick` absent: original render (display-only chip).

`MapBulkActionModal` passes `onClick={() => openDetailPanel(row.id)}` per row.

### 4. `MapAddToGroupSubModal` (new)

`apps/web/src/features/appointments/components/MapAddToGroupSubModal.tsx`:

- Opens with the checked appointment ids.
- Fetches existing service groups in the active tenant set (reuses existing `useServiceGroupList` hook if present; verify).
- For each candidate group, calls `useAppointmentsEligibilityCheck(groupId, appointmentIds)` lazily (only the group user expands/picks — to avoid N×eligibility calls on open). Alternative: bulk call for all visible groups (decide during implementation; performance test).
- Selecting a group + clicking "Add" calls `useAddAppointmentsToGroup({ groupId, appointmentIds })`.
- Ineligible appointments shown as a warning banner with the per-appointment `reasonCode` translated to UI copy.
- Result envelope surfaced as per-item success/failed (same UX as 025 bulk modal).

### 5. `MapBulkRescheduleForm` refactor

`apps/web/src/features/appointments/components/MapBulkRescheduleForm.tsx`:

- Replaces the inline reschedule form inside `MapBulkActionModal`'s step 2 for Reschedule.
- Fields: date `<input type="date">` + time slot `<SelectInput>` (uses `useTimeSlotOptions(branchId, tenantId)`) + optional reason `<Textarea>`.
- Same-group precheck: derive from the active selection's `serviceGroupId`; if mixed/none → action disabled (handled at dropdown level too via FR-542).
- Submit calls `useBulkReopenForReschedule({ appointmentIds, newDate, newTimeSlot, reason })`.
- NO numeric "Slot Size" input (Regras override of user mockup).

### 6. `MapFilterToggleButton` + filter panel collapse

`apps/web/src/components/map/MapFilterToggleButton.tsx`:

- Pill-style button, `mdi-filter-variant` icon + "Filters" label, top-left of map area.
- Props: `open: boolean`, `onToggle: () => void`.

`apps/web/src/features/appointments/pages/AppointmentMapPage.tsx`:

- New state `filtersOpen` initialized from `sessionStorage.getItem('appointments-map.filters.open') === 'true'`; default `false`.
- On toggle: setter + `sessionStorage.setItem('appointments-map.filters.open', String(next))`.
- Pass `sidePanelOpen={filtersOpen}` to `<MapScreenLayout>`; the existing prop already supports collapse.
- Render `<MapFilterToggleButton open={filtersOpen} onToggle={() => setFiltersOpen(v => !v)} />` over the map.
- Add a close `×` button in the filter panel header that also flips `filtersOpen` to `false`.
- Verify `MapScreenLayout`'s collapse CSS is overlay-style, not push (current code lines 14-40 use `max-h-0 overflow-hidden opacity-0 md:w-0` which is push-style — needs adjustment to absolute-positioned overlay). Plan §step 6.

### 7. Hooks

Three new mutation/query hooks under `apps/web/src/features/appointments/hooks/`:

- `useAppointmentsEligibilityCheck` — query against `POST /v1/service-groups/:groupId/eligibility-check`.
- `useAddAppointmentsToGroup` — mutation against `POST /v1/service-groups/:groupId/appointments`.
- `useBulkReopenForReschedule` — mutation against `POST /v1/appointments/bulk-reopen-for-reschedule`.

Each is a thin `useCreateMutation`/`useQuery` wrapper following 025 pattern.

## Build sequence (implementation order)

1. **shared/** — new Zod schemas + permission keys + transition-matrix unchanged.
2. **backend** — extend `ReopenForRescheduleUseCase` with optional token revoke (additive constructor dependency). Update wiring container.
3. **backend new use cases** — Add-to-group, eligibility-check, bulk-reopen-for-reschedule. Each unit-tested.
4. **backend routes** — three new endpoints with Fastify schemas + permission gates.
5. **OpenAPI regen** — `pnpm generate:api`; commit api-types.ts.
6. **backend tests** — Supertest per endpoint (happy + ineligible + RBAC denial + same-group precheck for bulk-reopen).
7. **frontend ViewportAwareDropdown** primitive + tests.
8. **frontend MapFilterToggleButton** + sessionStorage logic + MapScreenLayout overlay-not-push fix.
9. **frontend AppointmentCodePill** — clickable enhancement.
10. **frontend MapBulkActionModal** — top-right position, dropdown reduction, Add to group button, ViewportAwareDropdown wrap.
11. **frontend MapAddToGroupSubModal** — eligibility-aware group picker.
12. **frontend MapBulkRescheduleForm** — dropdown picker + same-group precheck.
13. **frontend hooks** — three new hooks.
14. **frontend tests** — per component + page integration; UUID-not-rendered (carried from 025); viewport flip assertion; sessionStorage round-trip.
15. **Playwright happy path** — OP draws lasso → modal top-right → clicks code → detail panel opens; switches to Reschedule → dropdown picker visible → submits → 1 item rescheduled; clicks "Add to group" → picker filtered → add 2 → DRAFT auto-transitioned.
16. **regression** — 022 BUG-001 + 023 lazy fetch + 024 v1.4.0 + 025 invariants (default-UNCHECKED + polygon persistence + no UUIDs + lazy-fetch detail panel).
17. **lint, typecheck, build, test** all green.
18. **PR** opened against `develop` from `feat/026-appointments-map-ux-refinements` with reference label `feat.appointments.map_ux_refinements`.

## Test strategy

### Backend

- **Unit**: each new use case — happy + ineligible (validator returns false) + INVALID_SCOPE for bulk-reopen with cross-group selection.
- **Integration**: `ServiceGroupValidator` re-tested via the eligibility-check endpoint to assert no double-implementation drift.
- **Routes (Supertest)**: per endpoint × per role; mixed-result envelope; portal token revoke verified (mock `tokenRepo.revokeAllForAppointment` called).

### Frontend

- **Component**:
  - `ViewportAwareDropdown.test.tsx`: flip up/down/left based on stubbed `getBoundingClientRect` values.
  - `MapBulkActionModal.test.tsx`: position top-right on ≥600px viewport; centered on <600px; dropdown 4 items; UUID-not-rendered still green.
  - `AppointmentCodePill.test.tsx`: onClick fires; keyboard Enter triggers onClick; aria-label present.
  - `MapAddToGroupSubModal.test.tsx`: eligibility-check fires on open; ineligibles shown in banner; confirm calls add endpoint.
  - `MapBulkRescheduleForm.test.tsx`: dropdown options from `useTimeSlotOptions`; NO numeric input rendered; same-group precheck disables submit when mixed.
  - `MapFilterToggleButton.test.tsx`: toggles `sessionStorage`; default-closed.
- **Page integration**: `AppointmentMapPage.test.tsx` — filter panel default-closed; toggle button visible; clicking restores from sessionStorage.

### Playwright happy path

OP role:
1. Open `/appointments` map. Verify filter panel CLOSED + Filters button at top-left.
2. Click Filters → panel slides in overlay.
3. Click lasso, draw polygon over 5 markers → modal opens at top-right.
4. Click code pill of row #2 → AppointmentMapDetailPanel opens; close it; modal still visible.
5. Check 3 rows → footer reflects `[Close] [Bulk actions (3) ▾] [Add to group] [Create group (3)]`.
6. Open dropdown → exactly 4 items.
7. Click Reschedule → form shows date + dropdown (NOT numeric input); pick a valid same-group selection → Apply → "3 rescheduled" toast.
8. Re-draw lasso, select 5 mixed-status → click Add to group → sub-modal shows banner about ineligibles → confirm with 3 → DRAFT → AWAITING_INSPECTOR verified via marker color shift.

### Regression

- 022 BUG-001 source-scan + pg_typeof.
- 023 RelationsTab lazy fetch + T-2-907 + BUG-023-001.
- 024 Constitution v1.4.0 cross-tenant visibility.
- 025 default-UNCHECKED + polygon persistence + lazy-fetch detail panel + no raw UUIDs.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| `ViewportAwareDropdown` flip math has off-by-one bugs near edges | Component test with stubbed `getBoundingClientRect` at 1px, 0px, viewport-1 boundaries. |
| Top-right modal blocks important map controls (zoom +/-) | Position the modal with `pointer-events: auto` only on its box; surrounding map area has `pointer-events: none` from the modal wrapper. Verify zoom button still receives clicks. |
| `ReopenForRescheduleUseCase` extension breaks existing single-item tests | Token revoke is wrapped in `if (this.tokenRepo)` — no-op when not injected; existing tests without the dep stay green. Wire the dep in the container in a separate test. |
| Eligibility check fires N×groups → perf | Lazy check on group expand/pick (not on submodal open). Alternative bulk variant is a follow-up if QA pushes back. |
| Filter panel overlay collides with the lasso button if it also lives top-left | Verify positioning — lasso button is in the MapFloatingAction stack (currently right side). Top-left should be clear for the Filters button. |
| sessionStorage `'true'/'false'` string parsing fragile | Use `=== 'true'` strict comparison; tests cover the deserialization. |
| State-machine matrix drift between FE and BE | 026 reuses `appointment-transitions.ts` from 025 (single source). No new transitions added by 026; only the dropdown's visible items change. |

## Out of scope

- Cross-group bulk reschedule (GAP-501 — future).
- Mobile-first redesign (GAP-503).
- URL-state sync for filters (GAP-504).
- Replacing the existing `MapGroupCreateModal` (kept for Create group flow).
- Adding new bulk actions beyond the dropdown's 4 items.
- Refactoring `MapLassoSelect` further (025's state machine is sufficient).

## Definition of Done

- All FRs (501-571) satisfied; manual QA matrix green per role.
- Three new backend endpoints + `ReopenForRescheduleUseCase` token revoke land with unit + integration + route tests.
- New `ViewportAwareDropdown`, `MapFilterToggleButton`, `MapAddToGroupSubModal`, `MapBulkRescheduleForm` components land with tests; existing `MapBulkActionModal` + `AppointmentCodePill` refactors green.
- 022/023/024/025 regression gates remain green.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green.
- `pnpm generate:api` re-run; `api-types.ts` reflects the three new endpoints.
- PR opened against `develop` from `feat/026-appointments-map-ux-refinements` with reference label `feat.appointments.map_ux_refinements` + Regras-validation note (items 3+5 cite the matrices) + four screenshots (top-right modal, filter toggle, Add to group sub-modal, Reschedule form with dropdown).
