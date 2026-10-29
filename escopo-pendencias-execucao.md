# Client Scope — Pending Work Backlog & Execution Order

Derived from `escopo-cliente-gap-audit.md` (item-by-item audit of "Escopo Completo Properfy - CLIENTE.md", first pass 2026-07-22, updated 2026-08-03, 2026-08-04 and 2026-09-08). Each item below is scoped for ONE dedicated Claude session, in execution order.

**Recovery note:** this file (and the gap-audit file) were deleted from the working tree between 2026-07-24 and 2026-08-03 without ever being committed. Both were reconstructed from conversation history on 2026-08-03. **Commit these two files to `develop` once reviewed** so a future session/linter can't silently lose them again — they are referenced by name from `CLAUDE.md`, `AGENTS.md` and `AGENT.md`.

**Legend:**
- 🐛 bug · 🧩 UI/additive (safe, no flow change) · ⚠️ **REQUIRES ANALYSIS** — changes flow, adds statuses/categories/enums or widens RBAC. These MUST go through plan mode / spec (brainstorm → plan approval) before any code, and RBAC changes follow the narrowest-fix-only rule.
- Every implementation session must follow project rules: worktree from `develop`, TDD, lint+typecheck+tests green, PR → `develop`, **max 150 changed files per PR** (`git diff --stat origin/develop... | tail -1`).
- ⚠️ **Re-verify before starting any Phase 2 item.** 470 commits landed on `develop` between 2026-07-24 and 2026-08-04 across two update passes; only commit-message-visible changes plus the project's own `MEMORY.md` index were swept. Do a quick single-agent re-check of the item's section before writing code — the "Done/Pending" split below may be stale in ways this pass didn't catch. **The project's memory index (`MEMORY.md`) is now more current and more detailed than this file's own tracking** — cross-reference the memory entries linked from each item before starting, they often have implementation gotchas this file only summarizes.

**Execution order rationale:** Phase 0 = production-flow bug (now closed). Phase 1 = additive gaps with no flow impact. Phase 2 = features needing prior analysis, ordered by client-visibility/dependency. Phase 3 = items blocked on client/product decisions.

---

## Phase 0 — Bug fix — ✅ COMPLETE

### 01. Notify tenant automatically when inspector accepts an offer — ✅ DONE (PR #951, merged 2026-07-23)
- **Resolution:** `NotifyOnGroupAcceptedSubscriber` added (subscribes to group acceptance AND manual assignment), with unit + integration tests. No further work.

---

## Phase 1 — Additive gaps, no flow change

### 02. Property management completion (delete UI, columns, city filter)
- **Type:** 🧩
- **Status:** ⚠️ not re-verified since 2026-07-22 — re-check before starting (property module had several fixes land: `fix/import-property-branch`, `fix/appointment-form-regressions` touched property/branch scoping — unclear if they touch list columns or delete UI).
- **Description:** Doc §4.4. Delete exists in backend (`DELETE /v1/properties/:propertyId`, guarded for open appointments) but had no UI. List lacked columns Additional, m² Private, Furniture, Linen (data exists on entity) and a discrete city/suburb filter.
- **Prompt:**
  > Read escopo-pendencias-execucao.md item 02 and the §4.4 section of escopo-cliente-gap-audit.md. First verify current state (properties list/detail may have changed since 2026-07-22 — check for a delete button, the listed columns, and a city filter before assuming they're still missing). In apps/web properties feature, close whatever remains: (1) Delete action on PropertyTable rows and PropertyDetailPage calling DELETE /v1/properties/:propertyId, with confirmation dialog and clear error when the backend rejects due to open appointments; (2) list columns Additional (addressLine2), m² Private, Furnished, Linen; (3) suburb filter on PropertyFilters + backend list param. TDD, worktree from develop, PR → develop, max 150 changed files.

### 03. Appointments list: remaining filters, columns and Excel export — ✅ DONE (PR #1085, merged 2026-08-04)
- **Resolution:** "feat(appointments): close the list filters, columns and Excel export gap" — added suburb filter (`list-appointment-suburbs.use-case.ts`), `export-appointments.use-case.ts` (XLSX export of the current filtered result set, capped at 5000 rows per [[project_appointment_export_mirrors_list]]), and the remaining columns. Built on top of the Agency/Branch/Inspector work from commit `761efd60` (2026-07-29). See memory `project_appointment_export_mirrors_list` (#1085): Cancellation Reason column only populates when `showCancelled` is set — re-verify that's the intended UX, not a bug, before closing this item for good.

### 04. Map: markers (color by status, clusters, service-type icons)
- **Type:** 🧩
- **Status:** not re-verified since 2026-07-22 (no matching commit found in the sweep — likely still open).
- **Description:** Doc §4.2. Pins uniform near-black with status glyph inside; doc wants color per status. No clustering. No service-type differentiation on markers.
- **Prompt:**
  > Read escopo-pendencias-execucao.md item 04 and §4.2 of escopo-cliente-gap-audit.md. Verify current marker rendering first. In apps/web AppointmentMapPage/MapMarker: (1) color pins by appointment status (token-based palette consistent with status badge colors; never set style.transform on a mapbox Marker element — memory project_mapbox_marker_transform_bug; token+alpha via color-mix, never scale on hover — memory project_tailwind_token_alpha_colormix); (2) clustering for dense areas; (3) encode service type on the marker now that color carries status. Update GROUP markers coherently. TDD, worktree from develop, PR → develop, max 150 changed files.

### 05. Map: filters and detail-panel completeness
- **Type:** 🧩
- **Status:** 🟡 PARTIALLY DONE. PR #948 (2026-07-23) added inspector filter, agency filter for OP, and the tenant confirmation STATE multi-select filter. Later fixes: PR #957 (map popup chrome + group code in popup), PR #958 (lasso button placement), commit `d8132db9` (drop deleted properties from group aggregates, de-collide web pins), commit `987536f6`/`778dfe5b`/`b2305642` (map search pin count, Enter-to-zoom, unplottable-row reporting).
- **Description:** Doc §4.2. Still pending: city filter; property code + "Scheduled by" (createdBy) in the marker detail panel; Service Type column in the selection panel (MapBulkActionModal); total group value shown in the create-group modal.
- **Prompt:**
  > Read escopo-pendencias-execucao.md item 05 and §4.2 of escopo-cliente-gap-audit.md (confirmation-state/inspector/OP-agency filters, popup polish, and pin de-collision already landed — verify, don't redo). In the appointment map feature: (1) add suburb/city filter; (2) extend the map item payload with propertyCode and createdBy, render both in AppointmentMapDetailPanel; (3) add a Service Type column to MapBulkActionModal's selection table; (4) show the group's total value in MapGroupCreateModal (sum applicable ServicePriceRule amounts for selected appointments). TDD, worktree from develop, PR → develop, max 150 changed files.

### 06. Tenant portal polish (contact info, add-to-calendar)
- **Type:** 🧩
- **Status:** 🟡 MOSTLY DONE, ONE REAL GAP LEFT. Agency name / property manager / rental tenant names rendered (Coral Clean redesign, PRs #952/#954). "Add to calendar" shipped — PR #1081, `.ics` + Google Calendar link on the confirmed view (see memory `project_portal_add_to_calendar`: no VTIMEZONE in the .ics, and its display gate differs from the neighboring card's — re-verify both before calling this fully closed).
- **Description:** Doc §6. Still pending: **agency contact info on the confirmed/summary state is a genuine backend gap, not just a missing UI surface** — see memory `project_portal_agency_phone_phantom_field` (found 2026-08-03/04 while planning this very item): `agencyPhone` is declared in the schema, typed, and even rendered by `RentalTenantPortalCancelledView`/`ExpiredView`, but `get-portal-data.use-case.ts` **never sets it** — it's dead UI. There is also no contact column on `Tenant` at all; the closest real data is `settings_json.contactPhone` (already feeds emails, but has no admin UI to fill it and isn't in `tenantSettingsSchema`) or `Branch.contact_email`.
- **Prompt:**
  > Read escopo-pendencias-execucao.md item 06, §6 of escopo-cliente-gap-audit.md, and memory project_portal_agency_phone_phantom_field (has the full investigation — don't re-derive it). Add-to-calendar already shipped (PR #1081, memory project_portal_add_to_calendar — check its two known issues, missing VTIMEZONE and inconsistent display gate, before considering it airtight). This item is now ONLY: make agency contact info actually reach the confirmed/summary portal view. Decide the contact source (recommend: `settings_json.contactPhone`, since it already feeds emails) — set it in get-portal-data.use-case.ts, add it to tenantSettingsSchema if missing, expose an edit field in TenantFormDrawer so it's not permanently empty, and render it on the confirmed/summary state (not just expired/cancelled). Internal navigation is same-tab via router Link. Mobile-first, WCAG baseline. TDD, worktree from develop, PR → develop, max 150 changed files.

### 07. PWA offers & schedule detail completeness
- **Type:** 🧩
- **Status:** not re-verified since 2026-07-22. Note: `feat/pwa-start-inspection-day-gate` (PR #1062) landed a day-gate on starting inspections — check it doesn't conflict with this item's scope before starting.
- **Description:** Doc §7.2–7.4. Offer cards show suburbs only (doc: full address) and no property-type icon; offer detail lacks group total value and full addresses; schedule cards/detail lack property (realty) codes.
- **Prompt:**
  > Read escopo-pendencias-execucao.md item 07 and §7 of escopo-cliente-gap-audit.md. Verify current PWA offer/schedule components first (a day-gate for starting inspections shipped since the audit — PR #1062 — confirm it doesn't overlap). In apps/pwa: (1) extend MarketplaceOffer payload with full street addresses and property type per appointment; show on OfferCard and GroupDetailBottomSheet, plus a property-type icon; (2) show the offer's TOTAL value in GroupDetailBottomSheet; (3) add property code to schedule AppointmentCard and AppointmentDetailPage. New shared exports need `pnpm --filter @properfy/shared build` first; PWA smoke via Playwright route stubs. TDD, worktree from develop, PR → develop, max 150 changed files.

### 08. PWA earnings/history alignment
- **Type:** 🧩
- **Status:** not re-verified since 2026-07-22.
- **Description:** Doc §7.6. Earnings chart is by month — doc wants weekday bars (M T W T F S S) with current day highlighted. History is split across two surfaces without a unified service+payment-status view.
- **Prompt:**
  > Read escopo-pendencias-execucao.md item 08 and §7 of escopo-cliente-gap-audit.md. Verify current EarningsPage/EarningsChart state first. In apps/pwa earnings feature: (1) rework EarningsChart to show bars per weekday with the current day highlighted, using the earnings-summary endpoint (beware pageSize>100 gotcha, memory project_pwa_earnings_summary_endpoint); follow the dataviz skill for chart styling; (2) unify History into one list: completed service + its payment status per row. TDD, worktree from develop, PR → develop, max 150 changed files.

---

## Phase 2 — Features requiring prior analysis (spec/plan first)

### 09. Kanban "Service Dashboard" (admin) — ✅ DONE (PR #1020, merged 2026-07-29)
- **Resolution:** Built as `AppointmentBoardPage` (apps/web/src/features/appointments/pages/) with `AppointmentBoardColumn`, `AppointmentBoardCard`, `AppointmentBulkActionBar`, board-scoped filters (`useAppointmentBoard`, `useAppointmentFilterOptions`), and backend support in `list-appointments.use-case.ts` + repository. `apps/web/CLAUDE.md` §12 updated in the same PR. No further work — re-verify only if new client feedback surfaces (e.g. drag-and-drop was likely NOT included; confirm before assuming it's click-through only).

### 10. Agency (CL) can confirm tenant presence and act on status — ✅ MOSTLY DONE (PR #1061, merged 2026-07-31; PR #972, merged 2026-07-24)
- **Resolution:** PR #1061 widened Force Confirm, Send/Copy Portal Link, and the Portal Activity tab to CL_ADMIN (and CL_USER when `force_confirmation` flag is set) via the shared role matrix — matches the narrowest-fix recommendation from the original audit almost exactly. PR #972 separately added `REJECTED → CANCELLED` (OP, AM, CL_ADMIN, CL_USER; reason required) to the state machine, fixing a map bulk-cancel bug that also happened to close another slice of "agency can act on status."
- **Remaining (re-verify, don't assume closed):** operations-only surfaces (cross-check, Notifications, Timeline outside Portal Activity, Financial) are still AM/OP by design per the PR #1061 commit message — confirm this matches client expectations before considering the item fully closed. No further status transitions were granted to CL beyond cancel + force-confirm.

### 11. Structured key & meeting location fields
- **Type:** ⚠️ adds categories/enums + migration
- **Status:** not touched since 2026-07-22 (no matching commit found).
- **Description:** Doc §5.2. Replace free-text with structured data: key location (REAL_ESTATE/REALTY/SMART_BOX/OWNER/OTHER) + conditional key address; who picks up key (HOST/VISITOR/NOT_NEEDED); meeting location (REAL_ESTATE/REALTY/OTHER) + conditional meeting address.
- **Prompt:**
  > Read escopo-pendencias-execucao.md item 11 and §5 of escopo-cliente-gap-audit.md. Note: appointment contacts became optional per service type recently (PR "feat/optional-appointment-contacts", 2026-08) — check it doesn't interact with the key/meeting fields you're adding. Enter plan mode first: design shared Zod enums/schemas, Prisma migration (expand/contract — keep existing free-text fields as fallback/notes; migrations via throwaway PostGIS container), and enumerate every surface: web create/edit form, web detail, PWA JobDetailsSection/KeyDetailsSection, appointment import columns, map detail panel, tenant portal instructions, notification template variables. Implement after approval. Build @properfy/shared first after schema changes. TDD, worktree from develop, PR → develop, max 150 changed files.

### 12. Analytics dashboard (KPIs + charts + heatmap) — ✅ DONE (PRs #1079 + #1082, merged 2026-08-04)
- **Resolution:** New `/analytics` screen (AM/OP), separate from the operational `/dashboard`. Backend: `get-dashboard-analytics.use-case.ts` + `get-analytics-heatmap.use-case.ts` on a new `dashboard-analytics` repository. Web: `AnalyticsPage` with `AnalyticsKpiGrid`, `EvolutionChart`, `ServiceTypeDistribution`, `RegionHeatmap`, `ConfirmationMeter`, `AvgExecutionBars` — recharts adopted as the first charting library in apps/web (validated palette + mandatory table view alongside every chart, per memory `project_analytics_screen_034`). That memory also flags a real bug found during the build: **the dashboard middleware didn't resolve `clUserPermissions`** — check it's actually fixed, not just noted, before assuming CL-role gating on this screen is correct. Sidebar entry + role test added.
- **Remaining:** none identified from the commit sweep; do a quick re-verify pass against §4.1 of escopo-cliente-gap-audit.md item-by-item (today-count, cancelled-KPI, revenue-for-period) before fully retiring this item, since this update didn't re-run the original 10-agent audit.

### 13. Coverage & confirmation alerts (jobs + dashboard surfacing)
- **Type:** ⚠️ new scheduled jobs + thresholds
- **Status:** still OPEN. **Do not confuse with PR #1097** (memory `project_dashboard_alert_threshold_per_window`) — that PR fixed a pre-existing, unrelated inspector-WORKLOAD capacity alert (15/18 inspections/week threshold, admin dashboard) that had never fired due to a boolean-vs-thresholds bug. It has nothing to do with this item's "no inspector assigned for X hours" / "unconfirmed near time" alerts.
- **Description:** Doc §4.1. (a) Services without inspector for more than X hours; (b) services near scheduled time without tenant confirmation.
- **Prompt:**
  > Read escopo-pendencias-execucao.md item 13 and §4.1 of escopo-cliente-gap-audit.md. Add two alert jobs (pg-boss, following dispatch-reminders.use-case.ts patterns; beware memories project_pgboss_cross_env_job_theft and project_pgboss_undefined_options_assert): (1) UNASSIGNED_TOO_LONG; (2) UNCONFIRMED_NEAR_TIME. Enter plan mode to decide thresholds/config, re-alert policy, surfacing (dashboard alert cards, optional OP email). Note: auto-group/auto-publish now runs for INGOING/OUTGOING on creation (commit 43243956) — those two flow types reach AWAITING_INSPECTOR immediately, so "unassigned too long" clock should probably start from group-publish time, not appointment-creation time; confirm during planning. TDD, worktree from develop, PR → develop, max 150 changed files.

### 14. Satisfaction survey + inspector rating (new module) — ✅ DONE (4-PR stack #1086–#1089, merged 2026-08-04)
- **Resolution:** Built exactly as scoped, as a stacked series: #1086 data model (`satisfaction_survey` table/entity/repository) + `inspector-rating.reader.ts` aggregation, #1087 portal survey flow, #1088 DONE-triggered hook, #1089 rating surfaces (PWA profile + admin inspector list/detail). See memory `project_satisfaction_survey_module` for two load-bearing details worth re-checking before treating this as airtight: the portal **reuses the existing confirmation token** rather than minting a new one (an `isUsed` guard would have broken the happy path — confirm it wasn't added later), and the new enum required updates in 3 separate places.
- **Remaining:** none identified from the commit sweep. Sanity-check: total-services-count display, minimum-ratings-before-showing-average, and anonymity — confirm these match what was actually decided during #1086's planning (this update didn't re-run the original per-item audit).

### 15. Per-agency service-type enablement
- **Type:** ⚠️ new config category; affects create form, import, pricing, marketplace
- **Status:** not touched since 2026-07-22.
- **Description:** Doc §3.2/§5.2: not every agency accesses all service types; New Appointment dropdown must show only enabled types.
- **Prompt:**
  > Read escopo-pendencias-execucao.md item 15 and §3.2/§4.9 of escopo-cliente-gap-audit.md. Enter plan mode first and evaluate: (a) explicit tenant_service_types join table, or (b) derive "enabled" from an active ServicePriceRule — recommend one. After approval: enforce in create-appointment, appointment import preview, web dropdown (filtered fetch), plus a management UI tab on TenantDetailPage. Note: auto-group/publish now runs for INGOING/OUTGOING on creation (commit 43243956) — if those types become agency-configurable/disableable, the auto-publish gate must respect enablement too. Backfill so current agencies keep all types they already use. TDD, worktree from develop, PR → develop, max 150 changed files.

### 16. Inspector notifications (tenant confirmed / payment processed / offer expiring)
- **Type:** ⚠️ new notification events + recipient path
- **Status:** not touched since 2026-07-22.
- **Description:** Doc §7.7. No inspector-directed notifications exist for these events.
- **Prompt:**
  > Read escopo-pendencias-execucao.md item 16 and §7 of escopo-cliente-gap-audit.md. Add inspector-directed notifications: (1) TENANT_CONFIRMED_INSPECTOR fired from the rental-tenant portal confirm handler; (2) PAYMENT_PROCESSED_INSPECTOR fired from mark-invoice-paid/batch-mark-invoices-paid; (3) OFFER_EXPIRING — enter plan mode first, there is no per-offer expiry concept, propose semantics before building (note: for INGOING/OUTGOING the group is now auto-published on creation, commit 43243956, which may change what "about to expire" means for those types vs ROUTINE). Seed templates in platform-notification-templates.ts, respect retry/DLQ patterns. TDD, worktree from develop, PR → develop, max 150 changed files.

### 17. Agency financial completion (received payments, balance) — ANALYSIS
- **Type:** ⚠️ new financial statuses/concepts — deep analysis mandatory
- **Status:** partially adjacent progress — PR (commit `225b3cc0`, merged 2026-07-29) let agencies self-generate FINANCIAL reports (tenant-scoped, excludes inspector-payout columns) — this is a **reporting** improvement, NOT the payment-lifecycle/balance work this item is about. Do not treat item 17 as closed.
- **Description:** Doc §4.5/§4.7. Agency-side has no paid/settled lifecycle (debits stop at APPROVED); doc mentions agency BALANCE (saldo). "Bonus and Authorization" needs client clarification (item 25).
- **Prompt:**
  > Read escopo-pendencias-execucao.md item 17 and §4.7 of escopo-cliente-gap-audit.md. Note: agency self-service report generation already shipped (commit 225b3cc0) — that's a separate concern from this item's payment-lifecycle/balance question, don't conflate them. Analysis-first task: design the agency-side payment lifecycle. Enter plan mode and produce a proposal (no code yet) covering: agency invoice/closing period per client, statuses beyond APPROVED (e.g., INVOICED → PAID) mirroring the inspector invoice module, a derived agency balance, and payment-received recording. Respect idempotency and audit rules. Present the plan for approval before implementing.

### 18. Service type estimated duration (+ feeds avg-execution KPI)
- **Type:** ⚠️ schema addition (small)
- **Status:** not touched since 2026-07-22.
- **Prompt:**
  > Read escopo-pendencias-execucao.md item 18. Add estimatedDurationMinutes (optional int) to ServiceType: Prisma migration (expand/contract), shared schema, backend use-cases, ServiceTypeFormDrawer field + list column, and show it on appointment detail and as a hint in MapGroupCreateModal. TDD, worktree from develop, PR → develop, max 150 changed files.

### 19. Agency self-service (settings, own property-managers)
- **Type:** ⚠️ RBAC widening — narrowest-fix-only
- **Status:** 🟡 advanced further, backend now likely ahead of the web surface. PR #1061 widened portal-link/force-confirm/timeline to CL_ADMIN. **PR #1135 (merged ~2026-08-27, memory `project_user_deactivate_route_and_rbac`) fixed RBAC parity across the user module: `deactivate-user`/`update-user` use-cases already scope CL_ADMIN (and OP) to their own tenant**, added a `ReactivateUserUseCase`, and fixed a bug where deactivating soft-deleted the user (making them unrecoverable). This means the BACKEND may already support most of "list/create/edit/deactivate/reactivate/reset-password of own-tenant users" for CL_ADMIN — re-verify before building new backend endpoints; the remaining gap may be purely that the web route (`/users`) and Sidebar are still AM/OP-gated (confirmed MISSING as of the last full audit, not re-checked since). **Item 29 (agency logo) is now DONE (PR #1099)** — logo upload is back in scope if a UI surface for it doesn't exist yet; check before excluding it here.
- **Description:** Doc §5.6/§5.7. CL_ADMIN still has no confirmed WEB surface for: company data view/edit, branches view, managing its own corretores, nor UI to set clUserPermissions flags.
- **Prompt:**
  > Read escopo-pendencias-execucao.md item 19, §5 of escopo-cliente-gap-audit.md, and memories feedback_rbac_changes + project_user_deactivate_route_and_rbac. First verify how much backend work is actually left — PR #1135 suggests CL_ADMIN may already be authorized for tenant-scoped user CRUD/deactivate/reactivate at the use-case level; if so this item is mostly a WEB routing/UI task, not backend RBAC widening. Enter plan mode regardless (still touches RBAC-adjacent surfaces). Scope: (1) Agency Settings page for CL_ADMIN (company data, branches read view, and — since item 29 shipped — logo upload if no UI exists yet); (2) expose tenant-scoped property-manager management to CL_ADMIN in the web app (reuse the users module UI, gated to the tenant scope, not AM/OP-only); (3) clUserPermissions editor UI. Internal navigation is same-tab via router Link. TDD, worktree from develop, split into 2 PRs if large, max 150 changed files each.

### 20. PWA user profile completion (bank details, region, notification prefs)
- **Type:** ⚠️ data model additions + payout sensitivity
- **Status:** not touched since 2026-07-22.
- **Prompt:**
  > Read escopo-pendencias-execucao.md item 20 and §7 of escopo-cliente-gap-audit.md. Enter plan mode first: (1) inspector bank details encrypted at rest (follow the app-credentials encryption pattern, memory project_app_credentials), masked in UI, audited on change; (2) preferred operating region; (3) notification preferences respected by inspector-directed notification senders (item 16). Prisma migration expand/contract. TDD, worktree from develop, PR → develop, max 150 changed files.

### 21. PWA schedule cancel action — ANALYSIS
- **Type:** ⚠️ flow/state change (INSP actor)
- **Status:** not touched since 2026-07-22 — INSP still not an actor for SCHEDULED→CANCELLED per the current state machine table (verify against root CLAUDE.md before assuming).
- **Prompt:**
  > Read escopo-pendencias-execucao.md item 21 and the state machine in CLAUDE.md §5 (also check if REJECTED→CANCELLED, added by PR #972, changes any of your reasoning — it did not add INSP as an actor anywhere). Analysis-first: propose options (decline-and-republish vs cancel-request-for-OP-approval vs full INSP cancel with RBAC change across all 3 RBAC sources). Recommend one, wait for approval, then implement. TDD, worktree from develop, PR → develop, max 150 changed files.

### 22. Admin record enrichment (inspector history/earnings, agency history/financial tabs)
- **Type:** 🧩 (after 14/17 for rating/balance)
- **Status:** 🟡 PARTIALLY DONE. PR #1091 (merged 2026-08-04) shipped an **Inspector Workload screen** (AM/OP only, since inspector is cross-tenant) — workload computed from SCHEDULED+DONE, all keyed on `scheduled_date`; thresholds centralized in shared (`project_workload_thresholds_shared`: daily ceiling-based, a floor would incorrectly kill the "overloaded" state). Rating now also shows on the inspector list/detail via item 14.
- **Remaining:** the agency-side half (TenantDetailPage Appointments tab + Financial tab) was NOT part of #1091 — still open. Re-verify whether the Inspector Workload screen also covers "service history" and "earnings link" as originally scoped, or only workload counts, before assuming that half is fully closed too.
- **Prompt:**
  > Read escopo-pendencias-execucao.md item 22 and §4.5 of escopo-cliente-gap-audit.md. Note: Inspector Workload screen (PR #1091, memory project_inspector_workload_screen) and inspector rating (item 14) already shipped — verify InspectorDetailDrawer/page current state before adding anything (it may already have what you'd otherwise duplicate: check for an Appointments-history tab and Earnings summary link specifically, since #1091 was scoped as "workload", which may not be the same as "history"). What's confirmed still missing: TenantDetailPage Appointments tab + Financial tab (the AM/OP-facing view of an agency's own history — distinct from the agency self-service reports in commit 225b3cc0). Also add a region filter to InspectorFilters if still absent. No raw IDs in UI. TDD, worktree from develop, PR → develop, max 150 changed files.

---

## Phase 3 — Blocked on client/product decisions (do not start coding)

### 23. Property spreadsheet import — reinstate or amend scope
- Doc §4.4/§5.4 promises property import; it was intentionally REMOVED (PR #913) in favor of appointment import (creates properties as a side effect; PR "fix/import-property-branch" further hardened branch-scoping of that side effect on 2026-07-24). **Decision needed with client.**

### 24. "Plan" (agency plan/contract type) + appointment "Plan" filter
- No such concept exists. Define with client. Related: item 17 balance.

### 25. "Bonus and Authorization" on map modal
- Doc §4.2 lists it; nothing similar exists. Clarify meaning with client.

### 26. Timezone/currency "general parameters" — ✅ RESOLVED the other way (5-PR stack #1098–#1103, merged 2026-08-04)
- **What changed:** the Sydney-only decision this item recommended keeping was itself REVERTED. Timezones are now configurable: per-agency (`CL_*` users inherit strictly from their tenant) and personal for AM/OP/INSP, resolved per-request in the auth middleware (never cached in the JWT). Crons moved to hourly-tick + `cron_job_runs` claims to handle the now-variable "civil day" per timezone group. Currency was already per-agency. See memory `project_configurable_timezones_stack` for the full 5-PR breakdown and its carve-outs (billing periods, idempotency keys, service-group scheduling, availability-slot horizon, and the 45-day overdue-age cutoff deliberately STAY Sydney-anchored — re-bucketing would move immutable financial/audit history).
- **No further action** — this item is closed by the system now matching the doc, not by amending the doc. If a future session sees "Sydney-only" in old context (including this file's own history above), it's stale as of 2026-08-04.

### 27. Confirmed-badge deviation (PWA)
- Doc: confirmed = no badge; system shows green badge. Cosmetic; confirm preference.

### 28. Doc housekeeping
- Fix TOC numbering and typos. Sync §2.4 state table with the real machine — the real machine
  now includes `DONE→REJECTED` (AM) and `REJECTED→CANCELLED` (OP/AM/CL_ADMIN/CL_USER), both
  already reflected in root CLAUDE.md/AGENTS.md as of PRs from this and prior sessions. Also
  note the doc's implicit "admin always groups on map" step is now conditional — INGOING/
  OUTGOING appointments auto-group and auto-publish on creation (commit 43243956).

### 29. Per-agency logo/branding — ✅ RESOLVED, reinstated (PR #1099, merged 2026-08-04; follow-up #1137, 2026-08-27)
- **Resolution:** PR #965's removal was itself reversed. `{{agencyLogoUrl}}` now renders in every email template that also carries `{{properfyLogoUrl}}`, sourced from `tenants.settings_json.logoUrl`, uploaded via a direct multipart `POST/DELETE /v1/tenants/:id/branding/logo` (magic-byte detection, 2MB/2000px caps). See memory `project_agency_email_logo_upload`.
- **Two things to verify before treating this as fully live, not just merged:** (1) the ops checklist — `SUPABASE_STORAGE_PUBLIC_URL` must be set as a Fly secret and the `tenant-branding` bucket provisioned PUBLIC, or uploads silently no-op against the stub storage; (2) whether a TenantFormDrawer / agency-settings UI to actually upload the logo exists yet, or only the backend route does — re-check before assuming agencies can self-serve this (relates to item 19's scope, which explicitly excluded logo work while this was pending).

---

## Suggested session order (summary, updated 2026-08-03)

| # | Item | Type | Status |
|---|------|------|--------|
| — | ~~01 Accept→notify tenant bug~~ | 🐛 | ✅ DONE (PR #951) |
| — | ~~03 Appointments list filters/columns/export~~ | 🧩 | ✅ DONE (PR #1085) |
| — | ~~09 Kanban board~~ | ⚠️ | ✅ DONE (PR #1020) |
| — | ~~10 Agency confirm/status RBAC~~ | ⚠️ | ✅ MOSTLY DONE (PR #1061, #972) |
| — | ~~12 Analytics dashboard~~ | ⚠️ | ✅ DONE (PR #1079+#1082) |
| — | ~~14 Satisfaction survey + rating~~ | ⚠️ | ✅ DONE (PRs #1086–#1089) |
| — | ~~26 Timezone/currency~~ | doc-fix | ✅ RESOLVED — Sydney-only reverted, now configurable (#1098–#1103) |
| — | ~~29 Per-agency logo/branding~~ | doc-fix | ✅ RESOLVED, reinstated (PR #1099, #1137) |
| 1 | 02 Properties completion | 🧩 | re-verify then close |
| 2 | 06 Tenant portal: agency contact info (add-to-calendar done, PR #1081) | 🧩 | one real gap left — backend never sets agencyPhone |
| 3 | 04 Map markers (color/cluster/type icons) | 🧩 | open |
| 4 | 05 Map filters + detail panel | 🧩 | partially done, close remainder |
| 5 | 07 PWA offers/schedule completeness | 🧩 | open |
| 6 | 08 PWA earnings/history | 🧩 | open |
| 7 | 11 Structured key/meeting fields | ⚠️ | open |
| 8 | 13 Coverage/confirmation alerts | ⚠️ | open (NOT the same as PR #1097's workload alert — see item 13 note) |
| 9 | 15 Per-agency service types | ⚠️ | open |
| 10 | 16 Inspector notifications | ⚠️ | open |
| 11 | 17 Agency financial lifecycle | ⚠️ analysis | open (agency self-service REPORTS ≠ this item — see item 17 note) |
| 12 | 18 Service type duration | ⚠️ small | open |
| 13 | 19 Agency self-service + corretor mgmt | ⚠️ | possibly backend-ready (PR #1135), web surface likely still gated — re-verify |
| 14 | 20 PWA profile (bank/region/prefs) | ⚠️ | open |
| 15 | 21 PWA cancel action | ⚠️ analysis | open |
| 16 | 22 Admin record enrichment | 🧩 | partially done (PR #1091 inspector workload); agency tabs still open |
| — | 23–25, 27–28 | client decisions / doc fixes | open |
