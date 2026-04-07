# Property Hard-Delete Runbook

## Overview

Soft-deleted properties (`deleted_at IS NOT NULL`) retain their `property_code` within the tenant's unique constraint, preventing reuse. Hard deletion permanently removes the property and all associated data. This is a **database-level operation** — no API endpoint is exposed.

## When to Use

- A property code needs to be freed for reuse within the same tenant
- Test/demo properties need full cleanup
- Compliance requires data destruction beyond soft-delete

## Prerequisites

- Confirm the property has no active appointments (`DRAFT`, `AWAITING_INSPECTOR`, `SCHEDULED`)
- Verify the property is already soft-deleted (`deleted_at IS NOT NULL`)
- Back up associated audit trail if retention is required

## Cascade Order

Delete in this exact order to respect foreign key constraints:

```sql
-- 1. Verify the target property
SELECT id, tenant_id, property_code, status, deleted_at
FROM properties WHERE id = '<PROPERTY_ID>';

-- 2. Remove inspection execution assets
DELETE FROM inspection_assets WHERE inspection_execution_id IN (
  SELECT id FROM inspection_executions WHERE appointment_id IN (
    SELECT id FROM appointments WHERE property_id = '<PROPERTY_ID>'
  )
);

-- 3. Remove inspection executions
DELETE FROM inspection_executions WHERE appointment_id IN (
  SELECT id FROM appointments WHERE property_id = '<PROPERTY_ID>'
);

-- 4. Remove financial entries linked to appointments on this property
DELETE FROM financial_entries WHERE appointment_id IN (
  SELECT id FROM appointments WHERE property_id = '<PROPERTY_ID>'
);

-- 5. Remove notifications linked to appointments
DELETE FROM notifications WHERE appointment_id IN (
  SELECT id FROM appointments WHERE property_id = '<PROPERTY_ID>'
);

-- 6. Remove tenant portal tokens and activity
DELETE FROM tenant_portal_activity WHERE appointment_id IN (
  SELECT id FROM appointments WHERE property_id = '<PROPERTY_ID>'
);
DELETE FROM tenant_portal_tokens WHERE appointment_id IN (
  SELECT id FROM appointments WHERE property_id = '<PROPERTY_ID>'
);

-- 7. Remove appointment contacts and restrictions
DELETE FROM appointment_contacts WHERE appointment_id IN (
  SELECT id FROM appointments WHERE property_id = '<PROPERTY_ID>'
);
DELETE FROM appointment_restrictions WHERE appointment_id IN (
  SELECT id FROM appointments WHERE property_id = '<PROPERTY_ID>'
);

-- 8. Remove service group appointments
DELETE FROM service_group_appointments WHERE appointment_id IN (
  SELECT id FROM appointments WHERE property_id = '<PROPERTY_ID>'
);

-- 9. Remove appointments
DELETE FROM appointments WHERE property_id = '<PROPERTY_ID>';

-- 10. Remove the property
DELETE FROM properties WHERE id = '<PROPERTY_ID>';
```

## Audit Trail Retention

Audit log entries (`audit_logs`) referencing this property are **NOT deleted**. The `entity_id` becomes an orphan reference — this is by design for compliance.

## Verification

```sql
-- Confirm property is gone
SELECT COUNT(*) FROM properties WHERE id = '<PROPERTY_ID>';  -- Should be 0

-- Confirm property code is freed
SELECT COUNT(*) FROM properties
WHERE tenant_id = '<TENANT_ID>' AND property_code = '<CODE>';  -- Should be 0

-- Confirm no orphaned appointments
SELECT COUNT(*) FROM appointments WHERE property_id = '<PROPERTY_ID>';  -- Should be 0
```

## Decision: Admin Endpoint

**Not exposing an admin endpoint.** Same rationale as tenant hard-delete:
- Destructive, irreversible, low frequency
- Database-level execution provides natural safety barrier
