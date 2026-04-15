# Pre-020 Audit Entry Redaction Asymmetry — LGPD Compliance Note

**Status**: Canonical compliance record
**Owner**: Data Protection Officer (DPO)
**Related spec**: `specs/020-audit-retention-pii-redaction/spec.md` → Delivery Outcome → Residuals row 1
**Applies to**: all audit entries with `created_at < 2026-04-13` in both `audit_logs` and `audit_logs_archive`
**Last reviewed**: 2026-04-13

---

## Summary

Between the initial audit implementation (feature 011) and the delivery of feature 020 on 2026-04-13, the `PersistentAuditService.log()` method called `redactPii()` synchronously on the `before_json`, `after_json`, and `metadata_json` payloads before persisting them. PII fields (name, email, phone, and the 14 PII field paths in the pre-020 registry) were replaced with the sentinel string `[REDACTED]` at write time.

Feature 020 reversed this behavior. The call to `redactPii()` was removed from `persistent-audit.service.ts`. Audit entries written **on or after 2026-04-13** carry PII intact so that:
1. Admin Master users can investigate historical incidents with full fidelity (FR-025);
2. The on-demand data-subject erasure workflow (FR-014) can redact PII per-subject on request;
3. Role-based read-time masking (FR-025 / FR-027) applies to un-redacted entries only, so OP sees partial masks and CL_ADMIN sees `[MASKED]` instead of the stored `[REDACTED]` sentinel.

**The reversal is asymmetric and irrecoverable**. Entries written before 2026-04-13 remain permanently `[REDACTED]`. There is no backup, no plaintext copy, and no reconstruction path. The original PII values were never persisted in any form; the `redactPii()` call mutated the payload before it reached the database.

## Scope of Affected Data

All audit entries (both `audit_logs` and `audit_logs_archive`) that satisfy:

- `created_at < 2026-04-13T00:00:00Z`
- `action` prefix matches one of the pre-020 PII registry entries:
  - `user.*` (created, updated, deactivated) — `name`, `email`, `phone`
  - `inspector.*` (created, updated, deactivated) — `name`, `email`, `phone`
  - `auth.*` (loginSuccess, loginFailure) — `name`, `email`, `phone`
  - `portal.*` (view, contactUpdated) — `name`, `email`, `phone`, `primaryEmail`, `primaryPhone`
  - `appointment.*` — `contact.tenantName`, `contact.primaryEmail`, `contact.primaryPhone`, `tenantName`, `tenantEmail`, `tenantPhone`

For these rows, the PII field paths above contain the literal string `[REDACTED]`. The rest of the entry structure (`id`, `action`, `entity_id`, `actor_id`, `created_at`, `tenant_id`, `request_id`, non-PII fields in `metadata_json`) is intact and queryable.

Entries outside this scope (action types not in the registry, or entries created on or after 2026-04-13) are unaffected.

## Data Subject Rights Position

### Right to access (LGPD Art. 18, II)

When a data subject exercises their right to access audit data pertaining to them:

- **For entries written on or after 2026-04-13**: the platform returns the full PII as stored, subject to the role-based read-time masking rules (FR-025).
- **For entries written before 2026-04-13**: the platform returns the entry structure with PII fields as `[REDACTED]`. The response must be accompanied by a disclosure that:
  1. This is a technical limitation, not a failure to retain the data.
  2. The PII was destroyed at write time by a prior implementation, not by a subsequent erasure.
  3. No copy of the original PII exists anywhere in Properfy's systems.
  4. The non-PII structure of the entry (who, what, when) is available and queryable.

**Sample disclosure language** (for DPO use when responding to a data subject access request):

> Audit entries recorded in our system before 2026-04-13 have their personal-data fields stored as `[REDACTED]`. This is a result of a prior technical decision in our audit infrastructure that destroyed personal data at write time. It is not the result of an erasure request and we have no alternative copy of the original values. The non-personal structure of each entry (the type of action, the affected entity, the timestamp, the acting user's identifier) remains available and is included in this response. Entries recorded on or after 2026-04-13 carry full personal data and are returned in full.

### Right to erasure (LGPD Art. 18, VI)

For pre-2026-04-13 entries, the erasure request is automatically satisfied by the pre-existing redaction — there is no personal data left to erase. The data subject's PII was removed at write time, which is a stricter posture than the post-2026-04-13 on-demand erasure.

For on-or-after 2026-04-13 entries, the right to erasure is fulfilled via the `POST /v1/audit-erasure-requests` workflow (feature 020, US3). This workflow redacts all registered PII fields for the subject across `audit_logs`, `audit_logs_archive`, `tenant_portal_activities`, and `tenant_portal_activities_archive`, and emits a meta-audit entry recording the erasure without subject PII.

### Right to rectification (LGPD Art. 18, III)

Not applicable to audit entries. Audit logs are immutable factual records of system events; rectification applies to the underlying business data (users, properties, appointments), not to the audit history of changes to those records.

## Why the Reversal Was Made

The pre-020 write-time redaction was strict but created three compliance problems:

1. **LGPD Art. 18, II (right to access)** — a data subject requesting their full audit history received `[REDACTED]` for personal fields. This is technically a data loss event from the subject's perspective, not a legitimate privacy protection.
2. **FR-025 (audience-aware read masking)** — AM users investigating incidents could not see the original PII, which defeats the purpose of having an audit trail.
3. **FR-014 (on-demand erasure)** — the erasure workflow had no PII to remove, which made the workflow a no-op and meant there was no way to distinguish a legitimately erased entry from one that was redacted at write time.

Feature 020 replaced write-time redaction with:
- Full PII preservation at write time (intact `before_json`, `after_json`, `metadata_json`);
- Role-based masking at read time for unredacted entries (OP partial, CL_ADMIN blanket);
- On-demand per-subject erasure via the explicit workflow;
- A `redaction_status` column that distinguishes `NONE` (never touched), `IN_PROGRESS` (erasure running), and `FULL` (erased — all roles see `[REDACTED]`).

This is a more defensible posture for an audit system under LGPD: personal data is retained only as long as the retention category permits (7y financial, 5y operational-critical, 2y operational-general), is masked per-role at read time, and is erasable per-subject on request.

## Operational Implications

### For DPO / compliance team

1. When responding to a data subject access request, check whether any requested entries have `created_at < 2026-04-13`. If so, include the sample disclosure language above in the response.
2. The `redaction_status` column is **not** a reliable indicator of pre-020 asymmetry. Pre-020 rows have `redaction_status = 'NONE'` (unchanged), but their `before_json`/`after_json` fields already contain `[REDACTED]` from the write-time path. Use `created_at` as the asymmetry marker, not `redaction_status`.
3. The PII search (`searchPiiByValues` in `PrismaAuditLogRepository`) will **not** find pre-020 entries for the target subject because the searchable PII was replaced with `[REDACTED]` at write time. Pre-020 entries are invisible to the erasure preview scan. This is a feature, not a bug: there is nothing to erase.

### For AM / operations team

When investigating historical incidents:

1. For post-2026-04-13 incidents, full PII is available via `GET /v1/audit-logs` with role-based masking.
2. For pre-2026-04-13 incidents, the PII fields are `[REDACTED]`. To identify the affected subject, use the non-PII fields: `entity_id`, `actor_id`, `tenant_id`, `request_id`, and any non-PII fields in `metadata_json`. Cross-reference `entity_id` against the current entity tables (users, inspectors, portal tokens) to reconstruct the subject's current identity, noting that historical identity changes may not be recoverable.

### For engineers

Do not attempt to "recover" pre-020 PII. It does not exist. Any code that depends on pre-020 entries carrying PII is broken by definition and must be rewritten to handle the `[REDACTED]` sentinel or scope itself to post-2026-04-13 entries via a `created_at` filter.

## References

- `specs/020-audit-retention-pii-redaction/spec.md` → FR-014, FR-025, FR-027
- `specs/020-audit-retention-pii-redaction/spec.md` → Delivery Outcome → Residuals row 1 ("Pre-020 entries permanently `[REDACTED]`")
- `specs/020-audit-retention-pii-redaction/plan.md` → Residual Risks
- `apps/backend/src/modules/audit/application/services/persistent-audit.service.ts` (current, post-020 — no redaction at write time)
- `apps/backend/src/modules/audit/application/helpers/pii-redaction.ts` — contains the deprecated `redactPii()` function, now used only for pre-020 reference
- `.specify/memory/` — constitution and clarification history

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-04-13 | Initial compliance note written during Sprint 1 audit-ready execution (W-9). | Engineering (on behalf of DPO) |
