# Audit Log Retention Policy Design

## Overview

Audit log entries accumulate over time and require a retention policy to manage database size while preserving legally and operationally required records.

## Retention Tiers

| Tier | Retention Period | Action Pattern Examples |
|------|-----------------|------------------------|
| **Financial** | 7 years | `financial.*`, `billing.*`, `invoice.*`, `refund.*` |
| **General** | 5 years | `appointment.*`, `tenant.*`, `user.*`, `property.*`, `inspector.*`, `serviceGroup.*`, `notification.*`, `report.*` |
| **High-volume** | 2 years | `auth.loginSuccess`, `auth.refreshToken`, `auth.tokenVerified`, `portal.view`, `read.*` |

## Cross-check Protection Rule

An audit log entry MUST NOT be deleted if ALL of the following are true:

1. The entry action is `appointment.statusTransition`
2. The `after_json` field contains `"status": "DONE"`
3. The associated appointment has `done_checked_at IS NULL`

This ensures financial cross-check evidence is preserved until the appointment has been verified by an operator.

## Implementation

- **Worker:** `AuditRetentionWorker` runs daily at 03:30 UTC (off-peak)
- **Batch size:** 1000 entries per deletion batch to avoid long-running transactions
- **Return:** `{ deletedCount, preservedCount }` for observability
- **Safety:** Entries matching the cross-check protection rule are always preserved regardless of age

## Dependencies

- Feature 006 (Appointment cross-check) defines `done_checked_at` on the Appointment entity
