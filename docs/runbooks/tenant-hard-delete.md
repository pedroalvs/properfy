# Tenant Hard-Delete Runbook

## Overview

Soft-deleted tenants (`deleted_at IS NOT NULL`) retain their `legal_name` in the unique index, preventing reuse. Hard deletion permanently removes the tenant and all associated data. This is a **database-level operation** — no API endpoint is exposed.

## When to Use

- A tenant needs their legal name freed for reuse (e.g., re-onboarding after cancellation)
- A test/demo tenant needs full cleanup
- Compliance requires data destruction beyond soft-delete

## Prerequisites

- Confirm with the operations team that the tenant has no pending financial disputes
- Verify the tenant is already in `INACTIVE` status and soft-deleted
- Back up the tenant's audit trail if retention is required (see audit retention policy)

## Cascade Order

Delete in this exact order to respect foreign key constraints:

```sql
-- 1. Verify the target tenant
SELECT id, name, legal_name, status, deleted_at
FROM tenants WHERE id = '<TENANT_ID>';

-- 2. Remove inspection execution assets
DELETE FROM inspection_assets WHERE inspection_execution_id IN (
  SELECT id FROM inspection_executions WHERE appointment_id IN (
    SELECT id FROM appointments WHERE tenant_id = '<TENANT_ID>'
  )
);

-- 3. Remove inspection executions
DELETE FROM inspection_executions WHERE appointment_id IN (
  SELECT id FROM appointments WHERE tenant_id = '<TENANT_ID>'
);

-- 4. Remove financial entries and invoices
DELETE FROM financial_entries WHERE tenant_id = '<TENANT_ID>';
DELETE FROM inspector_invoices WHERE tenant_id = '<TENANT_ID>';

-- 5. Remove notifications
DELETE FROM notifications WHERE tenant_id = '<TENANT_ID>';

-- 6. Remove tenant portal tokens and activity
DELETE FROM tenant_portal_activity WHERE tenant_id = '<TENANT_ID>';
DELETE FROM tenant_portal_tokens WHERE appointment_id IN (
  SELECT id FROM appointments WHERE tenant_id = '<TENANT_ID>'
);

-- 7. Remove appointment contacts, restrictions, imports
DELETE FROM appointment_contacts WHERE appointment_id IN (
  SELECT id FROM appointments WHERE tenant_id = '<TENANT_ID>'
);
DELETE FROM appointment_restrictions WHERE appointment_id IN (
  SELECT id FROM appointments WHERE tenant_id = '<TENANT_ID>'
);
DELETE FROM appointment_imports WHERE tenant_id = '<TENANT_ID>';

-- 8. Remove appointments
DELETE FROM appointments WHERE tenant_id = '<TENANT_ID>';

-- 9. Remove appointment time slots
DELETE FROM appointment_time_slots WHERE tenant_id = '<TENANT_ID>';

-- 10. Remove service groups and related
DELETE FROM service_group_appointments WHERE service_group_id IN (
  SELECT id FROM service_groups WHERE tenant_id = '<TENANT_ID>'
);
DELETE FROM service_groups WHERE tenant_id = '<TENANT_ID>';

-- 11. Remove properties and imports
DELETE FROM property_imports WHERE tenant_id = '<TENANT_ID>';
DELETE FROM properties WHERE tenant_id = '<TENANT_ID>';

-- 12. Remove pricing rules
DELETE FROM service_price_rules WHERE tenant_id = '<TENANT_ID>';

-- 13. Remove service regions and inspector region assignments
DELETE FROM inspector_regions WHERE service_region_id IN (
  SELECT id FROM service_regions WHERE tenant_id = '<TENANT_ID>'
);
DELETE FROM service_regions WHERE tenant_id = '<TENANT_ID>';

-- 14. Remove reports
DELETE FROM reports WHERE tenant_id = '<TENANT_ID>';

-- 15. Remove notification templates
DELETE FROM notification_templates WHERE tenant_id = '<TENANT_ID>';

-- 16. Remove sessions and password reset tokens for tenant users
DELETE FROM sessions WHERE user_id IN (
  SELECT id FROM users WHERE tenant_id = '<TENANT_ID>'
);
DELETE FROM password_reset_tokens WHERE user_id IN (
  SELECT id FROM users WHERE tenant_id = '<TENANT_ID>'
);
DELETE FROM password_history WHERE user_id IN (
  SELECT id FROM users WHERE tenant_id = '<TENANT_ID>'
);

-- 17. Remove users
DELETE FROM users WHERE tenant_id = '<TENANT_ID>';

-- 18. Remove branches
DELETE FROM branches WHERE tenant_id = '<TENANT_ID>';

-- 19. Finally, remove the tenant
DELETE FROM tenants WHERE id = '<TENANT_ID>';
```

## Audit Trail Retention

**Important**: Audit log entries (`audit_logs`) referencing this tenant are NOT deleted by this runbook. Audit records are retained for compliance even after the source entity is removed. The `tenant_id` in audit records becomes an orphan reference — this is by design.

If audit records must also be purged (e.g., LGPD full erasure), run the audit redaction workflow separately after the tenant is deleted.

## Verification

After deletion:

```sql
-- Confirm tenant is gone
SELECT COUNT(*) FROM tenants WHERE id = '<TENANT_ID>';  -- Should be 0

-- Confirm legal name is freed
SELECT COUNT(*) FROM tenants WHERE legal_name = '<LEGAL_NAME>';  -- Should be 0

-- Confirm no orphaned data
SELECT COUNT(*) FROM users WHERE tenant_id = '<TENANT_ID>';  -- Should be 0
SELECT COUNT(*) FROM branches WHERE tenant_id = '<TENANT_ID>';  -- Should be 0
SELECT COUNT(*) FROM appointments WHERE tenant_id = '<TENANT_ID>';  -- Should be 0
```

## Decision: Admin Endpoint

**Not exposing an admin endpoint at this time.** Rationale:
- Hard delete is destructive and irreversible
- The cascade order is complex and benefits from manual verification
- Frequency is very low (expected: less than once per month)
- Database-level execution provides a natural safety barrier

If demand increases, consider a two-phase endpoint: `POST /v1/admin/tenants/:id/prepare-hard-delete` (dry run showing cascade counts) + `POST /v1/admin/tenants/:id/hard-delete` (requires confirmation token from the dry run).

## Emergency: Partial Failure

If the cascade fails mid-execution (e.g., constraint violation):

1. Do NOT retry blindly — investigate the failing constraint
2. The most likely cause is a missing cascade step (new table added without updating this runbook)
3. Run `SELECT * FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY' AND ... ` to find remaining references
4. Update this runbook with the missing step before retrying
