# Phase 0 — Research: Dashboard Alerts (027)

**Date**: 2026-05-24
**Status**: All decisions resolved before this plan was generated. Spec went through `/speckit.clarify`, was reviewed by the Crítico agent and the human, and was approved.

This document records the design decisions and the alternatives evaluated, so future maintainers can understand WHY the implementation looks the way it does.

---

## D1. API surface: one endpoint or many?

**Decision**: Extend the existing `GET /v1/dashboard/stats` with new fields. Add a top-level `inspectorBreakdowns: { ... } | null` section. (Spec §4 "Option C".)

**Rationale**:
- Single round-trip for the dashboard reduces TanStack Query overhead and avoids waterfall renders.
- Frontend already consumes one `useDashboardStats` query; widening the response is transparent to the cache layer.
- Backwards compatible: existing clients that don't read the new fields are unaffected (openapi-fetch ignores unknown keys; new keys are additive, not type-narrowing).
- Aligns with Constitution IV (Contract-First) — one schema, one source of truth.

**Alternatives considered**:
- **Separate endpoint `GET /v1/dashboard/inspector-breakdowns`** — rejected: doubles the request fan-out, complicates loading state on the dashboard page, requires duplicated auth/authorization plumbing.
- **GraphQL-like field selection on the existing endpoint** — rejected: introduces a query-shape concept the codebase doesn't have. Premature abstraction for one consumer.

---

## D2. RBAC signal: HTTP 403 vs. nullable section

**Decision**: Return `inspectorBreakdowns: null` for CL_ADMIN and CL_USER. The endpoint always returns 200 with the same top-level shape; the section is nullable. (Null-as-permission-signal.)

**Rationale**:
- CL_* users CAN see the dashboard; they just don't see the inspector view. Returning 403 would block the whole page or force the frontend to retry with a smaller request, both of which are worse UX.
- The frontend `{stats.inspectorBreakdowns && <Section ... />}` pattern is one line and idiomatic.
- The schema documents the contract: `nullable()` says "either an object or null" — neither client nor server needs role-aware branching at the consumer site.

**Alternatives considered**:
- **Omit the key entirely for CL_*** — rejected: Zod prefers explicit shape over optionality for top-level discriminators; the contract is clearer when the key always exists with type `Section | null`.
- **403 on a separate `/v1/dashboard/inspector-breakdowns` endpoint** — rejected with the same reasoning as D1.

---

## D3. "This week" boundary (REVISED 2026-05-24 after Planejador round 1)

**Decision**: Monday 00:00:00.000 to Sunday 23:59:59.999 **server-local time**, derived from `new Date()` at request time. "Tomorrow" is the server's local next calendar day (Mon 00:00 to next-day 23:59:59.999, local time).

**Rationale (REVISED)**:
- The spec explicitly defines "Tomorrow" as "the calendar day after today (local date of the server)" — `spec.md` §2 line 29. Picking UTC contradicts the spec.
- The existing `doneThisMonth` query already uses server-local arithmetic via `new Date(year, month, 1)`. Aligning the new week boundary to server-local keeps a single canonical convention across the dashboard.
- The frontend drill-down link helpers (`weekRange()` and `monthRange()` in `DashboardSummaryCards.tsx`) call `toLocalISODate(new Date())`. UTC for backend queries would silently disagree with the link filters at the day boundary.
- The Planejador (round 1) flagged that the previous UTC choice would cause card counts, drill-down links, and the Tomorrow label to disagree near timezone boundaries. Aligning everything to server-local closes this gap.
- The production deployment runs in a single region; "server-local" and "operations-team local" agree in practice. Tenant-local timezone remains out of scope.

**Alternatives considered**:
- **UTC** (previous v1 of this plan) — rejected: contradicts spec; produces drift against existing frontend conventions; flagged by Planejador.
- **Tenant-local time using `tenant.timezone`** — rejected: tenants don't store a timezone today. Adding one is out of scope. Defer to a future feature if SLAs require per-tenant week alignment.
- **ISO calendar week starting Sunday** — rejected: the human approved Monday-Sunday explicitly in the design review.

**Two-context contract** (made honest after Planejador round 2): the backend uses **server-local** for all six query boundaries (`currentWeekRange()`, `tomorrowRange()`). The frontend uses **browser-local** for its drill-down link filters (`weekRange()` / `monthRange()` via `toLocalISODate(new Date())`) and the `tomorrowLabel` display string. In production these two contexts agree because the deployment region matches the operational user's region; outside that single-region assumption the label and the count can disagree by one calendar day for ~one hour at midnight. This limitation is explicitly documented in `plan.md` §Date-boundary semantics and `quickstart.md` §Known acceptable edge cases — it is NOT a bug; closing it requires either a `tenants.timezone` column or returning the server-local tomorrow string from the API (both FUTURE GAPs).

---

## D4. "Done" date proxy: `updated_at` vs. a dedicated `done_at`

**Decision**: Use `updated_at` as the proxy for "done date", consistent with the existing `doneThisMonth` query. Do NOT add a `done_at` column.

**Rationale**:
- A new column requires a migration, backfill, and a state-machine wiring change — all out of scope for a dashboard feature.
- The existing metric (`doneThisMonth`) already accepts this approximation, and stakeholders have validated the resulting numbers for a year.
- Edge case (a DONE appointment whose `updated_at` later moves because of an unrelated update, e.g. a financial-entry write) is rare and tolerable for a dashboard view.

**Alternatives considered**:
- **Add `done_at` column** — deferred to a FUTURE GAP. Track separately if the stakeholder asks for stricter semantics.
- **Use the most recent audit-log entry of the DONE transition** — rejected: complex JOIN for a hot-path query; we are not paying that cost for a metric that ships green today with the proxy.

---

## D5. Inspector-name resolution: SQL JOIN vs. follow-up findMany

**Decision**: Run `groupBy(inspector_id)` to get counts, then one `findMany({ where: { id: { in: union_of_ids } } })` to resolve names, and merge in application code.

**Rationale**:
- Prisma's `groupBy` does not support joins natively — using it would require a raw SQL query, which the codebase avoids for maintainability.
- Cardinality is small (~10–50 inspectors per agency, typically <100 platform-wide).
- One additional indexed `findMany` is <5ms in our measurements on similar fan-outs in this codebase.
- Composes cleanly with the existing `Promise.all` pattern.

**Alternatives considered**:
- **Raw SQL JOIN** — rejected: breaks the "idiomatic Prisma" convention of the file; the cost saving is negligible.
- **Three separate findManys (one per list)** — rejected: redundant DB calls; the union-of-ids optimization is cheap.

---

## D6. Alert thresholds: where computed?

**Decision**: Server-side, in `prisma-dashboard.repository.ts`. The frontend receives `alertLevel: 'yellow' | 'red' | null` and renders it directly.

**Rationale**:
- Single source of truth for the threshold business rule.
- The frontend cannot derive different bands by accident; the API enforces the contract.
- Changing the thresholds in the future is a backend-only change (no client update required).

**Alternatives considered**:
- **Client-side computation** — rejected: rule duplication across web and PWA; risk of drift.
- **Server-driven thresholds in a config table** — rejected: premature; thresholds are stable per spec.

---

## D7. Empty state: server returns `[]` or omits the list?

**Decision**: Always return arrays (possibly empty). The empty state lives in the UI component.

**Rationale**:
- Schema uniformity: `z.array(...)` is simpler than `z.array(...).optional()`.
- The component renders "No inspections" when the array is empty.
- Distinct from `inspectorBreakdowns: null` (which means "not authorized" / "do not render the section at all").

---

## Open questions

None. All ambiguities were resolved during `/speckit.clarify` and the human design review.

---

## References

- Spec: `./spec.md`
- Design review note (Maestri): `contexto-4` (decisions approved by human on 2026-05-24)
- Existing endpoint pattern: `apps/backend/src/modules/dashboard/`
- Constitution: `.specify/memory/constitution.md` (v1.4.0)
