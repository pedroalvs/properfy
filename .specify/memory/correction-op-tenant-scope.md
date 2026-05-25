# Cross-Feature Correction: OP Tenant-Scope — CLOSED-REJECTED

**Created**: 2026-04-06
**Closed**: 2026-05-09
**Status**: **CLOSED-REJECTED** — the correction is reverted; OP returns to cross-tenant access.
**Origin**: Validation of feature 001 against business dossier via guia-properfy
**Resolution authority**: Explicit user decision (Pedro Alves, 2026-05-09) after QA cycle 1/2 of feature 022 surfaced the operational cost of the proposed tenant-scoped OP model.

> **DO NOT cite this file as an authoritative rule going forward.** It is preserved for historical context only. The active rule is the one published in `constitution.md` v1.3.0+ — OP is cross-tenant, like AM.

## Why this correction was rejected

During QA of `022-contacts-screen-enhancement` (2026-05-09), the deployed implementation of `FR-105a` ("OP tenant-scope correction in `/v1/contacts*` routes") interacted badly with the operational reality of the codebase:

- **BUG-002 (HIGH, 022 QA)**: the OP seed user had `tenant_id = null` (matching CLAUDE.md `§6` and the shipped JWT model). FR-105a hardened the contact routes to require a non-null `auth.tenantId` for OP, which produced silent `500 INTERNAL_ERROR` responses every time an OP user logged in to `/contacts`.
- The proposed fix paths were:
  1. Migrate every OP user to a non-null `tenant_id` plus update auth middleware to enforce it (constitution-compliant), OR
  2. Revert FR-105a, restore OP cross-tenant behavior, and update the constitution to match shipped reality.
- The user evaluated the tradeoffs and chose option (2). Migrating OP scope across 11 features (001–011) before shipping 022 was not acceptable; the operational practice of "OP is a platform operator" was approved in conversation as the canonical model.

## What changes (from this date forward)

- `constitution.md` is bumped to **v1.3.0** with the RBAC section revised: OP is the second cross-tenant role (alongside AM); `tenant_id` MAY be `null` in OP JWTs; OP can pass `tenantId` in `/v1/*` requests like AM.
- `CLAUDE.md` (root) §6 already reads `Operator | Operational team, cross-tenant` — no change needed there.
- Feature 022 is revised to **REV 4** removing FR-105a entirely; the contact routes are reverted to accept OP `tenantId` overrides like AM, and the frontend `Agency selector` gate is widened to include OP.
- Future features (001–011) MUST NOT cite the deprecated FR-105a / op_tenant_scope correction. Any spec text under `## CORRECTION` or `## Cross-References` that references this track must be removed or marked `[SUPERSEDED 2026-05-09]`.
- The audit-log mandatory list (constitution §Audit) keeps `cross-tenant actions by AM/OP` as an audit event; no change there.

## Security tradeoff (acknowledged)

Cross-tenant OP carries a data-isolation risk: a compromised OP credential can act on any tenant's data. Mitigations in place:

- Every cross-tenant action by AM/OP produces an audit log entry (constitution §Audit).
- Use-case-level `actor.role` checks remain in place; route-level scope checks were what FR-105a tried to harden, but the cost outweighed the benefit.
- Future hardening (if needed) MUST be proposed as a fresh APPROVED RULE through the standard amendment workflow, not by re-opening this track.

## What this file is now

A historical record. **Status: CLOSED-REJECTED.** The active OP scope rule lives in `constitution.md` v1.3.0+ Tenant Scope Rule.

## Related artifacts

- `constitution.md` v1.3.0 (active rule)
- `specs/022-contacts-screen-enhancement/spec.md` rev 4 (FR-105a removed)
- `specs/022-contacts-screen-enhancement/plan.md` rev 4 (revert + BUG-001 fix)
- Memory: `project_op_role_constitution_v13.md` (user decision recorded 2026-05-09)
