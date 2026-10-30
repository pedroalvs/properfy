# Feature Specification: Inspector notices — Web (AM/OP)

**Feature Branch**: `045-f02-2-notices-op-screen`
**Created**: 2026-10-30
**Status**: Draft
**Input**: TASK-F02-2 (`fase2-etapa1/tarefas/F02-tarefas.md`, contract 00.6b; acceptance criteria 00.A2, 00.A4). Phase 2, Wave 2, Track D (Web).

## Context & Scope

The backend domain of inspector notices (TASK-F02-1, PR #1321) is already merged on
`develop`: the routes `POST /v1/inspector-notices`, `GET /v1/inspector-notices`,
`GET /v1/inspector-notices/:noticeId` and `POST /v1/inspector-notices/:noticeId/archive`
exist, and their types are already generated into `packages/shared/src/api-types.ts`.
This feature is the **web (Portal Master Admin / operational team) screen** that consumes
those routes: the operator (AM/OP) publishes notices to inspectors, sees the history and
read receipts, and archives notices.

The PWA inspector box, the push delivery and the SMS fallback are **out of scope** here
(TASK-F02-3). This task does **not** touch the backend and does **not** regenerate or edit
`api-types.ts` — the F02-1 routes are already typed on `develop`.

**Multi-tenant exception (documented).** `InspectorNotice`, `InspectorNoticeRecipient`
and the push subscription have **no `tenant_id`** because the inspector is cross-tenant
(precedent: `Inspector`, global `ServiceRegion`, `IntegrationSetting`) — an explicit
exception to CLAUDE.md §7.1, recorded in TASK-F02-1. Access scope is enforced by role:
publishing notices and viewing reads is AM/OP only. On the web, this is enforced by the
route `AuthGuard roles={[UserRole.AM, UserRole.OP]}` and by the Sidebar child's `roles`;
the server is the source of truth. No agency-scoped data is exposed by this screen.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish a notice to inspectors (Priority: P1)

An operator needs to reach inspectors in their app with an operational message (e.g. a road
closure, a process change). They open "Inspector notices", click "New notice", write a title
and a message, choose the audience (all active inspectors, a manual selection, or a region),
optionally mark it as critical, and publish. After confirming, the notice is published once
(idempotent on retry) and the operator sees how many inspectors it reached.

**Why this priority**: Publishing is the core value of the feature; without it there is no
way to reach inspectors from the web.

**Independent Test**: Open the drawer, fill a valid notice for each audience type, confirm,
and observe a `POST /v1/inspector-notices` with a stable `Idempotency-Key` and a success
snackbar. Fully testable with the backend routes stubbed.

**Acceptance Scenarios**:

1. **Given** the drawer is open with a valid title, message and audience "All active
   inspectors", **When** the operator clicks Publish and confirms, **Then** a single
   `POST /v1/inspector-notices` is sent with `{title, body, critical, audience:{type:'ALL'}}`
   and an `Idempotency-Key` UUID header, and on 201 a snackbar "Notice published to N
   inspectors" appears, the drawer closes and the list is refreshed.
2. **Given** the title is empty, **When** the operator clicks Publish, **Then** the field
   shows "Title is required" and no POST is sent.
3. **Given** the first POST fails by network error, **When** the operator clicks Publish
   again, **Then** the retry carries the **same** `Idempotency-Key`.
4. **Given** the operator marks the notice as critical, **When** the ConfirmDialog opens,
   **Then** it shows the audience size ("Up to N inspectors may receive an SMS.") and, when
   the current Sydney time is in `[21:00, 07:00)`, the night-time notice.

### User Story 2 - Review the notice history and read receipts (Priority: P2)

An operator needs to see which notices were sent, who read them, and archive a notice that
no longer applies. They open the list (Active / Archived / All), open a notice to see "Read
by X of Y" with the per-inspector status and read time, and archive it when done.

**Why this priority**: Visibility and lifecycle (archive) are required for the operator to
trust and manage what was sent, but they depend on notices existing first (US1).

**Independent Test**: Load the list and a detail with stubbed data; verify the columns, the
read counts, the per-recipient table, and that Archive sends
`POST /v1/inspector-notices/:id/archive` and reflects the archived state.

**Acceptance Scenarios**:

1. **Given** the list with one critical ALL notice (3 of 10 read) and one REGION "North
   Shore" notice (0 of 4), **When** the list renders, **Then** the first row shows a
   "Critical" chip and "All active inspectors", the second shows "Region: North Shore", and
   both show "X/Y" reads and status "Active".
2. **Given** the detail of a notice with 10 recipients, 3 read, 1 unread INACTIVE and 1
   unread without app access, **When** it renders, **Then** it shows "Read by 3 of 10 (2
   can't read in the app)", chips "Inactive" and "No app access" next to the names, and a
   progress bar with `aria-valuenow=3 aria-valuemax=10`.
3. **Given** an active notice detail, **When** the operator clicks Archive and confirms,
   **Then** `POST /v1/inspector-notices/:id/archive` is sent, a snackbar "Notice archived"
   appears, the Archive button disappears and an InfoBanner "This notice is archived.
   Inspectors no longer see it." is shown.
4. **Given** the inspector opens the notice in the app, **When** the operator refreshes the
   detail, **Then** that inspector's row shows "Read" with the read time and the "Read by X
   of Y" count increases by one (00.A4).

### User Story 3 - Reach the screen and nothing else (Priority: P3)

AM/OP reach "Inspector notices" from the Sidebar "Dashboard" group; other roles do not see
it and the route denies them.

**Why this priority**: Navigation and access control are necessary polish but inert without
US1/US2.

**Acceptance Scenarios**:

1. **Given** an AM or OP session, **When** the "Dashboard" flyout opens, **Then** a menu
   item "Inspector notices" with `href="/inspector-notices"` appears between Live Day (if
   merged; otherwise after Overview) and Analytics (canonical X01 order).
2. **Given** a CL_ADMIN, CL_USER or INSP session, **When** they open the menu or type
   `/inspector-notices`, **Then** the item is absent and the route denies access as other
   AM/OP routes do.

### Edge Cases

- Double Publish click or a network drop mid-publish: the stable `Idempotency-Key`
  guarantees a single notice.
- An inspector is deactivated between opening the drawer and publishing (SELECTED): the
  backend returns 400 `INSPECTOR_NOTICE_INVALID_RECIPIENTS` with the ids; they are unchecked
  and the operator republishes.
- A region is deactivated between loading and publishing: 422
  `INSPECTOR_NOTICE_REGION_INACTIVE` with the region message.
- More than 100 active inspectors: the multi-select paginates to the end before enabling
  search (loader "Loading inspectors…").
- A notice with many recipients: the detail table renders all rows (no pagination; platform
  volume is in the dozens).
- A system notice (future F04/F08) in the list: author "System", audience "Automatic",
  archivable like any other.
- Archiving an already-archived notice in another tab: 200 idempotent; the screen updates to
  archived.
- A long title in the list: truncated with an ellipsis; full in the detail and the `title`
  attribute.
- (L-F02-01) The active count for "All" fails or is slow: the ConfirmDialog uses the
  no-number phrase; publishing is not blocked.
- (L-F02-01) A region `inspectorCount` that includes inactives: the number is a ceiling
  ("Up to"), not exact.
- (L-F02-02) The operator's browser is in another timezone: the night-time phrase always
  uses Sydney time.
- (L-F02-02) The ConfirmDialog opens at 20:59 and is confirmed at 21:01: the phrase reflects
  the time when the dialog opened (no live clock).
- (L-F02-09) A recipient deactivated after reading: the "Inactive" chip appears, but they
  count as read and are not in the "can't read" tally.
- (L-F02-06) System notices older than 30 days appear as "Archived" (auto-archived, no
  per-row audit).

## Requirements *(mandatory)*

### Functional Requirements

**Navigation & access**

- **FR-001**: The Sidebar "Dashboard" group MUST include a child "Inspector notices"
  (`to: '/inspector-notices'`, icon `mdi-bullhorn-outline`, `roles: [AM, OP]`), appended in
  the canonical X01 order between Live Day (F05, if merged; otherwise Overview) and Analytics.
  The existing dashboard children MUST NOT be reordered. (D12, L-X01-03)
- **FR-002**: The routes `/inspector-notices` and `/inspector-notices/:noticeId` MUST be
  guarded by `AuthGuard roles={[UserRole.AM, UserRole.OP]}` and deny CL_ADMIN, CL_USER and
  INSP. (D8)

**List**

- **FR-003**: `/inspector-notices` MUST list notices via `GET /v1/inspector-notices` with a
  "Status" segmented filter Active (default) / Archived / All; changing the filter resets to
  page 1. Columns: Title (+ "Critical" chip when critical), Audience ("All active
  inspectors" / "N selected inspectors" / "Region: {name}" / "Automatic" for SYSTEM),
  Published (Sydney date/time), Author (user name or "System"), Read ("X/Y" + decorative
  bar), Status ("Active"/"Archived" chip). Order: `publishedAt` desc (fixed). Pagination 20
  per page (10/20/50).
- **FR-004**: List rows MUST be fully clickable and keyboard-focusable (`tabIndex=0`,
  Enter/click navigate to `/inspector-notices/:id`) with `aria-label="Open notice {title}"`.
- **FR-005**: The list MUST render loading (table skeleton), error ("Couldn't load notices."
  + Retry) and empty states ("No notices yet" + "New notice" CTA for Active; "No archived
  notices" without CTA for Archived; "No notices yet" for All).

**New notice drawer**

- **FR-006**: "New notice" MUST open a right-side `DrawerPanel` with Title (required,
  counter n/120), Message (required, counter n/2000, plain text), Audience (radios: All
  active inspectors / Selected inspectors / Region) and a Critical checkbox. The form follows
  the web's controlled-form convention (the web workspace has no react-hook-form; its forms
  are controlled — see `ServiceRegionFormDrawer`/`AppointmentFormDrawer`) and MUST validate
  the assembled publish payload against the shared `publishInspectorNoticeSchema` (the
  contract is the source of truth) while surfacing the custom messages in the acceptance
  tables, using the shared constants `INSPECTOR_NOTICE_TITLE_MAX`, `INSPECTOR_NOTICE_BODY_MAX`,
  `INSPECTOR_NOTICE_SELECTED_MAX`.
- **FR-007**: "Selected inspectors" MUST show an `InspectorMultiSelect` that loads every page
  of `GET /v1/inspectors?status=ACTIVE&pageSize=100` up to `totalPages`, with name/email
  search (case-insensitive), per-row checkboxes, "Select all shown", "Clear", a "N selected"
  summary, and the error "You can select up to 500 inspectors. Use All active inspectors or
  Region instead." when the selection exceeds 500. Empty selection → "Select at least one
  inspector".
- **FR-008**: "Region" MUST show a `RegionSelect` over
  `GET /v1/service-regions?status=ACTIVE&pageSize=100` with options "{name} ({inspectorCount}
  inspectors)"; empty choice → "Select a region"; a region with 0 inspectors shows a warning
  "This region has no inspectors."
- **FR-009**: The Message field MUST show the hint "Plain text. Inspectors see it in the
  app's Announcements." and, on a second line, "Shown on the lock screen. Don't include keys,
  codes or tenant details." linked via `aria-describedby`. (L-F02-07, D23)
- **FR-010**: Publish MUST validate, then open a ConfirmDialog titled "Publish notice?" with
  body "Notices can't be edited or deleted after publishing. You can archive them later."
  When critical, the body appends "Critical notices are sent by push, or by SMS to
  inspectors without push." Buttons: "Publish" / "Back to editing".
- **FR-011**: When critical, the ConfirmDialog MUST include, in its own paragraph, "Up to {N}
  inspectors may receive an SMS." (singular "Up to 1 inspector may receive an SMS."), where N
  is the chosen audience size: ALL → `pagination.total` of
  `GET /v1/inspectors?status=ACTIVE&pageSize=1` (fetched when "All" is chosen); REGION →
  the chosen region's `inspectorCount`; SELECTED → the selection size. If the ALL count
  fails or is still loading, the fallback phrase "Inspectors without push may receive an
  SMS." is shown (no number) and publishing is NOT blocked. This is the audience size as an
  SMS ceiling, not a recipient preview. (L-F02-01, D17)
- **FR-012**: When critical and the current Sydney time is in `[21:00, 07:00)`, the
  ConfirmDialog MUST include "It's {h:mm a} in Sydney. Inspectors will be notified now."
  (e.g. "It's 10:40 pm in Sydney. Inspectors will be notified now."), computed when the
  dialog opens, always in Sydney time regardless of the browser timezone. Non-critical
  notices show neither the SMS nor the time phrase. (L-F02-02, D18)
- **FR-013**: The `Idempotency-Key` MUST be a `crypto.randomUUID()` generated when the drawer
  opens, reused on every retry, and regenerated only when the drawer is reopened after
  success or close. (D16)
- **FR-014**: On success (201) the drawer MUST show "Notice published to {recipientCount}
  inspectors" (singular "1 inspector"), close, and invalidate the `['inspector-notices']`
  query. Error responses MUST map to an `InfoBanner` (`role="alert"`) at the top of the
  drawer: 422 `INSPECTOR_NOTICE_NO_RECIPIENTS` → "No active inspectors match this audience.";
  400 `INSPECTOR_NOTICE_INVALID_RECIPIENTS` → "Some selected inspectors are no longer active.
  Review the selection." (and the invalid ids are unchecked); 422
  `INSPECTOR_NOTICE_REGION_INACTIVE` → "This region is inactive. Choose another region.";
  generic → "Couldn't publish the notice. Try again."; offline → "You're offline. Check your
  connection and try again."
- **FR-015**: Closing a dirty drawer (X, Cancel or Esc) MUST open a ConfirmDialog "Discard
  this notice?" ("Discard" / "Keep editing"). After publishing (post-success) MUST NOT edit
  or delete — only archive exists (D4); the drawer offers no edit/delete of published
  notices.

**Detail & archive**

- **FR-016**: `/inspector-notices/:noticeId` MUST load `GET /v1/inspector-notices/:noticeId`
  and show a `PageHeader` with Back (`backTo="/inspector-notices"`), the title, "Critical"
  and "Archived" chips as applicable, a meta block ("Published {Sydney date}", "By {author}"
  / "By System", "Audience: {text}"), the body in `whitespace-pre-wrap break-words` with no
  HTML interpreted, and an "Archive" action (secondary, only when active).
- **FR-017**: The detail MUST show "Read by X of Y" — or "Read by X of Y (Z can't read in the
  app)" when Z>0, where Z is the count of **unread** recipients with
  `inspectorStatus === 'INACTIVE'` or `hasAppAccess === false` — with a `role="progressbar"`
  (`aria-valuenow=X`, `aria-valuemin=0`, `aria-valuemax=Y`, `aria-label="Read progress"`).
  (L-F02-09, D25)
- **FR-018**: The detail MUST show client-side tabs "All (Y)" / "Read (X)" / "Unread (Y−X)"
  over a recipient table with columns Inspector (name + muted "Inactive" chip when
  `inspectorStatus === 'INACTIVE'` and muted "No app access" chip when `hasAppAccess ===
  false`), Status ("Read" success / "Unread" muted), Read at (Sydney date/time or "—"),
  preserving the backend order (unread first, then name). (L-F02-09)
- **FR-019**: Archive MUST open a ConfirmDialog "Archive this notice?" / "It will be removed
  from inspectors' announcements. It stays here and in the audit log." / "Archive" (danger) /
  "Cancel"; on success a snackbar "Notice archived", a refetch, and an InfoBanner "This
  notice is archived. Inspectors no longer see it."; an archived notice shows no Archive
  button. (D4)
- **FR-020**: The detail MUST render loading (skeleton), 404 ("Notice not found" + "Back to
  notices") and error ("Couldn't load this notice." + Retry) states.

**Push tooltip (F01-2 copy)**

- **FR-021**: The inspector "Push" tooltip created by TASK-F01-2 (table column and inspector
  detail field) MUST change copy to: On → "Push is on for at least one of the inspector's
  devices"; Off → "No device has push turned on"; no-data → "No data yet". (D10)

### Key Entities *(consumed, not created)*

- **InspectorNotice** (platform-scoped, no `tenant_id`): title, body, critical, audience
  (ALL / SELECTED / REGION / SYSTEM), systemType, publishedAt, author (USER name or SYSTEM),
  archivedAt, recipientCount, readCount.
- **InspectorNoticeRecipient**: inspectorId, inspectorName, readAt, inspectorStatus
  (ACTIVE/INACTIVE), hasAppAccess.

## Assumptions

The following decisions are already resolved in the plan (F02 decisions D1–D27 and lacunas
L-F02-01 to L-F02-11, all recommendations accepted on 2026-10-29). They are recorded here as
the premises this spec builds on; no decision is left open for this web task:

- **L-F02-01 (D17)**: critical ConfirmDialog shows the audience size as an SMS ceiling
  ("Up to N…"), with the no-number fallback when the ALL count is unavailable. (FR-011)
- **L-F02-02 (D18)**: no quiet hours; the critical ConfirmDialog shows a night-time notice in
  Sydney time between 21:00 and 07:00. (FR-012)
- **L-F02-07 (D23)**: the push body is public on the lock screen; the Message field shows the
  lock-screen hint. (FR-009)
- **L-F02-09 (D25)**: the detail shows "Inactive" / "No app access" chips and the "(Z can't
  read in the app)" tally. (FR-017, FR-018)

No open Q2/Q4/Q6/Q12 applies to the F02-2 web scope.

## Out of Scope

Editing/deleting a notice; scheduling; attachments; a recipient-list preview before
publishing (the critical ConfirmDialog shows only the audience size as an SMS ceiling,
L-F02-01); quiet hours (L-F02-02, explicit decision); re-sending push/SMS; filtering by
origin (manual/system) or searching by title; any change to existing dashboard screens; the
backend routes and `api-types.ts` (owned by TASK-F02-1); the PWA box, push delivery and SMS
fallback (TASK-F02-3).

## Success Criteria *(mandatory)*

### Acceptance Criteria (from the contract — verbatim codes)

- **00.A2**: um inspetor com push recebe a notificação na publicação do plano do dia
  (gatilho em F04). Um inspetor sem push recebe SMS. Aqui é provado com um aviso crítico
  manual; o gatilho do plano é provado em F04. — On the web this surfaces as the critical
  ConfirmDialog communicating the SMS ceiling for the chosen audience (FR-011); the actual
  push/SMS delivery is backend (F02-1) + PWA (F02-3).
- **00.A4**: um aviso publicado aparece na caixa do destinatário, e o painel mostra a
  leitura. — The web **painel** half: after an inspector opens a notice in the app, the
  detail shows that read (name with "Read" and the time) and "Read by X of Y" increases
  (FR-017, SC-007).

### Measurable Outcomes

- **SC-001**: AM/OP see "Inspector notices" in the "Dashboard" group between Live Day and
  Analytics (X01 canonical order); CL_ADMIN/CL_USER/INSP do not, and the route denies them.
- **SC-002**: The list supports the Active/Archived/All filter, the contract columns, X/Y
  reads, and the loading/empty/error states.
- **SC-003**: "New notice" publishes to all three audiences, with validation, confirmation
  (critical copy), a stable `Idempotency-Key` on retry, and a mapped message for every
  contract error code.
- **SC-004**: The detail shows "Read by X of Y" and the names with status and time; archive
  is confirmed and idempotent.
- **SC-005**: No edit or delete UI exists.
- **SC-006**: The inspector "Push" tooltip reflects D10.
- **SC-007**: **(00.A4, panel)** After the inspector opens the notice in the app, the detail
  shows the read (name with "Read" and the time) and X/Y increases.
- **SC-008**: `pnpm --filter web lint typecheck test` are green (`--max-warnings 0`).
- **SC-009**: **(L-F02-01)** The critical ConfirmDialog shows "Up to N inspectors may receive
  an SMS." with N from the audience (ALL/REGION/SELECTED), or the no-number fallback.
- **SC-010**: **(L-F02-02)** The critical ConfirmDialog between 21:00 and 07:00 Sydney shows
  the night-time phrase.
- **SC-011**: **(L-F02-07)** The Message field shows the lock-screen hint.
- **SC-012**: **(L-F02-09)** The detail shows "Inactive"/"No app access" chips and "(Z can't
  read in the app)".
