# Appointment Number Reset Runbook

## Overview

Every appointment receives a globally unique, human-readable `appointment_number` via PostgreSQL's `autoincrement()` on the `appointments.appointment_number` column (Prisma `@default(autoincrement())`). This maps to a PostgreSQL `SERIAL` / sequence under the hood.

The sequence is **global** (not per-tenant). This is an intentional design decision.

## Design Decision: Global vs Per-Tenant Numbering

**Decision: global numbering is sufficient.**

Rationale:
- At operational scale (tens of thousands of appointments per year), a global integer sequence will not exhaust or become confusing.
- Per-tenant numbering would require a composite unique constraint (`tenant_id` + sequence), a custom trigger or application-level locking to safely increment, and adds significant complexity for marginal benefit.
- The `appointment_number` is used for quick human reference (e.g., "appointment #4521"), not as a primary key or external contract. The UUID `id` remains the canonical identifier.
- Tenants do not see each other's numbers, so gaps between their own numbers are acceptable and expected.

## Sequence Details

- **Sequence name:** Prisma auto-generates the sequence; typically named `appointments_appointment_number_seq`.
- **Column:** `appointments.appointment_number` (`INT`, `UNIQUE`, `NOT NULL`, auto-incrementing).
- **Max value:** 2,147,483,647 (PostgreSQL `integer` limit). At 100,000 appointments/year this lasts over 21,000 years.

## DBA Procedures (Dev/Staging Only)

> **WARNING:** Never reset or modify the sequence in production unless explicitly authorized and with a maintenance window. Resetting can cause unique constraint violations if existing rows have higher numbers.

### Inspect Current Sequence Value

```sql
SELECT last_value, is_called
FROM appointments_appointment_number_seq;
```

### Reset Sequence After Data Wipe (Dev/Staging)

Use this after truncating the appointments table during development or staging resets:

```sql
-- 1. Verify the table is empty (or know the max existing value)
SELECT COALESCE(MAX(appointment_number), 0) AS max_number
FROM appointments;

-- 2. Reset to 1 (only safe if the table is empty)
ALTER SEQUENCE appointments_appointment_number_seq RESTART WITH 1;

-- 3. Or reset to max + 1 (safe even with existing rows)
SELECT setval(
  'appointments_appointment_number_seq',
  COALESCE((SELECT MAX(appointment_number) FROM appointments), 0) + 1,
  false
);
```

### Fix a Corrupted Sequence

If the sequence has fallen behind the max `appointment_number` (e.g., after a manual data import):

```sql
SELECT setval(
  'appointments_appointment_number_seq',
  (SELECT MAX(appointment_number) FROM appointments) + 1,
  false
);
```

### Verify Sequence Name

If the sequence name differs from the default:

```sql
SELECT pg_get_serial_sequence('appointments', 'appointment_number');
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `unique violation on appointment_number` on insert | Sequence is behind max value | Run the "Fix a Corrupted Sequence" query above |
| Gaps in appointment numbers | Normal; caused by rolled-back transactions or deleted rows | No action needed; gaps are expected |
| Very large numbers after staging reset | Sequence was not reset after truncate | Run the "Reset Sequence" query above |
