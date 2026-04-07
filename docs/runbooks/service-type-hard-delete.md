# Service Type Hard-Delete Runbook

## Overview

Service types are global platform entities (no `tenant_id`). They cannot currently be deleted via API — inactive types accumulate as `INACTIVE`. This runbook covers the safe removal of a service type that was created in error or is no longer needed.

## When to Use

- A service type was created in error and needs removal
- A service type is being retired and all references have been cleaned up
- Test/demo data cleanup

## Prerequisites

Before deleting, verify the service type has **no active references**:

```sql
-- 1. Check for pricing rules referencing this service type
SELECT COUNT(*) FROM service_price_rules WHERE service_type_id = '<SERVICE_TYPE_ID>';

-- 2. Check for appointments referencing this service type
SELECT COUNT(*) FROM appointments WHERE service_type_id = '<SERVICE_TYPE_ID>';

-- 3. Check for service groups referencing this service type
SELECT COUNT(*) FROM service_groups WHERE service_type_id = '<SERVICE_TYPE_ID>';
```

**If any count > 0, do NOT proceed.** The service type is in use and cannot be safely deleted. Deactivate it instead (set `status = 'INACTIVE'` via the update endpoint).

## Cascade Order

Only proceed if all three counts above are zero:

```sql
-- 1. Verify zero references (re-check)
SELECT
  (SELECT COUNT(*) FROM service_price_rules WHERE service_type_id = '<SERVICE_TYPE_ID>') AS pricing_rules,
  (SELECT COUNT(*) FROM appointments WHERE service_type_id = '<SERVICE_TYPE_ID>') AS appointments,
  (SELECT COUNT(*) FROM service_groups WHERE service_type_id = '<SERVICE_TYPE_ID>') AS service_groups;

-- 2. Delete the service type
DELETE FROM service_types WHERE id = '<SERVICE_TYPE_ID>';
```

No cascade needed — if references are zero, the FK constraints won't block the delete.

## Verification

```sql
-- Confirm deletion
SELECT COUNT(*) FROM service_types WHERE id = '<SERVICE_TYPE_ID>';  -- Should be 0
```

## Audit Trail

Audit log entries referencing this service type are NOT deleted. The `entity_id` becomes an orphan reference — this is by design.

## Decision: Admin Endpoint

**Not exposing an admin endpoint.** Rationale:
- Service types are rarely created (< 10 total expected)
- Deletion is exceptional — deactivation is the normal lifecycle
- The zero-reference prerequisite is best verified manually
- If demand increases, consider `DELETE /v1/service-types/:id` with a pre-check (reject if any FK references exist)
