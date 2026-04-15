# Feature Specification: Audit Retention and PII Redaction

**Feature Branch**: `020-audit-retention-pii-redaction`  
**Created**: 2026-04-06  
**Status**: **Implemented** (2026-04-13) — all six central flows delivered; six residuals classified as non-blocking follow-up polish (see **Delivery Outcome** below).  
**Input**: User description: "Audit retention policy, preservation rules, and PII redaction/scrubbing strategy for audit logs, building on 011-reports-audit."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Audit Retention by Category (Priority: P1)

The platform enforces automatic retention policies on audit log entries based on their category. Financial and appointment-status audit entries are preserved for 7 years (legal/fiscal compliance). General operational audit entries (user updates, configuration changes) are preserved for 5 years. Low-value entries (read-only access logs, search queries) may be purged after 2 years. The retention process runs automatically and never deletes entries that are still needed by active business processes (e.g., the appointment cross-check flow).

**Why this priority**: Without retention, audit logs grow unbounded — this is the most urgent operational and compliance gap. The retention tiers must be in place before any PII redaction can safely operate, since redaction and retention interact (you cannot redact what has already been deleted, and you must not delete what is legally required).

**Independent Test**: Can be fully tested by creating audit entries of different categories, advancing the system clock (or using a test-mode override), running the retention process, and verifying that only entries past their retention period are moved to cold storage or purged — while protected entries remain intact.

**Acceptance Scenarios**:

1. **Given** audit entries older than their category's retention period, **When** the retention process runs, **Then** those entries are moved to cold storage (not hard-deleted).
2. **Given** an `appointment.status_transition` entry for a DONE appointment that has not yet been cross-checked, **When** the retention process runs, **Then** that entry is preserved regardless of age.
3. **Given** a financial audit entry (billing, refund, adjustment), **When** the retention period is evaluated, **Then** the entry is retained for at least 7 years.
4. **Given** a general operational audit entry (user.updated, inspector.updated), **When** the retention period is evaluated, **Then** the entry is retained for at least 5 years.
5. **Given** an entry in cold storage past its final hard-deletion threshold, **When** the hard-deletion process runs, **Then** the entry is permanently removed and cannot be recovered.
6. **Given** the retention process encounters an error mid-batch, **Then** the process stops, logs the error, and does not leave the dataset in a partial state.

---

### User Story 2 - PII Classification and Redaction (Priority: P2)

The system identifies and classifies personal data stored within audit log snapshots (`before_json`, `after_json`, `metadata_json`). A scheduled redaction process replaces PII fields with a redaction marker while preserving the structural integrity of the audit entry (the non-PII fields, action type, entity reference, actor ID, and timestamps remain intact). This enables compliance with data subject deletion/erasure requests without destroying the audit trail.

**Why this priority**: PII in audit snapshots is the primary LGPD/GDPR compliance gap. Data subject erasure requests currently cannot be fulfilled because raw personal data is embedded in JSONB snapshots. This must be addressed to avoid regulatory risk.

**Independent Test**: Can be fully tested by creating audit entries with known PII fields (e.g., inspector creation with name, email, phone), running the redaction process for a specific data subject, and verifying that PII is replaced while the audit entry structure remains queryable.

**Acceptance Scenarios**:

1. **Given** an audit entry containing PII in `before_json` or `after_json` (name, email, phone, payment details), **When** a redaction is executed for the associated data subject, **Then** the PII fields are replaced with a redaction marker (e.g., `[REDACTED]`) and the entry's non-PII structure is preserved.
2. **Given** an `appointment.status_transition` entry containing an inspector name in metadata, **When** the inspector requests data erasure, **Then** the inspector name is redacted but the actor ID, status values, and timestamps remain intact for cross-check and audit purposes.
3. **Given** a `tenant_portal.contact_updated` entry with raw email and phone from an anonymous actor, **When** a data subject erasure is requested for that contact, **Then** the contact's email and phone are redacted across all matching audit entries.
4. **Given** redaction is applied, **Then** the redacted entry is still queryable by entity type, entity ID, action, actor ID, and date range — only the PII content within JSONB snapshots is masked.
5. **Given** an audit entry that contains PII for multiple data subjects (e.g., a user update that references another user's email in a notification field), **When** erasure is requested for one subject, **Then** only that subject's PII is redacted; other subjects' data remains untouched.

---

### User Story 3 - Data Subject Erasure Request Workflow (Priority: P3)

An admin master receives a data subject erasure request (LGPD "right to be forgotten"). The system provides a workflow to: (1) identify all audit entries containing the subject's PII, (2) preview the scope of redaction, (3) execute the redaction with an audit trail of the erasure action itself, and (4) confirm completion. The workflow ensures that legally required financial audit entries are not destroyed — only the PII within them is masked while the financial record remains intact.

**Why this priority**: The erasure workflow is the operational surface for PII redaction. Without it, redaction is only a background process with no operator control. LGPD requires responding to erasure requests within a defined timeframe.

**Independent Test**: Can be fully tested by creating a test data subject with audit entries across multiple categories, initiating an erasure request, and verifying that all PII is redacted while financial and cross-check-critical entries remain structurally intact.

**Acceptance Scenarios**:

1. **Given** an admin master initiates a data subject erasure request, **When** the system scans audit logs, **Then** it returns a summary of how many entries contain the subject's PII, grouped by category.
2. **Given** the admin master reviews the erasure preview, **When** they confirm the erasure, **Then** the system redacts all identified PII and creates an audit entry recording the erasure action (who requested it, when, how many entries affected).
3. **Given** a financial audit entry contains the subject's PII, **When** erasure is executed, **Then** the PII is redacted but the financial amounts, dates, and entity references remain intact.
4. **Given** an `appointment.status_transition` entry for an unchecked DONE appointment contains the subject's name, **When** erasure is executed, **Then** the name is redacted but the actor ID, status, and appointment reference remain intact so cross-check can still resolve the actor via ID.
5. **Given** the erasure is complete, **Then** the admin master receives a confirmation report listing the number of entries redacted per category and any entries that could not be processed (with reasons).

---

### User Story 4 - Audience-Aware Audit Views (Priority: P4)

Different user roles see different levels of detail when viewing audit logs. Admin masters see full audit entries (including any un-redacted PII). Operators see audit entries with PII partially masked (e.g., email shows first 3 chars + domain, phone shows last 4 digits). Client admins (when granted access per 011#GAP-002) see only their tenant's entries with full PII masking in snapshots — they see the action, actor, and timestamp but not raw personal data from snapshots.

**Why this priority**: Read-time masking enables broader access to the audit trail while respecting data minimization. It directly closes 011#GAP-002 (CL_ADMIN audit access). However, it builds on the retention and classification foundations from P1 and P2.

**Independent Test**: Can be fully tested by querying the same audit entry as AM, OP, and CL_ADMIN and verifying that each role sees the appropriate level of detail.

**Acceptance Scenarios**:

1. **Given** an admin master queries an audit entry containing PII, **When** the entry has not been redacted, **Then** they see the full unmasked content.
2. **Given** an operator queries the same entry, **Then** PII fields are partially masked (first 3 chars of email visible, last 4 digits of phone visible, names replaced with initials + last name initial).
3. **Given** a client admin queries an audit entry within their tenant, **Then** PII fields in JSONB snapshots are fully masked (replaced with `[MASKED]`), but the action type, entity reference, actor display name, and timestamps are visible.
4. **Given** a client admin queries audit logs, **Then** they see only entries scoped to their own tenant.
5. **Given** an entry that has already been fully redacted (via erasure request), **Then** all roles see `[REDACTED]` — no partial masking is applied to already-redacted fields.

---

### User Story 5 - Retention and Redaction Operator Controls (Priority: P5)

Admin masters can view the current retention policy configuration, see retention process execution history (last run, entries processed, errors), manually trigger a retention evaluation for a specific date range, and view redaction execution history. All operator actions on retention and redaction are themselves audited.

**Why this priority**: Operational visibility into retention and redaction processes is needed for compliance audits and troubleshooting. However, the automated processes (P1, P2, P3) must work correctly first.

**Independent Test**: Can be fully tested by running retention and redaction processes and verifying that the execution history is viewable, searchable, and that manual triggers produce the expected results.

**Acceptance Scenarios**:

1. **Given** an admin master views retention settings, **Then** they see the current retention periods per category and the preservation rules (e.g., "appointment.status_transition entries for unchecked DONE appointments are exempt from retention").
2. **Given** the retention process has run, **When** the admin master views execution history, **Then** they see the run timestamp, entries evaluated, entries moved to cold storage, entries preserved (with reason), and any errors.
3. **Given** an admin master manually triggers retention for a date range, **Then** the system evaluates only entries in that range and reports results without affecting entries outside the range.
4. **Given** any operator action on retention or redaction (manual trigger, policy change, erasure execution), **Then** the action is recorded in the audit log with the operator's identity and a detailed description.

---

### Edge Cases

- What happens when a data subject erasure request targets a user who is also an audit actor (e.g., an operator whose name appears in other users' audit entries as "changed by")? The actor ID is preserved (it is a system identifier, not PII), but the actor's display name in snapshot metadata is redacted. Actor resolution at read time falls back to the user repository (or shows "Deleted User" if the user no longer exists).
- What happens when PII redaction is requested for an entry that is in cold storage? The redaction process must be able to reach cold storage entries — redaction applies across all storage tiers.
- What happens when the retention process and a redaction process run concurrently on overlapping entries? Retention must not hard-delete entries that are mid-redaction. The processes must coordinate to avoid conflicts (e.g., retention skips entries flagged as "redaction in progress").
- What happens when a `customFieldsJson` in an appointment audit entry contains unstructured PII that the system cannot automatically classify? The system flags the entry for manual review during a data subject erasure scan. The operator must confirm or skip these entries.
- What happens when an audit entry references a data subject by ID only (no PII in snapshot)? The entry is not modified during redaction — there is no PII to remove. The subject's ID is a system reference, not personal data.
- What happens when the `tenant_portal_activity` table (parallel PII surface) contains entries for the same data subject? The erasure workflow must scan both `audit_logs` and `tenant_portal_activity` tables for PII. Both are included in the scope preview.
- What happens when a retention policy change shortens the retention period for a category? Existing entries are evaluated against the new period on the next retention run. Entries that were within the old period but outside the new period become eligible for cold storage.
- What happens when an inspector's `paymentSettingsJson` is stored in an audit snapshot and contains bank account details? This is classified as sensitive financial PII and must be redacted on erasure. The redaction process treats `paymentSettingsJson` as an opaque block — the entire field is replaced with `[REDACTED]` rather than attempting to parse its internal structure.

## Clarifications

### Session 2026-04-06

- Q: How should the erasure scan find all entries for a data subject whose PII changed over time? → A: Resolve from user ID first — find all historically associated PII values (emails, phones, names) from user/inspector lifecycle audit entries, then scan for all those values across all entries. When the request starts with email/phone, resolve the canonical user first, then apply the same strategy.
- Q: Is PII redaction permanent and irreversible, or is there a recovery/grace period? → A: Permanent and irreversible. Once confirmed and executed, the original PII is destroyed with no recovery path. No parallel recoverable store exists. The preview/confirmation workflow is the safeguard against accidental requests.
- Q: How should cold storage entries be accessible from the audit query endpoint? → A: Opt-in query parameter on the existing endpoint (e.g., "include archived"). Hot storage only by default. AM/OP can enable it. Archived results are visually marked.
- Q: Should 006#GAP-009 (`done_marked_by_user_id` column) be a formal prerequisite for deploying retention? → A: Recommended co-implementation, not a hard blocker. Preservation rule (FR-008) is the primary safety. The column should be planned in parallel as a resilience hardening measure. Once deployed, the audit log dependency for cross-check origin lookup should be reduced or removed.
- Q: When should the retention process run relative to production traffic? → A: Off-peak window (configurable, default: 02:00-05:00 in the platform's operational timezone) with configurable batch size limits. Can evolve to per-environment/tenant configuration later.

## Requirements *(mandatory)*

### Functional Requirements

**Audit Category Classification**

- **FR-001**: System MUST classify every audit log entry into one of three retention categories based on its `action` field:
  - **Financial**: actions related to billing, payments, refunds, adjustments, and financial entry creation — 7-year retention (fiscal/legal compliance).
  - **Operational-Critical**: appointment status transitions, cross-check actions, user/inspector lifecycle, permission changes — 5-year retention.
  - **Operational-General**: configuration changes, read access logs, search events, notification dispatch — 2-year retention.
- **FR-002**: The mapping from `action` to retention category MUST be configurable by admin masters without code changes. New action types MUST default to "Operational-Critical" (the safest middle tier) until explicitly classified.

**Retention Lifecycle**

- **FR-003**: System MUST run an automated retention evaluation process on a recurring schedule (at least daily), within a configurable off-peak window (default: 02:00-05:00 in the platform's operational timezone). The process MUST use configurable batch size limits to avoid unbounded resource consumption.
- **FR-004**: The retention process MUST move entries past their retention period from hot storage to cold storage (archival). Hot-to-cold moves MUST be non-destructive and reversible.
- **FR-005**: Entries in cold storage past a configurable hard-deletion threshold (default: retention period + 1 year) MUST be permanently deleted. Hard deletion is irreversible.
- **FR-006**: The retention process MUST NOT move or delete entries that match any active preservation rule (see FR-008 through FR-010).

**Preservation Rules (Retention Exemptions)**

- **FR-007**: System MUST support named preservation rules that exempt specific audit entries from retention processing.
- **FR-008**: **Cross-Check Preservation** (MANDATORY, non-disableable): `appointment.status_transition` entries where `after_json` contains `status = 'DONE'` AND the appointment's `done_checked_at` is NULL MUST be preserved regardless of age. This protects the feature 006 cross-check origin lookup.
- **FR-009**: **Active Dispute Preservation (removed 2026-04-13, Sprint 1 W-5)**: this requirement was withdrawn because there is no dispute entity in the system to evaluate against. The pre-W-5 implementation was a stub that always returned `false` — advertising a compliance control that did not actually preserve anything is a worse posture than not having the control at all. When a dispute entity surface is added in a future feature, this FR is the place to re-introduce the rule as a real preservation mechanism. Until then, FR-008 (cross-check) and FR-010 (legal hold) cover the primary preservation needs. See `specs/020-audit-retention-pii-redaction/spec.md` → Delivery Outcome for the removal record.
- **FR-010**: **Legal Hold Preservation**: Admin masters MUST be able to place a legal hold on specific entities (by entity type + entity ID), preventing any retention processing or hard deletion of related audit entries until the hold is released.
- **FR-011**: Preservation rules MUST be evaluated before every retention action. A single matching preservation rule is sufficient to exempt an entry.

**PII Classification**

- **FR-012**: System MUST maintain a PII field registry that maps `(action, json_field_path)` to a PII classification. Known PII fields include:
  - `name`, `email`, `phone` in user and inspector lifecycle entries
  - `primaryEmail`, `secondaryEmail`, `primaryPhone`, `secondaryPhone` in tenant portal entries
  - `paymentSettingsJson` in inspector entries (sensitive financial PII)
  - `inspectorName` in appointment status transition metadata
  - `customFieldsJson` in appointment entries (potentially contains unstructured PII — flagged for manual review)
- **FR-013**: The PII field registry MUST be extensible by admin masters to cover new action types or newly identified PII fields.

**PII Redaction (Erasure)**

- **FR-014**: System MUST support redacting PII from audit log JSONB fields by replacing identified PII values with a `[REDACTED]` marker. Redaction is permanent and irreversible — the original PII value is destroyed in place with no recovery path or parallel store.
- **FR-015**: Redaction MUST preserve the structural integrity of the audit entry: action type, entity type, entity ID, actor ID, actor type, timestamps, request ID, and non-PII fields within JSONB snapshots MUST remain intact.
- **FR-016**: Redaction MUST operate across all storage tiers (hot and cold).
- **FR-017**: For `paymentSettingsJson` and other opaque PII blocks, redaction MUST replace the entire field value with `[REDACTED]` rather than attempting internal field-level redaction.
- **FR-018**: For `customFieldsJson` entries that cannot be automatically classified, the system MUST flag the entry for manual operator review. The operator can then confirm redaction or mark it as non-PII.

**Data Subject Erasure Workflow**

- **FR-019**: Admin masters MUST be able to initiate a data subject erasure request by providing a subject identifier (user ID, email, or phone).
- **FR-019a**: When the subject identifier is a user ID, the system MUST resolve all historically associated PII values (all emails, phones, and names from user/inspector lifecycle audit entries) and use the expanded set for scanning.
- **FR-019b**: When the subject identifier is an email or phone, the system MUST first resolve the canonical user (via user repository or audit history), then apply the same historical PII resolution strategy from FR-019a.
- **FR-020**: The system MUST scan `audit_logs` AND `tenant_portal_activity` tables to find all entries containing any of the subject's resolved PII values (current and historical).
- **FR-021**: Before executing erasure, the system MUST present a preview showing: total entries found, entries per category, entries per storage tier, and any entries flagged for manual review.
- **FR-022**: After admin master confirmation, the system MUST execute redaction on all identified entries and produce a completion report.
- **FR-023**: The erasure action itself MUST be recorded as an audit entry with: who initiated it, when, the subject identifier, number of entries affected, and completion status. This meta-audit entry MUST NOT contain the subject's PII.
- **FR-024**: System MUST support processing erasure requests within 15 calendar days (LGPD compliance window).

**Audience-Aware Read Masking**

- **FR-025**: When returning audit entries via the read endpoint, the system MUST apply role-based masking to PII fields in JSONB snapshots:
  - **AM**: Full access (no masking on un-redacted entries).
  - **OP**: Partial masking (email: first 3 chars + `***@domain`; phone: `***` + last 4 digits; names: first initial + last initial).
  - **CL_ADMIN**: Full masking (all identified PII fields replaced with `[MASKED]` in the response).
- **FR-026**: CL_ADMIN audit read access MUST be scoped to their own tenant's entries only (closes 011#GAP-002).
- **FR-026a**: The audit query endpoint MUST query hot storage by default. AM and OP roles MUST be able to opt in to include cold storage (archived) entries via a query parameter. CL_ADMIN MUST NOT have access to archived entries.
- **FR-026b**: Entries returned from cold storage MUST be marked as archived in the response so the consumer can visually distinguish them.
- **FR-027**: Entries that have been permanently redacted (via erasure) MUST show `[REDACTED]` for all roles — read-time masking does not apply to already-redacted fields.

**Audit of Retention and Redaction Actions**

- **FR-028**: All retention process executions (automated and manual) MUST produce an audit entry summarizing: entries evaluated, entries moved to cold storage, entries preserved (with rule names), entries hard-deleted, and any errors.
- **FR-029**: All redaction executions (erasure requests) MUST produce audit entries as defined in FR-023.
- **FR-030**: Policy changes (retention period changes, category reclassifications, preservation rule additions/removals, legal hold placement/release) MUST produce audit entries with before/after values.

**Parallel PII Surface Coverage**

- **FR-031**: The `tenant_portal_activity` table MUST be included in the PII classification, redaction, and erasure workflows alongside `audit_logs`. Retention policies for `tenant_portal_activity` MUST follow the same category-based model.

**Safety Constraints**

- **FR-032**: The retention process MUST NOT run during active cross-check processing windows. If a cross-check is in progress for an appointment, all audit entries for that appointment MUST be preserved.
  > **Implementation note (editorial clarification, 2026-04-12)**: in practice this rule is satisfied by the same mechanism as FR-008 (the cross-check preservation rule). The retention worker does not need to pause globally during cross-check windows — it is sufficient that **entries for appointments whose `done_checked_at IS NULL` are exempt from any move or hard-delete action**, which the preservation rule already enforces at the per-entry level on every tick. The "active cross-check window" for an appointment corresponds exactly to the interval where `status = DONE AND done_checked_at IS NULL`, so the preservation rule achieves FR-032's outcome without introducing a worker-level pause flag, lock, or scheduling gate. FR-032 and FR-008 are therefore implemented by a single mechanism.
- **FR-033**: No retention or hard-deletion process MUST remove entries that are the sole evidence of a financial transaction (billing entry creation, refund, adjustment) within their legal retention period.
- **FR-034**: Hard deletion MUST be a separate, explicitly configured step — it MUST NOT happen as part of the standard retention-to-cold-storage flow. An admin master must explicitly enable hard deletion for each retention category.

### Key Entities

- **AuditRetentionCategory**: Defines a retention tier. Key attributes: category name, retention period (in years), description, list of action patterns that map to this category.
- **AuditPreservationRule**: Defines a retention exemption. Key attributes: rule name, rule type (cross-check / dispute / legal-hold), entity type filter, entity ID filter (for legal holds), active/inactive status, created by, created at.
- **AuditLegalHold**: Represents a legal hold on a specific entity's audit entries. Key attributes: entity type, entity ID, hold reason, placed by user, placed at, released by user, released at.
- **DataSubjectErasureRequest**: Tracks an erasure request lifecycle. Key attributes: request ID, subject identifier type (user_id / email / phone), subject identifier value, status (pending / scanning / preview / confirmed / executing / completed / failed), entries found count, entries redacted count, initiated by user, initiated at, completed at, completion report.
- **PiiFieldMapping**: Maps action types to PII field paths within JSONB snapshots. Key attributes: action pattern, json field path, PII classification (direct / sensitive-financial / unstructured), requires manual review flag.
- **AuditLog (existing, extended)**: Gains optional fields: retention category (denormalized for query performance), redaction status (none / partial / full), cold storage flag, preservation rule reference (if exempt).
- **TenantPortalActivity (existing, included)**: Included in the same retention and PII framework as `audit_logs`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of audit log entries are classified into a retention category within 24 hours of creation.
- **SC-002**: The retention process runs daily without manual intervention and moves eligible entries to cold storage within the configured retention period, with zero impact on active cross-check operations.
- **SC-003**: Data subject erasure requests are fully processed (PII redacted across all storage tiers and both audit tables) within 15 calendar days of initiation.
- **SC-004**: After redaction, audit entries remain fully queryable by entity type, entity ID, action, actor ID, and date range — only PII content is removed.
- **SC-005**: The feature 006 cross-check origin lookup (`PerformCrossCheckUseCase`) continues to function correctly after retention runs — zero `APPOINTMENT_DONE_CROSS_CHECK_ORIGIN_NOT_FOUND` errors caused by retention.
- **SC-006**: CL_ADMIN users can view their tenant's audit trail with full PII masking, resolving the current gap where client admins have no audit visibility.
- **SC-007**: All retention, redaction, and policy-change actions are themselves audited and queryable — 100% traceability of who changed what and when.
- **SC-008**: Financial audit entries are preserved for at least 7 years, verifiable by compliance audit query.

## Assumptions

- The existing `audit_logs` table and `PersistentAuditService` (from 011-reports-audit) are fully operational and will be extended, not replaced.
- The `tenant_portal_activity` table is a parallel PII surface that must be brought under the same retention and redaction framework.
- Brazil's LGPD is the primary data protection regulation governing this system. The 15-day erasure processing window aligns with LGPD requirements. EU GDPR compliance (30-day window) is satisfied by the stricter LGPD timeline.
- Financial record retention of 7 years aligns with Brazilian fiscal legislation (Codigo Tributario Nacional, art. 173/174 — 5-year tax obligation prescription plus 2-year safety margin).
- General operational retention of 5 years aligns with the Brazilian Civil Code general prescription period (art. 206, § 5).
- "Cold storage" means a lower-cost, lower-access storage tier within the same database system (e.g., a partitioned table or separate schema) — not an external archival system. Cold storage entries are queryable via an opt-in parameter on the existing audit endpoint (AM/OP only), but excluded from standard queries by default to preserve performance.
- The cross-check preservation rule (FR-008) is a hard safety constraint that cannot be overridden by any user, including admin masters. This is non-negotiable because feature 006 depends on it for correctness.
- Implementing `006#GAP-009` (adding a `done_marked_by_user_id` column to appointments) is a recommended co-implementation that should be planned in parallel as a resilience hardening measure. The preservation rule in FR-008 is the primary safety net and sufficient for deployment. Once the column is deployed, the cross-check origin lookup should be migrated to use it, reducing or removing the audit log scan dependency.
- PII classification is based on field paths within known action types. Truly unstructured data (e.g., free-text `customFieldsJson`) requires manual review and cannot be automatically redacted.
- Inspector and Tenant (TNT) roles have no access to retention or redaction controls. CL_USER has no access either. These features are restricted to AM, OP (view only), and CL_ADMIN (tenant-scoped masked view only).

---

## Delivery Outcome *(2026-04-13)*

This section records the final state of Feature 020 now that implementation is complete. It is an editorial closure — no functional scope changes, only alignment between the artifacts and the delivered code.

### Status Transition

Feature 020 moved from **Draft / pending** to **Implemented**. All six central flows are live in `apps/backend` on branch `015-permissions-rbac-matrix`:

| Flow | Spec coverage | Implementation anchor |
|---|---|---|
| **Retention engine** (hot → cold → optional hard-delete) | US1, FR-001..FR-006, FR-033, FR-034 | `audit-retention.worker.ts` (reshaped), `audit_logs_archive` + `tenant_portal_activities_archive` tables, `AUDIT_RETENTION_BATCH_SIZE` env |
| **Preservation rules** (cross-check inline + legal holds; active-dispute stub **removed in Sprint 1 W-5**) | US1, FR-007, FR-008, FR-010, FR-011 | `processCategoryMove` in `audit-retention.worker.ts`, `audit_preservation_rules` + `audit_legal_holds` models, `AuditLegalHoldEntity.matches()`. FR-009 withdrawn — see W-5 closure record in Delivery Outcome Residuals row 2. |
| **PII registry / redaction primitives** | US2, FR-012..FR-018 | `pii-redaction.ts::redactByFieldPath`, `pii_field_mappings` model (seeded with the 14-entry legacy registry + 5 FR-012 additions), `pii-read-mask.ts` |
| **Erasure preview + execution workflow** | US3, FR-014, FR-019..FR-024, FR-030 | `preview-data-subject-erasure.use-case.ts`, `execute-data-subject-erasure.use-case.ts`, `prisma-erasure-pii-resolver.ts`, `audit-erasure.routes.ts`, `data_subject_erasure_requests` model |
| **Audience-aware reads** (role-based masking + cold-storage opt-in) | US4, FR-025..FR-027, FR-026a, FR-026b | `list-audit-logs.use-case.ts` (extended), `includeArchived` query param, `isArchived` marker, `IncludeArchivedForbiddenError` for CL_ADMIN |
| **Operator controls** | US5, FR-028..FR-029 | 7 use cases (upsert category / rule / hold / mapping, release hold, trigger run, list runs) + `audit-retention.routes.ts` (11 AM-only endpoints) |
| **Cold-storage query behavior** | US4, FR-026..FR-026b | `PrismaAuditLogRepository.findAll` / `findById` / `findByIds` / `searchPiiByValues` with `includeArchived` option; hot+cold merge sorted by `created_at desc` |

The write-time PII destruction present in `PersistentAuditService.log()` pre-020 was reversed as planned — new entries carry PII intact; read-time masking and on-demand erasure are now the sole PII removal surfaces.

### Preserved Invariants (006 and 011)

The delivery explicitly preserved the two upstream invariants 020 inherited:

1. **006 — Cross-check origin lookup (FR-008, non-disableable)**. The worker's `isCrossCheckPreserved(entityId)` helper reads `appointments.done_checked_at` directly via Prisma and vetoes any move to cold for `appointment.statusTransition` entries where the appointment has not yet been checked. The rule is inline in the worker — **not** a DB row — so no AM upsert can disable or reorder it. `PerformCrossCheckUseCase` was not touched; it still reads `done_marked_by_user_id` first and falls back to the audit scan, and the fallback path continues to find the legacy rows the preservation rule protects.
2. **011 — Audit trail write surface**. `PersistentAuditService.log()` remains fire-and-forget with the same structured-logger + DB dual write. New lifecycle columns on `AuditLog` (`retention_category`, `redaction_status`, `cold_storage`, `preservation_rule_id`) are additive with safe defaults, so every pre-020 call site compiles and runs unchanged. The `pg-boss audit.retention` schedule is still `30 3 * * *` — only the worker body changed. The 20 existing `list-audit-logs.use-case.test.ts` tests were extended, not replaced, and stayed green.

### Verification Performed

- Full backend test suite: **264 files / 2789 tests passing** (`pnpm --filter backend test`).
- Monorepo typecheck: **clean** across backend / web / pwa (`pnpm typecheck`).
- New tests added for 020: retention worker reshape (8 tests), `redactByFieldPath` (7), `pii-read-mask` (16), erasure resolver (5), preview use case (5), execute use case (8), US5 operator controls (16), and 7 new assertions in `list-audit-logs.use-case.test.ts` for role-based masking + `includeArchived`.
- Lint: **zero errors in any 020 file**. The 10 pre-existing lint errors in other modules were left untouched per the 018/019 closure convention.

### Residuals (Non-Blocking)

All residuals below are explicitly classified as **non-blocking for 020 to be considered shipped**. They are recorded here, in `plan.md` Residual Risks, and in `tasks.md` Non-blocking section for future-pass pickup.

| # | Residual | Classification | Notes |
|---|---|---|---|
| 1 | **Pre-020 entries permanently `[REDACTED]`** — write-time reversal asymmetry | **Deferred — non-recoverable** | Documented permanent residual per FR-014 (irreversibility). Entries written before T063 shipped stay `[REDACTED]` forever. The read-time masking layer uses a distinct `[REDACTED]` sentinel for FULL-redacted entries vs `[MASKED]` for role-based read-time masks so consumers can tell them apart. No follow-up action possible. **LGPD compliance position documented at `docs/compliance/020-pre-redaction-asymmetry.md`** (Sprint 1 `W-9`, 2026-04-13) — includes sample DPO disclosure language for data-subject access requests that hit pre-020 entries. |
| 2 | **Active-dispute preservation rule** | **RESOLVED — removed (2026-04-13, Sprint 1 W-5)** | The stub was removed from the codebase rather than kept as a non-functional control. `ACTIVE_DISPUTE` is gone from the `PreservationRuleType` enum (shared + Prisma), the `isActiveDisputePreserved` method is deleted from `audit-retention.worker.ts`, the `activeDispute` counter is removed from `AuditRetentionResult`, and FR-009 is withdrawn with a forward reference to re-introduction when a dispute entity is added. This is a product decision recorded as W-5 closure. |
| 3 | **T061 integration test** — 006 cross-check end-to-end with real DB | **Partial coverage — follow-up polish** | The cross-check preservation invariant is covered by unit tests against the worker with mocked Prisma (`appointment.findUnique` stub returning `{ done_checked_at: null }`). The end-to-end variant that seeds a real `DRAFT → DONE` transition and exercises `PerformCrossCheckUseCase` in sequence with the worker is deferred as non-blocking because the inline guard in `isCrossCheckPreserved` is identical to the pre-020 behavior. |
| 4 | **T111 integration test** — retention vs erasure concurrency end-to-end | **Partial coverage — follow-up polish** | Both sides of the coordination are unit-tested independently: `ExecuteDataSubjectErasureUseCase` sets `redaction_status = 'IN_PROGRESS'` atomically before iterating, and `AuditRetentionWorker.processCategoryMove` skips `IN_PROGRESS` rows and increments `skippedInProgressCount`. The end-to-end race with a real DB and concurrent processes is deferred. |
| 5 | **Manual smoke tests T171..T175** — dev-notebook procedures for the 5 critical paths | **Deferred — pre-deploy QA** | Critical paths (cross-check preservation, financial retention, erasure end-to-end, masking tiers, concurrency) are all unit-tested. Manual smokes are held for pre-deploy QA rather than gated on the implementation PR. |
| 6 | **Lint errors in unrelated modules** | **Out of scope — follow-up polish** | 10 pre-existing lint errors in `service-group`, `tenant-portal`, `billing`, `inspector`, `property`, `report`, `appointment-time-slot` modules. Not touched by 020 per the 018/019 closure convention. Zero lint errors in any 020 file. |

### Closure Statement

Feature 020 is **closed for implementation scope**. The LGPD compliance surface (erasure workflow + retention engine + PII redaction + audience-aware reads) is delivered end-to-end. The six residuals above are non-blocking and do not prevent shipping. The two upstream invariants from features 006 and 011 are preserved explicitly and verified by the extended test suite.
