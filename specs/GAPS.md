# Cross-Feature Gaps Index

**Last Updated**: 2026-04-06
**Status**: Living document — add/remove rows as gaps are closed and new features are migrated.

## Critical Corrections (take priority over all gaps)

### CORRECTION-001: OP Must Be Tenant-Scoped (ALL features)

**Status**: OPEN — approved rule, implementation diverges
**Impact**: HIGH — security and data isolation concern
**Detail**: `.specify/memory/correction-op-tenant-scope.md`

The codebase treats OP as tenant-free (`tenant_id = null`, cross-tenant access). The approved dossier requires OP to have mandatory `tenant_id` and operate only within its tenant. This affects every feature (001–011). AM is the only tenant-free role.

**Action required**: coordinated correction across JWT model, auth middleware, every use case that grants OP the same scope as AM, and all feature specs.

### CORRECTION-002: Promote 001#GAP-003 and 001#GAP-009 to Approved Rules

- **001#GAP-003** (CL_USER fine-grained permissions) — the dossier approves this as a binding rule, not a future gap.
- **001#GAP-009** (blacklist enforcement on create & admin reset) — same: approved rule, should already be implemented.

Both should be reclassified from `GAP` to `APPROVED RULE NOT YET IMPLEMENTED` in the spec and tasks.

### CORRECTION-003: 001 spec missing rules

- Refresh token rotation must be audited (add to audit events list).
- Rate limiting is hybrid: per IP AND per account/email (document both).
- CL user management depends on explicit tenant-level enablement (condition in tenant settings).
- Password policy must explicitly state "no forced periodic expiration".

### CORRECTION-004: ServiceRegion Must Be Per-Tenant (features 004, 005, 008)

**Status**: OPEN — decision confirmed: adhere to dossier (per-tenant)
**Impact**: HIGH — data model divergence, marketplace logic change
**Detail**: `.specify/memory/correction-service-region-scope.md`

The codebase treats `ServiceRegion` as a global entity (no `tenant_id`). The approved dossier requires ServiceRegion to be per-tenant. Every region belongs to exactly one tenant. Region names may repeat across tenants; uniqueness applies only within the same tenant. Inspector is global but region ownership is tenant-scoped.

**Action required**: add `tenant_id` column to `service_regions`, scope all CRUD and marketplace matching by tenant, adjust `InspectorRegion` mappings.

### CORRECTION-005: Reclassify implementation decisions across all features

Many items documented as `Source: dossier` or `APPROVED RULE` are actually **implementation decisions** not closed by the dossier:

| Feature | Item | Should be |
|---|---|---|
| 002 | PENDING as initial tenant status | `Source: code (implementation decision)` |
| 003 | PropertyType enum (RESIDENTIAL, COMMERCIAL, INDUSTRIAL, RURAL) | `Source: code` |
| 003 | Property import XLSX/CSV | `Source: code` |
| 003 | Delete blocked by open appointments | `Source: inferred` |
| 005 | Service group state machine (DRAFT→PUBLISHED→ACCEPTED) | `Source: code (modeling decision)` |
| 005 | Exception type size limits (1-3, 1-8, 1-25) | `Source: code` |
| 006 | FR-014 AWAITING_INSPECTOR requires service_group_id | `Source: code (implementation decision)` — dossier allows AWAITING_INSPECTOR without group |
| 007 | Token revocation on reschedule | `Source: code (security decision)` |
| 007 | actorType=ANONYMOUS | `Source: code` |
| 008 | Min 1 photo hardcoded | `Source: code` — should be per service type |
| 009 | Zenvia for WhatsApp | `Source: code` — not canonical |
| 010 | Two-person approval universal for ALL entries | `Source: code (more restrictive than dossier)` |
| 010 | Refund only against APPROVED TENANT_DEBIT, one per debit | `Source: code` |
| 011 | Date range limits per report type | `Source: code` |
| 011 | Concurrent report limit (3 per user) | `Source: code` |

### CORRECTION-006: 002 spec — OP can deactivate tenants and branches

The code restricts deactivation to AM only. The dossier says AM **or** OP (within their own tenant) can deactivate tenants and branches. This is a bug — OP is locked out unnecessarily.

---

## Purpose

A single index of every `GAP-xxx` currently open across migrated features. Use this to prioritize Phase 2 work, spot cross-feature dependencies, and avoid reimplementing the same concern in multiple places.

Operational detail for each gap lives in the corresponding feature's `tasks.md`. This file is the index, not the source of truth.

## Reading guide

- **ID** — globally qualified `FEATURE#GAP-xxx`.
- **Impact** — `H`igh (blocks product or other features), `M`edium (degrades UX or ops), `L`ow (nice to have).
- **Depends on** — other gaps that must close first.
- **Blocks** — features or gaps that wait on this one.
- **Classification** — `APPROVED` rule not yet implemented, vs. `PROPOSED` (needs product approval before promoting).

## Open gaps

| ID | Title | Impact | Classification | Depends on | Blocks |
|---|---|---|---|---|---|
| 001#GAP-001 | Self-service forgot password | H | APPROVED | 009-notifications | — |
| 001#GAP-002 | Admin manual unlock | M | APPROVED | — | — |
| 001#GAP-003 | CL_USER fine-grained permissions | H | APPROVED | — | 006 (filters), 010 (financial view), 011 (exports) |
| 001#GAP-004 | TOTP opt-in for non-AM roles | L | APPROVED | — | — |
| 001#GAP-005 | Device/session trust signals | M | PROPOSED | — | — |
| 001#GAP-006 | Password history | L | APPROVED | — | — |
| 001#GAP-007 | Admin invite flow | M | APPROVED | 009-notifications | 001#GAP-001 (shared token infra) |
| 001#GAP-008 | Soft-delete email reuse policy | L | PROPOSED | — | — |
| 001#GAP-009 | Blacklist on create & admin reset | L | APPROVED | — | — |
| 001#GAP-010 | JWT key rotation runbook + alerting | M | APPROVED | — | — |
| 002#GAP-001 | Activate tenant endpoint | H | APPROVED | — | Self-serve onboarding, 001 auth unblock |
| 002#GAP-002 | Rich tenant settings schema | H | APPROVED | — | 002#GAP-003, 002#GAP-004, 002#GAP-010, 009, 010, 005 |
| 002#GAP-003 | Billing period cross-field validation | M | APPROVED | 002#GAP-002 | 010 clean billing cycle |
| 002#GAP-004 | CL_ADMIN fine-grained settings scope | M | APPROVED | 002#GAP-002 | — |
| 002#GAP-005 | Domain events emission (`tenant.*.v1`, `branch.*.v1`) | M | APPROVED | — | 009, 011 decoupling |
| 002#GAP-006 | Branch reactivation | L | APPROVED | — | — |
| 002#GAP-007 | Case-insensitive branch name uniqueness | L | APPROVED | — | — |
| 002#GAP-008 | Get-branch-by-id endpoint | L | APPROVED | — | — |
| 002#GAP-009 | Tenant hard-delete runbook | L | APPROVED | — | — |
| 002#GAP-010 | Tenant branding asset upload | M | APPROVED | 002#GAP-002 | — |
| 002#GAP-011 | Branch address schema | M | APPROVED | 003#GAP-001 (subsumed by) | Closes automatically when 003#GAP-001 lands |
| 003#GAP-001 | Shared address schema across tenant, property, appointments | H | APPROVED | — | 002#GAP-011, 006 contact address |
| 003#GAP-002 | Manual coordinate unlock path | L | APPROVED | — | — |
| 003#GAP-003 | PostGIS `coordinates` column population | H | APPROVED | — | 005 inspector offer radius |
| 003#GAP-004 | Property hard-delete runbook | L | APPROVED | — | — |
| 003#GAP-005 | Batch audit for imports | M | APPROVED | — | — |
| 003#GAP-006 | Import idempotency payload verification | H | APPROVED | — | Safe scale of self-serve imports |
| 003#GAP-007 | `property.rules_json` schema contract | M | APPROVED | coordinate 006 | 006 scheduling constraints |
| 003#GAP-008 | Import error CSV export | L | APPROVED | — | — |
| 003#GAP-009 | Address autocomplete caching & rate limit | M | APPROVED | — | — |
| 003#GAP-010 | Geocoding retry and DLQ alerting | M | APPROVED | — | — |
| 004#GAP-001 | `requiresTenantConfirmation` default drift | L | APPROVED | — | — |
| 004#GAP-002 | Pricing rule currency coupling | M | PROPOSED | — | 010 billing accuracy |
| 004#GAP-003 | `bonus_rule_json` schema contract | M | APPROVED | coordinate 010 | 010 bonus computation, self-serve config |
| 004#GAP-004 | PostGIS `geom` population on service regions | H | APPROVED | 003#GAP-003 | 005 marketplace spatial matching |
| 004#GAP-005 | Pricing rule NULL-branch uniqueness verification | M | APPROVED | — | — |
| 004#GAP-006 | MultiPolygon + holes in service regions | M | APPROVED | 004#GAP-004 | Real metro region shapes |
| 004#GAP-007 | Pricing rule history | M | PROPOSED | — | Audit replay, billing disputes |
| 004#GAP-008 | Service type hard-delete policy | L | PROPOSED | — | — |
| 004#GAP-009 | Region deactivation notifications | L | APPROVED | 002#GAP-005 | — |
| 004#GAP-010 | Larger resolve-regions batches | L | IMPLEMENTED | 004#GAP-004 | Raised max from 25 to 200 |
| 005#GAP-001 | Marketplace spatial indexing | H | APPROVED | 003#GAP-003, 004#GAP-004 | Scale of inspector marketplace |
| 005#GAP-002 | Extract shared PricingResolver service | M | APPROVED | — | 010 billing computation consistency |
| 005#GAP-003 | Expire published groups after priority window | M | PROPOSED | — | Marketplace noise |
| 005#GAP-004 | Re-publish after cancellation | L | PROPOSED | — | — |
| 005#GAP-005 | Domain events for offer lifecycle | M | APPROVED | 002#GAP-005 | 009 notifications |
| 005#GAP-006 | Lightweight marketplace list view | M | APPROVED | — | PWA performance at scale |
| 005#GAP-007 | Accept-offer idempotency identity check | L | APPROVED | — | Defense-in-depth |
| 005#GAP-008 | Manual assign idempotency | L | APPROVED | — | — |
| 005#GAP-009 | Wider update schema for DRAFT groups | L | APPROVED | — | — |
| 005#GAP-010 | Exception usage report | L | APPROVED | 011 feature | — |
| 006#GAP-001 | Typed reason codes (cancellation/rejection) | M | APPROVED | — | Analytics aggregation |
| 006#GAP-002 | Financial compensation on DONE → REJECTED | H | APPROVED | 002#GAP-005 | 010 billing correctness |
| 006#GAP-003 | Tenant portal reschedule handoff protocol | M | APPROVED | — | 007 cleanup |
| 006#GAP-004 | Appointment import idempotency payload verification | H | APPROVED | — | Safe bulk imports |
| 006#GAP-005 | Appointment soft-delete policy | L | PROPOSED | — | — |
| 006#GAP-006 | Typed transition event contract | M | APPROVED | 002#GAP-005 | 009 notifications decoupling |
| 006#GAP-007 | CL_USER permission set schema | M | APPROVED | 001#GAP-003 | Typo safety across feature 006 |
| 006#GAP-008 | Appointment number runbook | L | PROPOSED | — | — |
| 006#GAP-009 | `done_marked_by_user_id` column | M | APPROVED | — | Cross-check scaling |
| 006#GAP-010 | Compound DONE + cross-check endpoint | L | APPROVED | — | Operator ergonomics |
| 007#GAP-001 | Formal reschedule handoff with feature 006 | M | APPROVED | pair with 006#GAP-003 | Contract clarity |
| 007#GAP-002 | Domain events for portal actions | M | APPROVED | 002#GAP-005 | 009 decoupling |
| 007#GAP-003 | Token replay detection / single-use mutations | M | PROPOSED | — | Security hardening |
| 007#GAP-004 | Auto-generate new token on reschedule | M | APPROVED | — | Renter UX |
| 007#GAP-005 | Portal activity export endpoint | L | APPROVED | — | Support tooling |
| 007#GAP-006 | Web UX for EXPIRED tokens | L | APPROVED | — | Renter UX |
| 007#GAP-007 | Configurable cutoff per tenant | L | APPROVED | 002#GAP-002 | — |
| 007#GAP-008 | Configurable reschedule window per tenant | L | APPROVED | 002#GAP-002 | — |
| 007#GAP-009 | `last_accessed_at` telemetry dashboard | L | APPROVED | 011 feature | — |
| 007#GAP-010 | DST correctness tests | L | APPROVED | — | Quality assurance |
| 008#GAP-001 | Geolocation verification at start | M | APPROVED | 003#GAP-003 | Fraud prevention |
| 008#GAP-002 | Consolidate inspector region data | M | APPROVED | — | Data consistency |
| 008#GAP-003 | Availability slot booking integration | M | APPROVED | — | Double-booking prevention |
| 008#GAP-004 | Centralize T-1 rule | L | APPROVED | — | Reduce drift risk |
| 008#GAP-005 | Configurable time window per tenant | L | APPROVED | 002#GAP-002 | — |
| 008#GAP-006 | Pause / auto-save in-progress execution | M | APPROVED | — | Field UX |
| 008#GAP-007 | Re-open finished execution | L | PROPOSED | — | Operator flexibility |
| 008#GAP-008 | Asset retention policy | L | PROPOSED | — | Storage cost |
| 008#GAP-009 | Typed JSON fields on inspector | M | APPROVED | — | Data integrity |
| 008#GAP-010 | Extract time-window service for feature 006 reuse | L | APPROVED | — | Consistency |
| 009#GAP-001 | Unsubscribe / opt-out management | H | APPROVED | — | Legal compliance (CAN-SPAM, GDPR, LGPD) |
| 009#GAP-002 | WhatsApp template approval tracking | M | APPROVED | — | Meta compliance |
| 009#GAP-003 | Per-tenant notification budget / rate limit | H | APPROVED | 002#GAP-002 | Production safety |
| 009#GAP-004 | Strict variables validation on send | M | APPROVED | — | Silent drift |
| 009#GAP-005 | Proper templating engine | L | PROPOSED | — | Template expressiveness |
| 009#GAP-006 | Poll-retryable batch cap | L | APPROVED | — | Worker safety |
| 009#GAP-007 | Webhook signature validation | H | APPROVED | — | Security — forgery prevention |
| 009#GAP-008 | Handler exception alerting | M | APPROVED | — | Observability |
| 009#GAP-009 | Per-attempt audit trail | L | APPROVED | — | Provider dispute troubleshooting |
| 009#GAP-010 | SMS fallback when email missing | M | PROPOSED | — | Reach |
| 010#GAP-001 | Cancel use case for PENDING entries | M | APPROVED | — | Ledger cleanup |
| 010#GAP-002 | Auto compensation on DONE → REJECTED | H | APPROVED | 002#GAP-005, 006#GAP-002 | Billing correctness |
| 010#GAP-003 | Partial refunds | M | PROPOSED | — | Real-world refund scenarios |
| 010#GAP-004 | Tenant invoice rolled-up document | M | APPROVED | — | Agency reconciliation |
| 010#GAP-005 | Tenant-timezone period boundaries | L | APPROVED | 002#GAP-002 | Period accuracy |
| 010#GAP-006 | Void approved entries | L | PROPOSED | — | Legal compliance |
| 010#GAP-007 | Invoice regeneration | L | APPROVED | — | Late approval corrections |
| 010#GAP-008 | Invoice PAID marking endpoint | M | APPROVED | — | Payment reconciliation |
| 010#GAP-009 | Summary endpoint date range | L | APPROVED | — | Dashboard queries |
| 010#GAP-010 | Consolidate duplicate invoice routes | L | APPROVED | — | API cleanup |
| 011#GAP-001 | Audit log retention policy | H | APPROVED | coordinate 006 cross-check | Compliance + storage growth |
| 011#GAP-002 | CL_ADMIN audit log read access | M | APPROVED | — | Self-service compliance |
| 011#GAP-003 | PII redaction in audit snapshots | H | APPROVED | — | GDPR/LGPD compliance |
| 011#GAP-004 | Scheduled / recurring reports | M | APPROVED | 011#GAP-010 | Operator productivity |
| 011#GAP-005 | User-defined column sets | L | PROPOSED | — | Report customization |
| 011#GAP-006 | CSV and PDF output formats | M | APPROVED | — | Data analyst + legal use cases |
| 011#GAP-007 | Read replica routing for report reader | M | APPROVED | — | OLTP isolation |
| 011#GAP-008 | Per-tenant concurrent report limit | L | APPROVED | 002#GAP-002 | Worker load balance |
| 011#GAP-009 | Audit log full-text search | L | PROPOSED | — | Investigation ergonomics |
| 011#GAP-010 | Email delivery of completed reports | M | APPROVED | 009 notifications | Operator UX |

## Closed gaps

_(Move rows here with a closing date when the gap is promoted to `IMPLEMENTED` in its feature spec.)_

| ID | Title | Closed on | Closing commit / PR |
|---|---|---|---|

## High-impact recommendations

These gaps are load-bearing for Phase 2/3 and should be prioritized early:

1. **003#GAP-001** (shared address schema) — also closes **002#GAP-011** and unblocks consistent address handling across the product.
2. **002#GAP-002** (rich tenant settings) — fan-out effect on 002#GAP-003, GAP-004, GAP-010, plus features 009, 010, 005.
3. **003#GAP-006** (import idempotency payload hash) — silent bug, real risk at scale.
4. **PostGIS pair**: **003#GAP-003** (properties) + **004#GAP-004** (regions) — must land together to enable marketplace spatial matching.
5. **002#GAP-001** (activate tenant) — operational blocker for self-serve onboarding.
6. **001#GAP-003** (CL_USER permissions) — cascade effect on features 006, 010, 011.
7. **004#GAP-005** (pricing rule NULL-branch uniqueness) — small correctness fix; potential for silent duplicate rules.

## Coordinated work bundles

Clusters of gaps that are effectively one unit of work because they share prerequisites or infrastructure. Implement together.

### Bundle A — Shared address schema

- **002#GAP-011** (branch address) — subsumed
- **003#GAP-001** (shared address across tenant/property/appointment) — driver

One PR defines `packages/shared/src/schemas/address.ts` and migrates every consumer. Closing 003#GAP-001 automatically closes 002#GAP-011.

### Bundle B — PostGIS spatial readiness

- **003#GAP-003** (properties `coordinates` backfill) — prerequisite
- **004#GAP-004** (service_regions `geom` backfill) — prerequisite
- **004#GAP-006** (MultiPolygon + holes) — optional extension
- **005#GAP-001** (marketplace spatial indexing) — consumer
- **004#GAP-010** (larger resolve-regions batches) — consumer

Land Properties and Service Regions PostGIS backfill first, then rewrite the resolver and the marketplace repository to use `ST_Contains` / `ST_Intersects`. Benchmark before declaring done.

### Bundle C — Domain event bus

- **002#GAP-005** (tenants/branches domain events) — infrastructure driver
- **004#GAP-009** (region deactivation notifications) — consumer
- **005#GAP-005** (offer lifecycle events) — consumer

Introduce a shared `DomainEventBus` alongside feature 002's Phase 2 work, then emit and subscribe from the other features in follow-up PRs.

### Bundle D — Tenant settings overhaul

- **002#GAP-002** (rich tenant settings schema) — driver
- **002#GAP-003** (billing period cross-field validation)
- **002#GAP-004** (CL_ADMIN fine-grained settings scope)
- **002#GAP-010** (tenant branding asset upload)

Expand the settings schema once, then layer the dependent gaps on top.

## Housekeeping rules

- When promoting a gap to `IMPLEMENTED`, move the row to "Closed gaps" with a date and commit reference, and update the corresponding `spec.md` Known Gaps table.
- When adding a new feature, append its gaps here in the same order as the feature's spec.
- A gap that spans multiple features lives under the feature that owns the decision, not under every consumer — cross-feature effects are captured in the Blocks column.
- Do NOT delete rows — history of closed gaps is useful for audit and retrospectives.
