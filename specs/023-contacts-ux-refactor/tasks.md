# Tasks: Contacts UX Refactor (023)

**Feature**: `023-contacts-ux-refactor`
**Plan**: `./plan.md` · **Spec**: `./spec.md`
**Branch**: `022-contacts-screen-enhancement` (stacked — same PR)
**Predecessor**: 022 REV 4 (Constitution v1.3.0; AM/OP cross-tenant; BUG-001 regression guards)

## Convention
- Tasks are dependency-ordered top-to-bottom.
- `[shared]` `[backend]` `[web]` `[test]` `[delete]` tags indicate workspace.
- TDD: write tests next to (or before) the implementation file. 022 regression guards (`prisma-contact.repository.bug-001.test.ts`) MUST stay green throughout.
- All Postgres casts use `::text` (BUG-001 from 022 — never `::uuid`).
- All commits target the existing branch `022-contacts-screen-enhancement`. **Do NOT branch off.**

---

## 1. Shared schemas + permission keys

- [ ] **T-2-101 [shared]** Extend `contactListItemSchema` in `packages/shared/src/schemas/contact.ts` with `primaryInPropertyCount: z.number().int().nonnegative()`. Update `contact.test.ts` to cover the new field.
- [ ] **T-2-102 [shared]** Add `bulkResendReminderRequestSchema` (`{ appointmentIds: array<uuid>().min(1).max(100) }`) and `bulkResendReminderResponseSchema` (`{ results: array(bulkResendReminderResultSchema) }`) under `packages/shared/src/schemas/appointment.ts` (or new file `bulk.ts` if cleaner). Result item enum: `'SENT' | 'NO_PRIMARY_CONTACT' | 'IDEMPOTENT_REPLAY' | 'ERROR'`.
- [ ] **T-2-103 [shared]** Add `'appointment.bulk_resend_reminder': { roles: ['AM', 'OP'] }` to `packages/shared/src/permissions/role-matrix.ts`. Update `role-matrix.test.ts`.

## 2. Backend domain & repository

- [ ] **T-2-201 [backend]** Extend `findContactList` in `prisma-contact.repository.ts` with `primaryInPropertyCount` aggregation: `COUNT(DISTINCT a.property_id) FILTER (WHERE ac.is_primary = true AND a.status NOT IN ('CANCELLED','REJECTED'))::int`. Use `::text` casts only. Run `tests/unit/contact/prisma-contact.repository.bug-001.test.ts` before/after to confirm regression guard still green.
- [ ] **T-2-202 [backend]** Extend the WHERE-clause builder in the same query to accept optional `branchIds: string[]` (EXISTS subquery joining `appointment_contacts → appointments → properties` filtered by `p.branch_id = ANY(${branchIds}::text[])`).
- [ ] **T-2-203 [backend]** Extend the WHERE-clause to accept optional `primary: boolean` filter — selects only contacts with `primaryInPropertyCount > 0` when `primary=true`. (Implementer chooses: derived subquery vs HAVING vs CTE — pick what survives EXPLAIN ANALYZE under NFR-201.)
- [ ] **T-2-204 [backend][test]** Add Testcontainers integration tests covering: branchIds filter (one branch, two branches, no match); primary=true filter; new `primaryInPropertyCount` field correctness across (a) zero appointments, (b) primary on cancelled-only appointments → still 0, (c) primary across 3 distinct properties → 3.
- [ ] **T-2-205 [backend][perf]** Run EXPLAIN ANALYZE on the new query against a seeded DB (500 contacts × 5,000 appointments). Capture wall-clock + plan; pin to PR description (NFR-201 gate).

## 3. Backend application

- [ ] **T-2-301 [backend]** Update `ListContactsUseCase` (`apps/backend/src/modules/contact/application/use-cases/list-contacts.use-case.ts`) to thread `branchIds` and `primary` filters into the repo call; map repo result to include `primaryInPropertyCount`. Unit tests for both flags.
- [ ] **T-2-302 [backend]** Update `GeneratePortalTokenUseCase` (`apps/backend/src/modules/tenant-portal/application/use-cases/generate-portal-token.use-case.ts`): before invoking `createNotificationUseCase`, assert `result.contact?.isPrimary === true`. If absent, emit audit `tenant_portal.dispatch_skipped` with `metadata.reason = 'NO_PRIMARY_CONTACT'` and return `{ token, expiresAt, dispatched: false, reason: 'NO_PRIMARY_CONTACT' }`. Existing happy-path return adds `dispatched: true`. Unit tests for both branches.
- [ ] **T-2-303 [backend]** Create `BulkResendReminderUseCase` at `apps/backend/src/modules/appointment/application/use-cases/bulk-resend-reminder.use-case.ts`. Constructor injects `GeneratePortalTokenUseCase`, `IIdempotencyService`, optional `clock`. For-of loop over `appointmentIds`: idempotency key `bulk_resend:${apptId}:${dayKeyInActorTz}`; on cache hit return `IDEMPOTENT_REPLAY`; on dispatch result, save and surface `SENT | NO_PRIMARY_CONTACT`; on throw, capture `ERROR`. Unit tests cover all four branches.

## 4. Backend interfaces

- [ ] **T-2-401 [backend]** Extend `listQuerySchema` in `contact.routes.ts`: add `branchIds: z.array(z.string().uuid()).optional()`, `primary: z.coerce.boolean().optional()`, and (if not already) promote `type` to `z.array(z.nativeEnum(ContactType)).optional()` to support multiselect. Update Fastify `schema.querystring` binding.
- [ ] **T-2-402 [backend]** Update `formatListItem` to include `primaryInPropertyCount`.
- [ ] **T-2-403 [backend]** Add `POST /v1/appointments/bulk-resend-reminder` to `apps/backend/src/modules/appointment/interfaces/http/appointment.routes.ts` (or wherever appointment routes live). Use `bulkResendReminderRequestSchema` for body, `bulkResendReminderResponseSchema` for response. Auth: AM/OP only; 403 otherwise. Wire `BulkResendReminderUseCase` into the container.
- [ ] **T-2-404 [backend][test]** Supertest cases: bulk endpoint with mixed results (SENT + NO_PRIMARY_CONTACT + IDEMPOTENT_REPLAY) returns 200 with the result array; CL_ADMIN/CL_USER returns 403; empty array returns 400; >100 appointments returns 400.
- [ ] **T-2-405 [backend][test]** Supertest cases for list endpoint: `branchIds` filter; `primary=true` filter; both combined; cross-tenant AM/OP via `tenantId` continues to work (Constitution v1.3.0 regression).
- [ ] **T-2-406 [backend]** If `/v1/appointments` list response does not yet expose `primaryConfirmationStatus`, extend the listing use case to derive it (the primary contact's `confirmation_status`). Additive only; no migration. Confirm via grep before implementing.
- [ ] **T-2-407 [shared]** Run `pnpm generate:api`. Commit the regenerated `packages/shared/src/api-types.ts`. If unrelated drift surfaces, isolate in a separate PR per 022 mitigation precedent.

## 5. Frontend types & hooks

- [ ] **T-2-501 [web]** Extend `ContactListItem` type in `apps/web/src/features/contacts/types/index.ts` with `primaryInPropertyCount: number`. Extend `ContactFiltersState` with `branchIds: string[]` and `primary: '' | 'YES' | 'NO'`. Extend `DEFAULT_FILTERS` accordingly.
- [ ] **T-2-502 [web]** Update `useContactList` to thread `branchIds` and `primary` into the API call. If openapi-fetch does not handle array params natively, serialize manually. Existing test stub: extend.
- [ ] **T-2-503 [web]** Create `useContactRelations(contactId, options)` at `apps/web/src/features/contacts/hooks/useContactRelations.ts`. Single fetch `GET /v1/contacts/:id?includeProperties=true&includeAppointments=true` via `useDetailQuery`, lazy via `enabled` flag. Returns the combined response shape ready for client-side grouping. Test: assertion that no fetch fires when `enabled: false`.
- [ ] **T-2-504 [web]** Create `useBulkResendReminder()` at `apps/web/src/features/appointments/hooks/useBulkResendReminder.ts` using `useCreateMutation('/v1/appointments/bulk-resend-reminder')`. Test: posts the body and surfaces the result array.

## 6. Frontend deletion (cleanup before refactor — surface area first)

- [ ] **T-2-601 [delete]** Confirm pre-delete grep one more time: `grep -rln "TenantContactList\|useTenantContactList\|TenantContactDetailDrawer\|useTenantContactDetail" apps/web/src | grep -v "/features/tenants/"` returns ONLY `apps/web/src/app/router.tsx`. If anything else, halt and escalate.
- [ ] **T-2-602 [delete]** Verify which of these legacy files in `apps/web/src/features/tenants/` are exclusive to the legacy confirmation board and which are shared with the agency/branch admin UI. **Quick grep for each candidate**:
  - `TenantContactListPage.tsx` (.test.tsx) — legacy
  - `TenantContactDetailDrawer.tsx` (.test.tsx) — legacy
  - `TenantContactDetailSections.tsx` (.test.tsx) — legacy
  - `useTenantContactList.ts` (.test.ts) — legacy
  - `useTenantContactDetail.ts` (.test.ts) — legacy
  - `TenantConfirmationStatusChip.tsx` (.test.tsx) — VERIFY consumers (the appointments feature also uses a `TenantConfirmationChip`; if THIS chip is referenced ONLY by legacy files, delete; otherwise keep)
  - `TenantTable.tsx`, `TenantFilters.tsx` — VERIFY (likely legacy-only, but the names overlap with agency admin tables; double-check)
- [ ] **T-2-603 [web]** Remove the `tenant-contacts` route + lazy import for `TenantContactListPage` from `apps/web/src/app/router.tsx`.
- [ ] **T-2-604 [web]** Remove the "Tenant Confirmations" entry from `apps/web/src/components/shell/Sidebar.tsx` (currently around line 33; remove the comment block too).
- [ ] **T-2-605 [delete]** Delete the legacy files confirmed by T-2-602 (use `git rm`). Update `apps/web/src/features/tenants/index.ts` (and any submodule index files) to drop the deleted re-exports.
- [ ] **T-2-606 [test]** Run `pnpm typecheck` to confirm no dangling references. Update `Sidebar.roles.test.tsx` to assert "Tenant Confirmations" is no longer present.

## 7. Frontend `/contacts` refactor

- [ ] **T-2-701 [web]** Refactor `ContactFilters.tsx` to render: search input, branch multiselect (sourced from `useBranchList(tenantId)` — verify hook location and lift to a shared hook if it lived in the deleted folder), type multiselect, status select, primary select.
- [ ] **T-2-702 [web]** Refactor `ContactTable.tsx`: add "Primary in N" column rendering `primaryInPropertyCount`; remove any "last activity" column; ensure "Open detail" affordance navigates with `target=_blank` (anchor + `rel="noopener noreferrer"`).
- [ ] **T-2-703 [web]** Refactor `ContactListPage.tsx` to plumb new filters into `useContactList` and the table. Layout: filters in horizontal bar above table; table full width.
- [ ] **T-2-704 [web]** Create `RelationsTab.tsx` at `apps/web/src/features/contacts/components/RelationsTab.tsx`. Use `useContactRelations(contactId, { enabled: tab === 'relations' })`. Group appointments by `propertyId` client-side. Render expandable property rows with `[PRIMARY]` badge (when any non-cancelled appointment has `isPrimary=true`), summary chip (`X appts | N PENDING`), and inline appointments list using `<TenantConfirmationChip>` on expand.
- [ ] **T-2-705 [web]** Persist expand/collapse state via `sessionStorage` keyed by `contact-relations:${contactId}`. Add a tiny helper `useSessionStorageState` if not already present.
- [ ] **T-2-706 [web]** Refactor `ContactDetailPage.tsx`: replace `Properties` + `Appointments` tabs with single `Relations` tab; keep `Timeline` tab unchanged.
- [ ] **T-2-707 [delete]** Delete `ContactPropertiesTab.tsx` and `ContactAppointmentsTab.tsx` (and their tests) — superseded by `RelationsTab.tsx`. Update the components `index.ts` re-exports.
- [ ] **T-2-708 [web]** Update `ContactFormDrawer.tsx` and `AppointmentFormDrawer.tsx` (in §8) to display the hint "Provide at least one of email or phone." below primary channels.

## 8. Frontend `/appointments` enhancements

- [ ] **T-2-801 [web]** Promote `confirmationStatus` filter from `AppointmentMapFilterPanel.tsx` into the list filter panel. Approach: extract `<ConfirmationStatusSelect>` component used by both panels.
- [ ] **T-2-802 [web]** Refactor `AppointmentTable.tsx`: add row-selection checkbox column (column 0); add "Confirmation" column rendering `<TenantConfirmationChip status={row.primaryConfirmationStatus} />`. Selection state lifted to parent.
- [ ] **T-2-803 [web]** Refactor `AppointmentListPage.tsx`: render "Re-send reminder" button above the table when `selectedIds.length > 0` AND `canPerform('appointment.bulk_resend_reminder')`. On click, call `useBulkResendReminder().mutate({ appointmentIds: selectedIds })`. On success, show a toast like "3 sent · 1 no primary · 0 errors".
- [ ] **T-2-804 [web]** Expand inline contact section in `AppointmentFormDrawer.tsx`:
  - Add `type` (required `<SelectInput>`, options `CONTACT_TYPE_OPTIONS`, label "Contact type").
  - Add `company` (optional `<TextInput>`, label "Company").
  - Add `additionalChannels` repeater (collapsed by default; "Add channel" button reveals; reuse the same component as `ContactFormDrawer`).
  - Add `notes` (optional `<Textarea>`, collapsed).
  - Rename "Name" → "Display name" at the inline section label.
  - Add hint "Provide at least one of email or phone." below primary channels (same copy as `ContactFormDrawer`).
- [ ] **T-2-805 [web]** Wire validation in `AppointmentFormDrawer`:
  - Inline form validation requires `type` and `displayName`; at least one of `primaryEmail` or `primaryPhone`.
  - Outer contacts array: exactly one `isPrimary === true` (mirror `appointmentContactsArraySchema`); inline error when violated; submit blocked.
  - `setPrimaryContact(key)`: untoggle all other primaries (radio-style). Verify the existing implementation at line ~327 already does this; otherwise patch.

## 9. Frontend tests

- [ ] **T-2-901 [test]** `RelationsTab.test.tsx`: empty state; expand/collapse; sessionStorage persistence; lazy-fetch (no API call until activated).
- [ ] **T-2-902 [test]** `ContactFilters.test.tsx`: branch multiselect; primary select; filters thread into hook params.
- [ ] **T-2-903 [test]** `ContactTable.test.tsx`: "Primary in N" column rendering; "Open detail" anchor has `target=_blank`.
- [ ] **T-2-904 [test]** `AppointmentTable.test.tsx`: selection checkboxes update parent state; Confirmation column rendered.
- [ ] **T-2-905 [test]** `AppointmentListPage.test.tsx`: bulk action button visibility per role + selection state; toast surfaced after mutation.
- [ ] **T-2-906 [test]** `AppointmentFormDrawer.test.tsx`: inline section shows new fields; Display name label; hint copy; primary radio-style toggle; submit blocked when no primary.
- [ ] **T-2-907 [test]** Cross-form contract: snapshot/contract test asserting inline-create payload (from `AppointmentFormDrawer`) equals dedicated-create payload (from `ContactFormDrawer`) modulo `role` (which is appointment-only).
- [ ] **T-2-908 [test]** `useBulkResendReminder.test.ts`: posts body; returns result array.

## 10. End-to-end QA

- [ ] **T-2-1001 [test]** Playwright happy path (CL_ADMIN): create contact via `/contacts` → create appointment with that contact → see Confirmation column in `/appointments` → bulk re-send → see audit log update on `/contacts/:id` Timeline.
- [ ] **T-2-1002 [manual]** Execute the QA matrix from `plan.md` for AM, OP, CL_ADMIN, CL_USER. Capture screenshots for: branch filter, Primary in N column, Relations tab, inline contact form, Confirmation column, bulk re-send toast.

## 11. Regression (022 still PASS)

- [ ] **T-2-1101 [test]** Re-run `tests/unit/contact/prisma-contact.repository.bug-001.test.ts` (source-scan) and `tests/integration/db/contact-aggregation-types.integration.test.ts` (`pg_typeof`). Both must remain green — they cover the new aggregation too.
- [ ] **T-2-1102 [test]** Run the Constitution v1.3.0 regression suite from 022 (OP cross-tenant via `body.tenantId`). Must remain green.
- [ ] **T-2-1103 [manual]** Re-run 022 QA matrix scenarios — all green.

## 12. Pre-PR

- [ ] **T-2-1201** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all green.
- [ ] **T-2-1202** Update PR description on the existing branch with: (a) 023 acceptance criteria checklist; (b) reference label `refactor.contacts_ux.unify_and_align`; (c) EXPLAIN ANALYZE artifact links from T-2-205; (d) screenshots from T-2-1002.
- [ ] **T-2-1203** Notify reviewer/QA via the Guia channel that the stacked PR is ready for round 2/2 (post-022 regression check + 023 acceptance).
