# RBAC Contract Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make RBAC behavior consistent across backend route handlers, use cases, shared role matrix, web route guards, web sidebar/menu visibility, and page-level action visibility.

**Architecture:** Four independent problem areas — time-slot route/use-case divergence, shared matrix drift, OP tenant-scope comment/implementation contradiction, and user deactivation UI exposure — are fixed in sequence. Each task is a self-contained commit. The shared matrix is reconciled first because later tasks depend on it for `canPerform()` checks.

**Tech Stack:** TypeScript 5.x, Fastify (backend), React 18 + Vitest (web), `@properfy/shared` (role-matrix, `can()`/`canPerform()`), `AuthorizationService.assertRoles/assertTenantScope`.

---

## RBAC Contract Decisions

| Area | Decision | Documentation basis |
|---|---|---|
| **Time Slots — CL_ADMIN mutations** | ALLOWED for own tenant. Route handler guard (AM/OP only) is wrong; use cases already enforce tenant scope correctly. | Use case design + `config.time_slots` matrix = `['AM','OP','CL_ADMIN']` |
| **appointment.reopen_done** | AM + OP allowed | regras-negocio §9.488: "Reabrir serviço DONE" = AM ou OP |
| **config.service_types** | AM only | fluxo-operacional §2: "Definição de serviços — Responsável: Admin Master" |
| **user.deactivate** | AM + OP unconditionally; CL_ADMIN conditionally (tenant setting `allowClientUserManagement`) | Use case design; regras-negocio §9 configurable CL capabilities |
| **service_region.list** | AM + OP + INSP | Use case `assertRoles(['AM','OP','INSP'])` — CL roles do not access the service-region management page |
| **audit.view** | AM + OP + CL_ADMIN | Feature 020 / router comment: CL_ADMIN reads PII-masked own-tenant audit logs |
| **OP tenant scope** | OP is cross-tenant (null tenantId); `assertTenantScope` must bypass for OP same as AM | auth-middleware.ts QA comment 2026-04-19; all use cases treat OP as cross-tenant |
| **User deactivate UI** | Show deactivate button only to roles where `canPerform('user.deactivate')` is true | Align UI to matrix; API enforces conditional setting for CL_ADMIN |

---

## Files to Create or Modify

| File | Change |
|---|---|
| `apps/backend/src/modules/appointment-time-slot/interfaces/appointment-time-slot.routes.ts` | Remove AM/OP-only inline guard from POST/PATCH/DELETE — delegate to use case |
| `packages/shared/src/permissions/role-matrix.ts` | Update 5 action entries |
| `packages/shared/src/permissions/role-matrix.test.ts` | **CREATE** — matrix regression tests |
| `apps/backend/src/shared/domain/authorization.service.ts` | Add OP bypass in `assertTenantScope`; fix misleading comment |
| `apps/backend/tests/unit/shared/authorization.service.test.ts` | Update OP tenant scope tests to match new behavior |
| `apps/backend/src/modules/appointment/application/use-cases/bulk-edit-appointments.use-case.ts` | Fix wrong "OP is tenant-scoped" comment |
| `apps/web/src/features/users/components/UserDetailDrawer.tsx` | Gate deactivate button on `canPerform('user.deactivate')` |
| `apps/web/src/features/users/components/UserDetailDrawer.test.tsx` | Add role-visibility tests for deactivate button |
| `apps/web/src/features/appointments/pages/TimeSlotConfigPage.test.tsx` | Add CL_ADMIN view tests |

---

## Task 1 — Remove redundant AM/OP guard from time-slot route handlers

**Why:** The route handlers for POST/PATCH/DELETE `/v1/time-slots` have an inline `if (!['AM', 'OP'].includes(actor.role))` guard that over-denies CL_ADMIN. The use cases already call `assertRoles(['AM', 'OP', 'CL_ADMIN'])` and enforce tenant scope for CL_ADMIN — the route-level guard is redundant and wrong.

**Files:**
- Modify: `apps/backend/src/modules/appointment-time-slot/interfaces/appointment-time-slot.routes.ts`

- [ ] **Step 1: Write the failing test (conceptual — verify current behavior)**

  The existing use case tests in `tests/unit/appointment-time-slot/` already assert that CL_ADMIN can create/update/delete time slots for own tenant. The route handler test is not a unit test — confirm the route handler currently has the incorrect guard before removing it.

  Grep for the guard to confirm its presence:
  ```bash
  grep -n "Only AM and OP" apps/backend/src/modules/appointment-time-slot/interfaces/appointment-time-slot.routes.ts
  ```
  Expected output: 3 matches (one per POST, PATCH, DELETE handler)

- [ ] **Step 2: Remove the inline AM/OP-only guard from all three mutation handlers**

  In `apps/backend/src/modules/appointment-time-slot/interfaces/appointment-time-slot.routes.ts`, remove these 3 blocks (one per handler). They are identical in shape:
  ```typescript
  // REMOVE from POST, PATCH, DELETE handlers:
  const actor = request.authContext!;
  if (!['AM', 'OP'].includes(actor.role)) {
    throw new ForbiddenError('FORBIDDEN', 'Only AM and OP can manage time slot configuration');
  }
  ```

  After removal, the POST handler should look like:
  ```typescript
  async (request, reply) => {
    const parsed = createAppointmentTimeSlotSchema.safeParse(request.body);
    if (!parsed.success)
      throw new ValidationError('Request payload is invalid', parsed.error.errors);

    const result = await container.createAppointmentTimeSlotUseCase.execute({
      ...parsed.data,
      actor: request.authContext!,
    });
    return reply.status(201).send(success(result));
  },
  ```

  The PATCH handler:
  ```typescript
  async (request, reply) => {
    const params = timeSlotIdParam.safeParse(request.params);
    if (!params.success)
      throw new ValidationError('Invalid time slot ID', params.error.errors);

    const parsed = updateAppointmentTimeSlotSchema.safeParse(request.body);
    if (!parsed.success)
      throw new ValidationError('Request payload is invalid', parsed.error.errors);

    const result = await container.updateAppointmentTimeSlotUseCase.execute({
      timeSlotId: params.data.id,
      data: parsed.data,
      actor: request.authContext!,
    });
    return reply.status(200).send(success(result));
  },
  ```

  The DELETE handler:
  ```typescript
  async (request, reply) => {
    const params = timeSlotIdParam.safeParse(request.params);
    if (!params.success)
      throw new ValidationError('Invalid time slot ID', params.error.errors);

    await container.deleteAppointmentTimeSlotUseCase.execute({
      timeSlotId: params.data.id,
      actor: request.authContext!,
    });
    return reply.status(204).send();
  },
  ```

  Note: the unused `ForbiddenError` import can be removed from the top of the file if it is no longer referenced elsewhere in the file. Check first.

- [ ] **Step 3: Typecheck**
  ```bash
  pnpm --filter backend typecheck
  ```
  Expected: no errors.

- [ ] **Step 4: Run existing time-slot use case tests to confirm they still pass**
  ```bash
  pnpm --filter backend test -- --run tests/unit/appointment-time-slot/
  ```
  Expected: all tests pass. The tests already cover CL_ADMIN success and cross-tenant denial at the use case level.

- [ ] **Step 5: Commit**
  ```bash
  git add apps/backend/src/modules/appointment-time-slot/interfaces/appointment-time-slot.routes.ts
  git commit -m "fix(time-slots): remove redundant AM/OP-only route handler guard — use case enforces RBAC"
  ```

---

## Task 2 — Reconcile shared role matrix

**Why:** Five action entries in `packages/shared/src/permissions/role-matrix.ts` diverge from the documented and implemented behavior. The matrix is consumed by both backend (`can()`) and web (`usePermissions().canPerform()`), making it the single source of truth.

**Files:**
- Modify: `packages/shared/src/permissions/role-matrix.ts`
- Create: `packages/shared/src/permissions/role-matrix.test.ts`

- [ ] **Step 1: Write the failing tests for the matrix**

  Create `packages/shared/src/permissions/role-matrix.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { can } from './role-matrix';

  describe('role-matrix — appointment.reopen_done', () => {
    // regras-negocio §9.488: "Reabrir serviço DONE" = AM ou OP
    it('allows AM', () => expect(can('AM', 'appointment.reopen_done')).toBe(true));
    it('allows OP', () => expect(can('OP', 'appointment.reopen_done')).toBe(true));
    it('denies CL_ADMIN', () => expect(can('CL_ADMIN', 'appointment.reopen_done')).toBe(false));
    it('denies INSP', () => expect(can('INSP', 'appointment.reopen_done')).toBe(false));
  });

  describe('role-matrix — config.service_types', () => {
    // fluxo-operacional §2: "Definição de serviços — Responsável: Admin Master"
    it('allows AM', () => expect(can('AM', 'config.service_types')).toBe(true));
    it('denies OP', () => expect(can('OP', 'config.service_types')).toBe(false));
    it('denies CL_ADMIN', () => expect(can('CL_ADMIN', 'config.service_types')).toBe(false));
  });

  describe('role-matrix — user.deactivate', () => {
    // CL_ADMIN is conditionally allowed (tenant setting); matrix records the base capability
    it('allows AM', () => expect(can('AM', 'user.deactivate')).toBe(true));
    it('allows OP', () => expect(can('OP', 'user.deactivate')).toBe(true));
    it('allows CL_ADMIN (conditional check at runtime)', () => expect(can('CL_ADMIN', 'user.deactivate')).toBe(true));
    it('denies CL_USER', () => expect(can('CL_USER', 'user.deactivate')).toBe(false));
    it('denies INSP', () => expect(can('INSP', 'user.deactivate')).toBe(false));
  });

  describe('role-matrix — service_region.list', () => {
    // Use case assertRoles(['AM', 'OP', 'INSP']) — CL roles have no service-region management page
    it('allows AM', () => expect(can('AM', 'service_region.list')).toBe(true));
    it('allows OP', () => expect(can('OP', 'service_region.list')).toBe(true));
    it('allows INSP', () => expect(can('INSP', 'service_region.list')).toBe(true));
    it('denies CL_ADMIN', () => expect(can('CL_ADMIN', 'service_region.list')).toBe(false));
    it('denies CL_USER', () => expect(can('CL_USER', 'service_region.list')).toBe(false));
  });

  describe('role-matrix — audit.view', () => {
    // Feature 020 / router: CL_ADMIN reads PII-masked own-tenant audit logs
    it('allows AM', () => expect(can('AM', 'audit.view')).toBe(true));
    it('allows OP', () => expect(can('OP', 'audit.view')).toBe(true));
    it('allows CL_ADMIN', () => expect(can('CL_ADMIN', 'audit.view')).toBe(true));
    it('denies CL_USER', () => expect(can('CL_USER', 'audit.view')).toBe(false));
    it('denies INSP', () => expect(can('INSP', 'audit.view')).toBe(false));
  });
  ```

- [ ] **Step 2: Run failing tests to confirm they fail before the fix**
  ```bash
  pnpm --filter @properfy/shared test
  ```
  Expected: 6–8 tests fail (the ones testing the new contract against stale matrix values).

- [ ] **Step 3: Update the matrix entries**

  In `packages/shared/src/permissions/role-matrix.ts`, apply these 5 changes:

  **1. `appointment.reopen_done`** — widen AM-only to AM+OP:
  ```typescript
  'appointment.reopen_done': {
    // regras-negocio §9.488: "Reabrir serviço DONE" = AM ou OP.
    // NOTE: this covers InspectionExecution.reopen (sets resumedAt, clears
    // finishedAt). The DONE→DRAFT appointment state transition remains AM-only
    // per state-machine §4.3 and is enforced in execute-status-transition.use-case.ts.
    roles: ['AM', 'OP'],
  },
  ```

  **2. `config.service_types`** — narrow AM+OP to AM-only:
  ```typescript
  'config.service_types': {
    // fluxo-operacional §2: "Definição de serviços — Responsável: Admin Master"
    roles: ['AM'],
  },
  ```

  **3. `user.deactivate`** — add CL_ADMIN with tenant_setting condition:
  ```typescript
  'user.deactivate': {
    roles: ['AM', 'OP', 'CL_ADMIN'],
    condition: 'tenant_setting',
    conditionKey: 'allowClientUserManagement',
  },
  ```

  **4. `service_region.list`** — remove CL_ADMIN and CL_USER:
  ```typescript
  'service_region.list': {
    // AM and OP manage regions globally. INSP lists regions for marketplace
    // and assignment flows (PWA). CL roles have no service-region UI surface.
    roles: ['AM', 'OP', 'INSP'],
  },
  ```

  **5. `audit.view`** — add CL_ADMIN:
  ```typescript
  'audit.view': {
    // Feature 020: CL_ADMIN reads own-tenant audit log (PII-masked rows).
    // Backend enforces tenant scope — CL_ADMIN cannot see other tenants' events.
    roles: ['AM', 'OP', 'CL_ADMIN'],
  },
  ```

- [ ] **Step 4: Run the tests again — all should pass**
  ```bash
  pnpm --filter @properfy/shared test
  ```
  Expected: all tests pass.

- [ ] **Step 5: Typecheck shared package**
  ```bash
  pnpm --filter @properfy/shared typecheck
  ```
  Expected: no errors.

- [ ] **Step 6: Commit**
  ```bash
  git add packages/shared/src/permissions/role-matrix.ts packages/shared/src/permissions/role-matrix.test.ts
  git commit -m "fix(rbac): reconcile shared role matrix — reopen_done +OP, service_types AM-only, user.deactivate +CL_ADMIN, service_region.list -CL roles, audit.view +CL_ADMIN"
  ```

---

## Task 3 — Fix OP tenant scope in `assertTenantScope` and remove contradictory comments

**Why:** `AuthorizationService.assertTenantScope` bypasses for AM but not for OP, even though OP is documented as cross-tenant (null tenantId) throughout the codebase. Any call to `assertTenantScope` with an OP actor whose tenantId is null will incorrectly throw `TENANT_SCOPE_VIOLATION`. The existing test uses OP with an assigned tenantId (not the real production model). `bulk-edit-appointments.use-case.ts` has a wrong comment saying "OP is tenant-scoped".

**Files:**
- Modify: `apps/backend/src/shared/domain/authorization.service.ts`
- Modify: `apps/backend/tests/unit/shared/authorization.service.test.ts`
- Modify: `apps/backend/src/modules/appointment/application/use-cases/bulk-edit-appointments.use-case.ts`

- [ ] **Step 1: Add a failing test for OP null-tenantId bypass**

  In `apps/backend/tests/unit/shared/authorization.service.test.ts`, inside the `assertTenantScope` describe block, add:

  ```typescript
  it('should bypass for OP with null tenantId (cross-tenant role)', () => {
    const actor = makeAuthContext({ role: 'OP', tenantId: null });
    expect(() =>
      svc.assertTenantScope(actor, 'any-tenant', { action: 'test', entityType: 'Test' }),
    ).not.toThrow();
  });
  ```

- [ ] **Step 2: Run the test — confirm it fails**
  ```bash
  pnpm --filter backend test -- --run tests/unit/shared/authorization.service.test.ts
  ```
  Expected: the new test fails (OP with null tenantId currently throws TENANT_SCOPE_VIOLATION).

- [ ] **Step 3: Fix `assertTenantScope` in `authorization.service.ts`**

  Replace the existing comment and first two guard lines of `assertTenantScope`:

  ```typescript
  assertTenantScope(
    actor: AuthContext,
    targetTenantId: string,
    context: AuthorizationContext,
  ): void {
    // AM and OP are platform-wide cross-tenant roles. Their JWT carries
    // tenantId: null (no provisioning flow assigns a tenant_id to OP users —
    // see auth-middleware.ts QA regression 2026-04-19). They filter results
    // via explicit query params or business logic, not via JWT tenant pinning.
    if (actor.role === 'AM' || actor.role === 'OP') return;
    if (actor.tenantId === targetTenantId) return;
    // ... rest of method is unchanged
  ```

- [ ] **Step 4: Update the stale OP test in `authorization.service.test.ts`**

  The existing test `'should throw when actor tenant does not match target tenant'` uses `role: 'OP'`. After the fix, OP bypasses — this test is wrong. Change `role: 'OP'` to `role: 'CL_ADMIN'`:

  ```typescript
  it('should throw when actor tenant does not match target tenant', () => {
    const actor = makeAuthContext({ role: 'CL_ADMIN', tenantId: 'tenant-1' });
    expect(() =>
      svc.assertTenantScope(actor, 'tenant-2', { action: 'test', entityType: 'Test' }),
    ).toThrow(expect.objectContaining({ code: 'TENANT_SCOPE_VIOLATION', statusCode: 403 }));
  });
  ```

  Also update the passing test `'should pass when actor tenant matches target tenant'` — change its role from `OP` to `CL_ADMIN` too, since OP bypass makes the match-check unreachable for OP:

  ```typescript
  it('should pass when actor tenant matches target tenant', () => {
    const actor = makeAuthContext({ role: 'CL_ADMIN', tenantId: 'tenant-1' });
    expect(() =>
      svc.assertTenantScope(actor, 'tenant-1', { action: 'test', entityType: 'Test' }),
    ).not.toThrow();
  });
  ```

- [ ] **Step 5: Fix the wrong comment in `bulk-edit-appointments.use-case.ts`**

  Find this line in `apps/backend/src/modules/appointment/application/use-cases/bulk-edit-appointments.use-case.ts`:
  ```typescript
  const tenantId = actor.tenantId; // OP is tenant-scoped; AM may be null
  ```
  Change it to:
  ```typescript
  // AM and OP are both cross-tenant (tenantId is null in their JWT).
  // findById called with null tenantId returns results across all tenants —
  // the caller is responsible for narrowing scope via the ids array.
  const tenantId = actor.tenantId;
  ```

- [ ] **Step 6: Run all authorization service tests**
  ```bash
  pnpm --filter backend test -- --run tests/unit/shared/authorization.service.test.ts
  ```
  Expected: all tests pass.

- [ ] **Step 7: Typecheck**
  ```bash
  pnpm --filter backend typecheck
  ```
  Expected: no errors.

- [ ] **Step 8: Commit**
  ```bash
  git add \
    apps/backend/src/shared/domain/authorization.service.ts \
    apps/backend/tests/unit/shared/authorization.service.test.ts \
    apps/backend/src/modules/appointment/application/use-cases/bulk-edit-appointments.use-case.ts
  git commit -m "fix(rbac): OP bypasses assertTenantScope (cross-tenant role); fix contradictory comments"
  ```

---

## Task 4 — Gate `UserDetailDrawer` deactivate button on actor role

**Why:** `UserDetailDrawer` renders the deactivate button whenever `user.status === 'ACTIVE'`, regardless of who is viewing. Roles that cannot deactivate users (CL_USER, INSP) still see the button. After Task 2, `canPerform('user.deactivate')` returns true for AM, OP, and CL_ADMIN — the button is shown to those roles and hidden from CL_USER/INSP.

**Files:**
- Modify: `apps/web/src/features/users/components/UserDetailDrawer.tsx`
- Modify: `apps/web/src/features/users/components/UserDetailDrawer.test.tsx`

- [ ] **Step 1: Add failing tests for role-based deactivate visibility**

  In `apps/web/src/features/users/components/UserDetailDrawer.test.tsx`, add a new describe block after the existing ones. The existing `vi.mock('@/hooks/useAuth', ...)` already sets `role: 'AM'` — for the new tests override it per-test:

  ```typescript
  import { usePermissions } from '@/hooks/usePermissions';

  // Add at the top of the file (after existing vi.mock blocks):
  vi.mock('@/hooks/usePermissions', () => ({
    usePermissions: vi.fn(),
  }));

  // In the describe block, add:
  describe('UserDetailDrawer — deactivate button role visibility', () => {
    it('shows deactivate button to AM', () => {
      vi.mocked(usePermissions).mockReturnValue({
        role: 'AM',
        hasRole: (...roles: any[]) => roles.includes('AM'),
        canPerform: (action: string) => action === 'user.deactivate',
      });
      renderDrawer({ userId: 'usr-01', open: true });
      expect(screen.getByLabelText('Deactivate User')).toBeInTheDocument();
    });

    it('shows deactivate button to OP', () => {
      vi.mocked(usePermissions).mockReturnValue({
        role: 'OP',
        hasRole: (...roles: any[]) => roles.includes('OP'),
        canPerform: (action: string) => action === 'user.deactivate',
      });
      renderDrawer({ userId: 'usr-01', open: true });
      expect(screen.getByLabelText('Deactivate User')).toBeInTheDocument();
    });

    it('hides deactivate button from CL_USER', () => {
      vi.mocked(usePermissions).mockReturnValue({
        role: 'CL_USER',
        hasRole: (...roles: any[]) => roles.includes('CL_USER'),
        canPerform: (_action: string) => false,
      });
      renderDrawer({ userId: 'usr-01', open: true });
      expect(screen.queryByLabelText('Deactivate User')).not.toBeInTheDocument();
    });

    it('hides deactivate button from INSP', () => {
      vi.mocked(usePermissions).mockReturnValue({
        role: 'INSP',
        hasRole: (...roles: any[]) => roles.includes('INSP'),
        canPerform: (_action: string) => false,
      });
      renderDrawer({ userId: 'usr-01', open: true });
      expect(screen.queryByLabelText('Deactivate User')).not.toBeInTheDocument();
    });
  });
  ```

  Note: the existing tests in the file use `useAuth` mock (role: AM) but NOT `usePermissions`. After adding the new mock, the existing tests will need the mock to be set. Add a `beforeEach` that sets a default for `usePermissions` in the top-level describe scope, or set it in each existing test. Simplest: add it at the very top of the file (before the describes):
  ```typescript
  // after all vi.mock blocks:
  beforeEach(() => {
    vi.mocked(usePermissions).mockReturnValue({
      role: 'AM',
      hasRole: (...roles: any[]) => roles.includes('AM'),
      canPerform: (action: string) => ['user.deactivate', 'user.update'].includes(action),
    });
  });
  ```

- [ ] **Step 2: Run the failing tests**
  ```bash
  cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 npx vitest run UserDetailDrawer
  ```
  Expected: the 4 new deactivate-visibility tests fail.

- [ ] **Step 3: Update `UserDetailDrawer.tsx` to gate on `canPerform`**

  In `apps/web/src/features/users/components/UserDetailDrawer.tsx`:

  Add the import at the top:
  ```typescript
  import { usePermissions } from '@/hooks/usePermissions';
  ```

  Inside the component function (after the existing hooks), add:
  ```typescript
  const { canPerform } = usePermissions();
  ```

  Find the existing deactivate button render:
  ```tsx
  {user.status === 'ACTIVE' ? (
    <Button
      variant="icon"
      onClick={() => setShowDeactivateConfirm(true)}
      aria-label="Deactivate User"
      disabled={isDeactivating}
    >
      <i className="mdi mdi-account-off-outline text-xl text-error" />
    </Button>
  ) : null}
  ```

  Change it to:
  ```tsx
  {user.status === 'ACTIVE' && canPerform('user.deactivate') ? (
    <Button
      variant="icon"
      onClick={() => setShowDeactivateConfirm(true)}
      aria-label="Deactivate User"
      disabled={isDeactivating}
    >
      <i className="mdi mdi-account-off-outline text-xl text-error" />
    </Button>
  ) : null}
  ```

- [ ] **Step 4: Run tests — all should pass**
  ```bash
  cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 npx vitest run UserDetailDrawer
  ```
  Expected: all tests pass.

- [ ] **Step 5: Typecheck web**
  ```bash
  pnpm --filter web typecheck
  ```
  Expected: no errors.

- [ ] **Step 6: Commit**
  ```bash
  git add \
    apps/web/src/features/users/components/UserDetailDrawer.tsx \
    apps/web/src/features/users/components/UserDetailDrawer.test.tsx
  git commit -m "fix(rbac): gate UserDetailDrawer deactivate button on canPerform('user.deactivate')"
  ```

---

## Task 5 — Add TimeSlotConfigPage role and route guard tests

**Why:** The existing `TimeSlotConfigPage.test.tsx` has only one test (AM without tenant selected). It does not cover CL_ADMIN's view (which should show the data table directly without a tenant selector) nor does it prove OP and CL_USER have the correct route-level access. The route guard for `/time-slots` allows AM/OP/CL_ADMIN and should be tested.

**Files:**
- Modify: `apps/web/src/features/appointments/pages/TimeSlotConfigPage.test.tsx`
- Create: `apps/web/src/features/appointments/pages/TimeSlotConfigPage.route-guard.test.tsx`

- [ ] **Step 1: Extend `TimeSlotConfigPage.test.tsx` with CL_ADMIN and OP views**

  The existing mock setup is at the top of the file. The `useAuth` mock currently returns `{ role: 'AM', tenantId: null }`. To test CL_ADMIN, we need to override `useAuth` per-test or refactor the mock.

  Replace the static `vi.mock('@/hooks/useAuth', ...)` with a `vi.fn()` pattern and add new tests:

  ```typescript
  import { describe, expect, it, vi, beforeEach } from 'vitest';
  import { render, screen } from '@testing-library/react';
  import { TimeSlotConfigPage } from './TimeSlotConfigPage';

  const mockUseAuth = vi.fn();
  vi.mock('@/hooks/useAuth', () => ({
    useAuth: () => mockUseAuth(),
  }));

  vi.mock('@/hooks/useSnackbar', () => ({
    useSnackbar: () => ({
      showSuccess: vi.fn(),
      showError: vi.fn(),
    }),
  }));

  vi.mock('@/hooks/useFormOptions', () => ({
    useFormOptions: () => ({
      options: [],
      isLoading: false,
    }),
  }));

  vi.mock('../hooks/useTimeSlotAdmin', () => ({
    useTimeSlotList: () => ({
      data: [],
      isLoading: false,
      isError: false,
      errorMessage: null,
      refetch: vi.fn(),
    }),
    useTimeSlotSave: () => ({
      save: vi.fn(),
      isSaving: false,
    }),
    useTimeSlotDelete: () => ({
      remove: vi.fn(),
      isDeleting: false,
    }),
  }));

  beforeEach(() => {
    // Default: AM without tenant selected (cross-tenant role with null tenantId)
    mockUseAuth.mockReturnValue({ user: { id: 'am-1', role: 'AM', tenantId: null } });
  });

  describe('TimeSlotConfigPage', () => {
    it('shows a tenant-selection message and disables creation for AM without tenant selected', () => {
      render(<TimeSlotConfigPage />);
      expect(screen.getByText('Select an agency to view time slots.')).toBeInTheDocument();
    });

    it('shows data table for AM when tenant is selected (tenantId set)', () => {
      mockUseAuth.mockReturnValue({ user: { id: 'am-1', role: 'AM', tenantId: null } });
      // The page checks selectedTenantId (state) not tenantId from auth for AM;
      // when no tenant is selected, FilterRequiredState shows. This confirms
      // cross-tenant AM must pick a tenant before data loads.
      render(<TimeSlotConfigPage />);
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.getByText('Select an agency to view time slots.')).toBeInTheDocument();
    });

    // CL_ADMIN is scoped to their own tenant — no tenant selector needed.
    // The page resolves tenantId from the JWT and shows the table directly.
    it('shows data table directly for CL_ADMIN (no tenant selection required)', () => {
      mockUseAuth.mockReturnValue({ user: { id: 'cl-1', role: 'CL_ADMIN', tenantId: 'tenant-1' } });
      render(<TimeSlotConfigPage />);
      expect(screen.queryByText('Select an agency to view time slots.')).not.toBeInTheDocument();
      // DataTable renders even with empty data (shows empty message)
      expect(screen.getByText('No time slots configured yet')).toBeInTheDocument();
    });

    it('does NOT show tenant filter for CL_ADMIN', () => {
      mockUseAuth.mockReturnValue({ user: { id: 'cl-1', role: 'CL_ADMIN', tenantId: 'tenant-1' } });
      render(<TimeSlotConfigPage />);
      expect(screen.queryByText('Tenant')).not.toBeInTheDocument();
    });

    it('shows New Time Slot button for CL_ADMIN', () => {
      mockUseAuth.mockReturnValue({ user: { id: 'cl-1', role: 'CL_ADMIN', tenantId: 'tenant-1' } });
      render(<TimeSlotConfigPage />);
      expect(screen.getByText('New Time Slot')).toBeInTheDocument();
    });

    it('shows data table directly for OP who has a selected tenant', () => {
      // OP is treated as isAdminUser=true; they need to select a tenant.
      // With no tenant selected, shows the filter-required state.
      mockUseAuth.mockReturnValue({ user: { id: 'op-1', role: 'OP', tenantId: null } });
      render(<TimeSlotConfigPage />);
      expect(screen.getByText('Select an agency to view time slots.')).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Create the route guard test**

  Create `apps/web/src/features/appointments/pages/TimeSlotConfigPage.route-guard.test.tsx`:

  ```typescript
  import { describe, it, expect, vi } from 'vitest';
  import { render, screen } from '@testing-library/react';
  import { MemoryRouter, Route, Routes } from 'react-router-dom';
  import { AuthGuard } from '@/app/AuthGuard';
  import { UserRole } from '@properfy/shared';

  const mockUseAuth = vi.fn();
  vi.mock('@/hooks/useAuth', () => ({
    useAuth: () => mockUseAuth(),
  }));

  function renderTimeSlotsRoute(role: string) {
    mockUseAuth.mockReturnValue({
      user: { id: 'u-1', name: 'Test', email: 't@t.com', role, tenantId: role === 'CL_ADMIN' ? 'tenant-1' : null },
      isLoading: false,
    });
    return render(
      <MemoryRouter
        initialEntries={['/time-slots']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route
            path="/time-slots"
            element={
              <AuthGuard roles={[UserRole.AM, UserRole.OP, UserRole.CL_ADMIN]}>
                <div>Time Slots Page</div>
              </AuthGuard>
            }
          />
          <Route path="/dashboard" element={<div>Dashboard Redirect</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  describe('time-slots route guard', () => {
    it('AM can access /time-slots', () => {
      renderTimeSlotsRoute('AM');
      expect(screen.getByText('Time Slots Page')).toBeInTheDocument();
    });

    it('OP can access /time-slots', () => {
      renderTimeSlotsRoute('OP');
      expect(screen.getByText('Time Slots Page')).toBeInTheDocument();
    });

    it('CL_ADMIN can access /time-slots', () => {
      renderTimeSlotsRoute('CL_ADMIN');
      expect(screen.getByText('Time Slots Page')).toBeInTheDocument();
    });

    it('CL_USER is redirected from /time-slots', () => {
      renderTimeSlotsRoute('CL_USER');
      expect(screen.getByText('Dashboard Redirect')).toBeInTheDocument();
      expect(screen.queryByText('Time Slots Page')).not.toBeInTheDocument();
    });

    it('INSP is redirected from /time-slots', () => {
      renderTimeSlotsRoute('INSP');
      expect(screen.getByText('Dashboard Redirect')).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 3: Run the new tests**
  ```bash
  cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 npx vitest run TimeSlotConfigPage
  ```
  Expected: all tests pass. The page logic (`isAdminUser = AM || OP`, tenant resolution for CL_ADMIN) already handles these cases correctly.

- [ ] **Step 4: Typecheck**
  ```bash
  pnpm --filter web typecheck
  ```
  Expected: no errors.

- [ ] **Step 5: Commit**
  ```bash
  git add \
    apps/web/src/features/appointments/pages/TimeSlotConfigPage.test.tsx \
    apps/web/src/features/appointments/pages/TimeSlotConfigPage.route-guard.test.tsx
  git commit -m "test(rbac): add CL_ADMIN view and route-guard tests for TimeSlotConfigPage"
  ```

---

## Final Verification

Run the full verification suite after all tasks are complete:

```bash
pnpm --filter @properfy/shared test
pnpm --filter @properfy/shared typecheck
pnpm --filter backend typecheck
pnpm --filter backend test -- --run tests/unit/shared/
pnpm --filter backend test -- --run tests/unit/appointment-time-slot/
pnpm --filter backend test -- --run tests/unit/billing/void-financial-entry.use-case.test.ts
pnpm --filter backend test -- --run tests/unit/inspector-execution/reopen-execution.use-case.test.ts
pnpm --filter web typecheck
cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 npx vitest run TimeSlotConfigPage
cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 npx vitest run UserDetailDrawer
cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 npx vitest run Sidebar
```

---

## Intentional Asymmetry (Documented)

| Asymmetry | Why it is intentional |
|---|---|
| `config.notification_templates` in matrix = `['AM','OP','CL_ADMIN']` but router = `[AM, OP]` | CL_ADMIN cannot reach the sidebar item (Configuration submenu is AM/OP only in the sidebar) and the route guard correctly denies them. The matrix entry is overly broad but does not create a security gap because the route guard is the active enforcement layer. Fixing it was out of scope for this round. |
| `user.deactivate` condition for CL_ADMIN not enforced in UI | The frontend cannot read `allowClientUserManagement` from the auth context without an extra API call. Showing the button to CL_ADMIN (whose `canPerform` returns true) and letting the API enforce the setting is an acceptable UX trade-off. The button will still work when the setting is on, and the API returns a clear error when it is off. |
| OP accesses `/v1/time-slots` via route handler without explicit role check | By design: the use case's `assertRoles(['AM','OP','CL_ADMIN'])` is the authoritative guard. Route-handler-level role checks were removed as they were duplicative and diverged from the use case. The only enforcement layer needed is the use case. |

---

## Residual Risks

1. `bulk-edit-appointments.use-case.ts` passes `actor.tenantId` (null for OP) to `appointmentRepo.findById`. If the repository implementation treats null tenantId differently from a missing filter, OP bulk-edit could return unexpected results. This is a repository-layer concern, not fixed in this plan. Recommend an integration test for OP bulk-edit with a cross-tenant scenario.

2. INSP users have no web route for service regions (the web router allows AM/OP only for `/service-regions`). They access region data via the PWA. If a future web surface adds region visibility for INSP, the matrix already has INSP in `service_region.list` — no matrix change needed, just a route guard update.
