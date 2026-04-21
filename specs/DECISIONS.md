# Cross-Feature Decisions Log

**Last Updated**: 2026-04-21 (final hardening pass)
**Status**: Living document — append-only. Each entry captures a product/technical decision that supersedes or resolves ambiguity between specs and implementation.

> Entries are ordered newest-first. Each decision references the specs/features it affects, the implementation landing, and the rationale. When specs later get edited to reflect the decision, the DEC entry is annotated with "(absorbed)".

---

## DEC-003 — OP role scope restored to cross-tenant

**Date**: 2026-04-19 (QA revalidation + auth-middleware fix landed in staging commit `bfdef83`).

**Decision**: OP is **cross-tenant** per `CLAUDE.md §6` ("Operator, cross-tenant, operational team"). OP JWTs carry `tenant_id: null`. Use cases that need tenant scoping for OP either (a) honour a `?tenantId=` query filter (list endpoints: appointments, properties, service regions, etc.) or (b) pin to `actor.tenantId` when it's present. AM is the other platform-wide role.

**Supersedes**: every "OP is tenant-scoped" / "Sprint 1 W-4-IMPL (CORRECTION-001 close-it, 2026-04-13)" note embedded in the following specs:

- `specs/001-identity-access/spec.md`
- `specs/001-identity-access/contracts/user-endpoints.md`
- `specs/002-tenants-branches/plan.md`
- `specs/005-service-groups-marketplace/plan.md`
- `specs/009-notifications/spec.md`, `tasks.md`, `contracts/notification-endpoints.md`
- `specs/015-permissions-rbac-matrix/spec.md`, `research.md`
- `specs/021-contacts/plan.md`
- `specs/GAPS.md` (entry for CORRECTION-001)

**Rationale**: the `CORRECTION-001 close-it` on 2026-04-13 introduced an `auth-middleware` guard that rejected any OP JWT without a `tenantId`. Since nothing in the provisioning flow assigns a `tenant_id` to OP users, the guard broke every OP request as soon as staging picked up the change. QA flagged it on 2026-04-19 as a release-blocking regression. Revert + QA retest confirmed OP cross-tenant is the correct operating contract, consistent with the canonical `CLAUDE.md`. The list endpoints that had coerced `actor.tenantId!` for OP (dropping `?tenantId=` filters silently) were fixed at the same time (commit `bfdef83`, Bug C-B2).

**Implementation**:
- `apps/backend/src/shared/interfaces/auth-middleware.ts` — guard removed; comment records the contract.
- `apps/backend/src/modules/appointment/application/use-cases/list-appointments.use-case.ts` — OP branch now honours `filters.tenantId`.
- `apps/backend/src/modules/service-region/application/use-cases/list-service-regions.use-case.ts` — same pattern for service regions (Bug C-B1).

**Follow-up**: the per-spec "tenant-scoped" notes can be edited out in a future editorial pass; this entry is the source of truth for now.

---

## DEC-002 — `/time-slots` is an admin management page

**Date**: 2026-04-21 (final hardening pass).

**Decision**: The `/time-slots` standalone page is strictly for managing (CRUD) appointment time slots. Permitted roles: **AM, OP, CL_ADMIN** (backend `CreateAppointmentTimeSlotUseCase` / update / delete already enforce this). CL_USER cannot access this page or the admin-list endpoint. CL_USER reads time slots only through **`GET /v1/time-slots/effective`**, which is consumed by the appointment form to populate dropdowns, and which correctly includes CL_USER (spec `012-appointment-time-slot/contracts/time-slot-endpoints.md`, FR-077).

**Affected surface**:
- **Route guard** (`apps/web/src/app/router.tsx`): `[AM, OP, CL_ADMIN]` — already correct.
- **Sidebar** (`apps/web/src/components/shell/Sidebar.tsx`): under the Configuration submenu gated to AM/OP — already correct.
- **Backend `list` use case** (`apps/backend/src/modules/appointment-time-slot/application/use-cases/list-appointment-time-slots.use-case.ts`): previously allowed CL_USER by mistake; tightened to `[AM, OP, CL_ADMIN]` to match spec 012 contracts line 56 ("CL_USER and INSP are forbidden").
- **Backend `list-effective` use case**: remains open to CL_USER for form consumption.

**Rationale**: the previous state (admin page route=AM/OP/CL_ADMIN, backend list accepted CL_USER as dead code) created a phantom mismatch that kept surfacing during RBAC audits. Aligning the backend with the spec removes ambiguity and closes a minor defense-in-depth gap.

---

## DEC-001 — Contacts standalone page accessible to all four roles (read)

**Date**: 2026-04-21 (final hardening pass).

**Decision**: `/tenant-contacts` (the standalone Contacts page) is readable by **AM, OP, CL_ADMIN, CL_USER**, with CL tenant-scoping enforced by the backend. Contact create/update is restricted to **AM, OP, CL_ADMIN** per spec `021-contacts/spec.md` FR-001. CL_USER continues to create contacts **inline** during appointment creation (appointment form autocomplete → new contact path) — it does not require the standalone page for write.

**Affected surface**:
- **Backend list** (`apps/backend/src/modules/appointment/application/use-cases/list-appointment-contacts.use-case.ts`): already allows `[AM, OP, CL_ADMIN, CL_USER]`.
- **Route guard** (`apps/web/src/app/router.tsx`): already allows `[AM, OP, CL_ADMIN, CL_USER]` (set during Block B/C round).
- **Sidebar** (`apps/web/src/components/shell/Sidebar.tsx`): **updated** — Contacts is now a top-level nav item gated to all four roles. It was previously buried under the admin "Users" submenu scoped to AM/OP, which hid a feature CL roles had full access to.

**Rationale**: the read API was already reachable by CL users via tenant-scoped listing; hiding the entry point in the sidebar created the exact "route accepts / sidebar hides" ambiguity flagged during the final hardening pass. Exposing the nav item resolves the mismatch without changing any permission model.
