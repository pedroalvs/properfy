# Service Type Hard Delete — Safety Runbook

**Owner**: AM (Admin Master) only  
**Risk**: Irreversible — all associated pricing rules and references become orphaned

---

## Pre-Delete Safety Checks

Before attempting a hard delete of any service type, verify ALL of the following are zero:

```sql
-- 1. No active or historical appointments
SELECT COUNT(*) FROM appointments WHERE service_type_id = '<id>' AND deleted_at IS NULL;

-- 2. No pricing rules
SELECT COUNT(*) FROM service_price_rules WHERE service_type_id = '<id>';

-- 3. No service groups
SELECT COUNT(*) FROM service_groups WHERE service_type_id = '<id>' AND deleted_at IS NULL;

-- 4. No inspector specialisations
SELECT COUNT(*) FROM inspector_service_types WHERE service_type_id = '<id>';
```

All four queries must return `0` before proceeding.

---

## Hard Delete (AM-only)

There is no API endpoint for hard delete. Hard deletes must be performed directly on the database by an AM with DB access:

```sql
DELETE FROM service_types WHERE id = '<id>';
```

Soft delete (deactivation) is preferred in all other cases.  
The API route `PATCH /v1/service-types/:id` with `{ isActive: false }` is sufficient for operational deactivation.

---

## Decision Record

Per `specs/DECISIONS.md`, no AM-only hard-delete endpoint is exposed (DEC-028).  
Rationale: soft-delete is operationally sufficient and eliminates risk of accidental cascade.

---

## Recovery

Hard deletes are irreversible. Re-create the service type with the same configuration if needed.  
Pricing rules and inspector specialisations must be re-configured manually.
