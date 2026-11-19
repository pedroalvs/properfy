# Client Scope Document — Gap Audit

Source: "Escopo Completo Properfy - CLIENTE.md" audited item-by-item against the codebase
by 10 parallel agents (2026-07-22), with running updates as PRs merge. Status legend:
✅ implemented · 🟡 partial · ❌ missing.

**Note:** this file and `escopo-pendencias-execucao.md` were accidentally deleted from the
working tree between 2026-07-24 and 2026-08-03 (never committed) and were reconstructed on
2026-08-03 from conversation history + a fresh commit-log sweep of `develop`. If either file
is missing again, recreate from the git log between the last known audit commit and
`origin/develop`, cross-referenced with `project_client_scope_backlog` in memory.

## Headline gaps (original, 2026-07-22) — status as of 2026-09-08

1. ✅ **DONE (PR #1020, merged 2026-07-29)** — Kanban "Service Dashboard" (§4.3). Was
   deferred by design in `apps/web/CLAUDE.md` §12; now built: `AppointmentBoardPage`,
   `AppointmentBoardColumn`, `AppointmentBoardCard`, bulk action bar, board-scoped filters.
2. ✅ **DONE (4-PR stack #1086–#1089, merged 2026-08-04)** — Satisfaction survey + inspector
   rating (§6.2, §7.6, §4.5). `satisfaction_survey` table/entity/repository + rating aggregation
   reader, portal survey flow (reuses the existing confirmation token, not a new one), DONE-status
   trigger, and rating surfaces on PWA profile + admin inspector list/detail. See memory
   `project_satisfaction_survey_module`.
3. ✅ **FIXED (PR #951, merged 2026-07-23)** — tenant not auto-notified on offer acceptance.
   `NotifyOnGroupAcceptedSubscriber` now covers marketplace acceptance and manual assignment.
4. ✅ **mostly DONE (PR #1061, merged 2026-07-31)** — Agency cannot confirm/change status.
   CL_ADMIN can now Force Confirm, Send/Copy Portal Link, and view the Portal Activity tab
   (widened via the shared role matrix, not a local AM/OP bypass); CL_USER gets Force Confirm
   too when the tenant's `force_confirmation` flag is set. Also: **PR #972 (2026-07-24)** added
   `REJECTED → CANCELLED` (OP, AM, CL_ADMIN, CL_USER; reason required) to the state machine —
   agencies can now cancel a REJECTED appointment (previously only OP/AM could reopen it).
   Remaining: no other CL-initiated status transitions beyond cancel + force-confirm (by design,
   narrowest-fix — matches what was recommended). Agency-facing PROPERTY-MANAGER MANAGEMENT
   (§5.6, item 19) is a separate surface and is still MISSING.
5. ✅ **DONE (PRs #1079 backend + #1082 web, merged 2026-08-04)** — Analytics dashboard (§4.1).
   New `/analytics` screen (AM/OP), recharts adopted as the first charting library: KPI grid,
   evolution chart, service-type distribution, region heatmap, confirmation-rate meter, avg
   execution-time bars. See memory `project_analytics_screen_034` — flags a dashboard middleware
   bug (didn't resolve `clUserPermissions`) found during the build; confirm it's actually fixed.
6. ❌ still missing — **Coverage alerts** ("no inspector for X hours", "near time unconfirmed").
   **Not to be confused with PR #1097** (2026-08 window), which fixed an unrelated pre-existing
   inspector-workload capacity alert (weekly 15/18-inspection threshold) that had never fired.
7. 🟡 partial, re-check needed — **Agency-facing property-manager management (§5.6)**. Confirmed
   NOT part of PR #1061. **PR #1135 (merged ~2026-08-27)** fixed RBAC parity so `deactivate-user`/
   `update-user` use-cases already scope CL_ADMIN to their own tenant at the backend level — the
   remaining gap may now be purely the web route/Sidebar still being AM/OP-gated, not backend
   authorization. Re-verify before assuming this needs new backend work.
8. ❌ still missing — **Structured key/meeting fields (§5.2)** — not touched by any commit found
   in the 2026-07-24→09-08 sweep.
9. ❌ still missing — **Inspector SMS notifications (§7.7)** — not touched.
10. 🟡 partial — **No data model for**: agency balance, agency plan, agency fiscal data/ABN
    (still missing). Inspector rating + total-services count: ✅ now exist, via item 2 above.

## Reversed since 2026-08-04 (system now matches, or exceeds, the doc)

- ✅ **Timezone/currency "general parameters" (§4.9, was item 26)** — the Sydney-only decision
  this file previously recommended keeping (and amending the doc instead) was itself REVERTED
  by a 5-PR stack (#1098–#1103, merged 2026-08-04): timezone is now configurable per-agency
  (CL_* inherit strictly) and personal for AM/OP/INSP, resolved per-request server-side. See
  memory `project_configurable_timezones_stack` for the carve-outs that deliberately stay
  Sydney-anchored (billing periods, idempotency keys, service-group scheduling, the 45-day
  overdue-age cutoff). Currency was already per-agency.
- ✅ **Per-agency logo/branding (§5.7/§4.9, was item 29)** — PR #965's removal was reversed by
  PR #1099 (merged 2026-08-04, refined by #1137 on 2026-08-27): `{{agencyLogoUrl}}` now renders
  in every email template that also carries the platform logo, uploaded via a direct multipart
  route. Ops checklist (public storage bucket + `SUPABASE_STORAGE_PUBLIC_URL`) must be confirmed
  live, and it's unverified whether an agency-facing upload UI exists yet vs. backend-route-only.

## Additional gaps closed since 2026-08-03 (not part of the original headline 10)

- ✅ **Appointments list: remaining filters/columns/Excel export** (§4.3) — PR #1085, merged
  2026-08-04. Suburb/city filter, remaining columns, and a real XLSX export of the current
  filtered result set (capped at 5000 rows). See memory `project_appointment_export_mirrors_list`.
- ✅ **Portal add-to-calendar** (§6.5) — PR #1081, merged ~2026-08-03. `.ics` + Google Calendar
  link on the confirmed view. Two known rough edges per memory `project_portal_add_to_calendar`:
  no VTIMEZONE in the generated `.ics`, and its display gate differs from a neighboring card's.
- 🐛 **Real bug found while planning item 06** (agency contact info on the confirmed portal
  view): `agencyPhone` is declared end-to-end (schema, types, JSX in the expired/cancelled
  views) but `get-portal-data.use-case.ts` never sets it — dead UI, not a missing surface. There
  is also no contact column on `Tenant` at all. See memory `project_portal_agency_phone_phantom_field`
  for the full trace and recommended fix (use `settings_json.contactPhone`, already feeds emails).
- 🟡 **Inspector workload screen shipped (§4.5 item 5/6, admin record enrichment)** — PR #1091,
  merged 2026-08-04, AM/OP only. Computes workload from SCHEDULED+DONE on `scheduled_date`. Not
  yet confirmed whether this also satisfies "service history" as originally scoped, or is
  workload-counts only — re-verify before closing that half of item 22. The agency-side half
  (TenantDetailPage Appointments/Financial tabs) is untouched.

## Bonus fixes beyond the original headline list (found 2026-08-03)

- ✅ **Appointments list: Agency/Branch columns + Agency/Inspector filters** shipped
  (commit `761efd60`, part of the Kanban-board wave) — closes part of §4.3 item 4 (audit-appointments):
  Real Estate/agency filter now has a UI control (was state-only before); Hosts/inspector filter
  added; Agency/Branch columns added to the table.
- ✅ **Agency self-service Reports** (PR, commit `225b3cc0`, merged 2026-07-29) — CL_ADMIN can
  now generate APPOINTMENTS/FINANCIAL/PERFORMANCE reports unconditionally, CL_USER behind the
  `view_financials` flag, both tenant-scoped server-side (fixed a real cross-tenant leak: list/status/
  download had no ownership check before this). AGENCIES report type stays operator-only (compares
  agencies against each other). **This reverses memory `project_reports_scope_realignment`
  ("AM/OP-only") — that memory is now stale for the report-generation surface** (XLSX-only and the
  4 report types still stand).
- ✅ **Auto-group and publish INGOING/OUTGOING on appointment creation** (commit `43243956`,
  merged 2026-07-31) — for INGOING/OUTGOING flow types, `CreateAppointmentUseCase` now
  auto-groups and auto-publishes to the marketplace on creation (also covers bulk import, since
  the import worker calls the same use-case). ROUTINE and unrecognised flow types still require
  the manual admin lasso → group → publish path. This materially changes the §2.3 flow for two
  of the three service-type families — the doc's "Admin agrupa no mapa" step is now conditional.
- ✅ Map: property-inline creation, same-tab navigation, confirmation-state/inspector/OP-agency
  filters, group popup code/chrome fixes — see `escopo-pendencias-execucao.md` items 05/06 history.
- ⚠️ **Agency logo REMOVED** (PR #965, 2026-07-23) — platform emails now use a fixed Properfy
  logo; doc §5.7/§4.9 promise per-agency branding — client decision needed (backlog item 29).

## Sections not re-swept (still using the 2026-07-22 findings)

§4.2 Map (bulk of it — filters/markers open items still stand), §4.4 Properties, §4.7-4.8
Financial (the agency payment-lifecycle question, item 17 — NOT the report-generation surface,
which was widened by commit 225b3cc0), §7 PWA (offers/schedule/earnings, minus inspector rating
which item 2 above closed), and the inspector-notification / structured-key-fields / per-agency
service-type portions of §3.2/§4.9/§5/§7.7 remain as originally audited except where a headline/
bonus update above says otherwise. **Before starting any Phase 2 item, re-verify its section in
a quick single-agent pass** — over 600 commits have landed on develop since the original 2026-07-22
audit, across three update passes (2026-08-03, 2026-08-04, 2026-09-08), and all three only tracked
commit-message-visible changes plus the project's `MEMORY.md` index rather than a full re-audit.
**Cross-reference `MEMORY.md` first** — it is more current and more granular than this file, and
has caught real bugs (e.g. the `agencyPhone` phantom field) that a commit-log sweep alone would miss.

For the original full item-by-item findings (§4.1–§7, all 10 sections), see the conversation
history of the 2026-07-22 audit session, or re-run the 10-agent sweep described there if this
file is ever lost again without a way to recover it from git history.
