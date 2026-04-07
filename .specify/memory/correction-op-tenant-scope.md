# Cross-Feature Correction: OP Must Be Tenant-Scoped

**Created**: 2026-04-06
**Status**: OPEN — approved rule, implementation diverges
**Origin**: Validation of feature 001 against business dossier via guia-properfy
**Impact**: ALL features (001–011)

## Canonical Rule

- `AM` is the **only** role with `tenant_id = null` and global access.
- `OP` **MUST** have a mandatory `tenant_id` in the JWT and operate only within its tenant.
- `CL_ADMIN` and `CL_USER` are tenant-scoped (already implemented correctly).
- Every query/mutation of a business entity must apply `tenant_id` filter based on the actor, except for `AM`.

## Current Divergence

The codebase treats OP as tenant-free (`tenant_id = null` in JWT, cross-tenant access allowed). This is documented in `CLAUDE.md` as "OP is tenant-free: Same as AM regarding tenant_id" — but the business dossier **does not approve this**.

## Reading of the OP Role

- OP = strong operational user **within** a single tenant (agency). Think "admin operacional local".
- OP can do more than CL_ADMIN (e.g., deactivate branches, manage service groups, cross-check DONE, approve financial entries) but only within their own tenant.
- OP cannot list, create, edit, or transition data from other tenants.

## Affected Features

Every feature that checks `actor.role === 'OP'` alongside `actor.role === 'AM'` for cross-tenant access is affected:

| Feature | Affected Areas |
|---|---|
| 001-identity-access | User CRUD (OP creates users for any tenant), auth middleware (OP skips tenant check) |
| 002-tenants-branches | ListTenants (OP sees all), CreateBranch (OP any tenant), Deactivate (if OP has access) |
| 003-properties | Create/update properties cross-tenant |
| 004-service-catalog | Service types are global (OK), pricing rules cross-tenant |
| 005-service-groups-marketplace | Publish/assign cross-tenant |
| 006-appointments | State transitions cross-tenant, cross-check cross-tenant |
| 007-tenant-portal | Token generation (OP scope) |
| 008-inspectors-execution | Inspector CRUD (global entity, but OP creates for any tenant context) |
| 009-notifications | Template management cross-tenant |
| 010-billing-ledger | Approve entries cross-tenant, manual adjustments cross-tenant |
| 011-reports-audit | Audit log scope (OP should see only own tenant), report scope |

## Correction Plan

1. **JWT model**: `OP` tokens MUST carry `tenant_id` (non-null). Migration: update user rows for OP users to have `tenant_id` set.
2. **Auth middleware**: maintain tenant-active check for OP (already done for CL roles). OP is no longer exempt.
3. **Use cases**: every use case that currently grants OP the same scope as AM must be reviewed. OP should use `actor.tenantId` for scoping, not pass-through `null`.
4. **Prisma seed/migration**: ensure every OP user has a `tenant_id` assigned.
5. **Constitution + CLAUDE.md**: update to reflect the canonical rule.
6. **Each feature spec**: update the RBAC tables and endpoint notes to reflect OP as tenant-scoped.

## Priority

HIGH — this is a security and data isolation concern. OP users currently have unintended cross-tenant access.

## Notes

- Service types and service regions are global entities (no `tenant_id`) — OP CRUD on these should still be allowed since they are platform-level catalogs. But OP should not be able to create pricing rules or service groups for other tenants.
- Inspectors are cross-tenant entities — but OP creating/managing inspectors should be scoped to inspectors eligible for the OP's tenant (not all inspectors).
- The correction should be tracked as a single coordinated effort, not scattered across 11 separate tasks.
