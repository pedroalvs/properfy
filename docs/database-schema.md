# Properfy Database Schema Reference

**Source**: `apps/backend/prisma/schema.prisma`
**Database**: PostgreSQL (Supabase)
**Last updated**: 2026-04-12

All IDs are UUID v4. All timestamps are `timestamptz`. Column names follow `snake_case`; the Prisma client exposes them as `camelCase`.

---

## Table of Contents

1. [Identity & Access](#1-identity--access)
   - [tenants](#tenants)
   - [branches](#branches)
   - [users](#users)
   - [sessions](#sessions)
   - [password_reset_tokens](#password_reset_tokens)
   - [password_history](#password_history)
2. [Properties](#2-properties)
   - [properties](#properties)
3. [Service Catalog](#3-service-catalog)
   - [service_types](#service_types)
   - [service_price_rules](#service_price_rules)
4. [Inspectors](#4-inspectors)
   - [inspectors](#inspectors)
   - [inspector_availability_slots](#inspector_availability_slots)
   - [inspector_regions](#inspector_regions)
5. [Contacts](#5-contacts)
   - [contacts](#contacts)
6. [Appointments](#6-appointments)
   - [appointments](#appointments)
   - [appointment_contacts](#appointment_contacts)
   - [appointment_restrictions](#appointment_restrictions)
   - [appointment_imports](#appointment_imports)
   - [appointment_time_slots](#appointment_time_slots)
7. [Service Groups & Marketplace](#7-service-groups--marketplace)
   - [service_groups](#service_groups)
   - [service_regions](#service_regions)
8. [Tenant Portal](#8-tenant-portal)
   - [tenant_portal_tokens](#tenant_portal_tokens)
   - [tenant_portal_activities](#tenant_portal_activities)
9. [Inspector Execution](#9-inspector-execution)
   - [inspection_executions](#inspection_executions)
   - [inspection_assets](#inspection_assets)
10. [Billing & Finance](#10-billing--finance)
    - [financial_entries](#financial_entries)
    - [inspector_invoices](#inspector_invoices)
    - [tenant_invoices](#tenant_invoices)
11. [Notifications](#11-notifications)
    - [notifications](#notifications)
    - [notification_templates](#notification_templates)
    - [notification_attempts](#notification_attempts)
    - [notification_consents](#notification_consents)
12. [Reports](#12-reports)
    - [reports](#reports)
    - [scheduled_reports](#scheduled_reports)
    - [scheduled_report_runs](#scheduled_report_runs)
13. [Audit & Compliance](#13-audit--compliance)
    - [audit_logs](#audit_logs)
    - [audit_logs_archive](#audit_logs_archive)
    - [audit_retention_category_configs](#audit_retention_category_configs)
    - [audit_preservation_rules](#audit_preservation_rules)
    - [audit_legal_holds](#audit_legal_holds)
    - [pii_field_mappings](#pii_field_mappings)
    - [data_subject_erasure_requests](#data_subject_erasure_requests)
14. [Infrastructure](#14-infrastructure)
    - [idempotency_keys](#idempotency_keys)
    - [property_imports](#property_imports)

---

## 1. Identity & Access

### tenants

Top-level agency account. Every business entity is scoped to a tenant.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `name` | varchar(200) | no | — | Display name of the agency |
| `legal_name` | varchar(200) | no | — | Legal/registered name. Globally unique. |
| `status` | TenantStatus | no | `PENDING` | `PENDING` / `ACTIVE` / `INACTIVE` |
| `timezone` | varchar(60) | no | `Australia/Sydney` | IANA timezone for cutoff calculations |
| `currency` | char(3) | no | `AUD` | ISO 4217 currency code |
| `settings_json` | jsonb | no | `{}` | Tenant-level settings (CL_USER permissions, portal cutoff, etc.) |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |
| `deleted_at` | timestamptz | yes | — | Soft delete |

**Relations**: branches[], users[], properties[], appointments[], contacts[], financial_entries[], notifications[], reports[], and more.

---

### branches

Subdivision of a tenant (agency branch/office).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `tenant_id` | uuid | no | — | FK → tenants. Must be active. |
| `name` | varchar(200) | no | — | Branch display name. Unique per tenant (case-insensitive). |
| `address_json` | jsonb | yes | — | Structured address data |
| `contact_email` | varchar(254) | yes | — | Operational email for PM escalation notifications |
| `status` | BranchStatus | no | `ACTIVE` | `ACTIVE` / `INACTIVE` |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |
| `deleted_at` | timestamptz | yes | — | Soft delete |

**Relations**: tenant → Tenant, users[], properties[], appointments[], appointment_time_slots[], price_rules[]

---

### users

Internal authenticated users (operators, agency staff, inspectors).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `tenant_id` | uuid | yes | — | FK → tenants. NULL only for AM role. |
| `branch_id` | uuid | yes | — | FK → branches. Optional branch assignment. |
| `role` | UserRole | no | — | `AM` / `OP` / `CL_ADMIN` / `CL_USER` / `INSP` |
| `name` | varchar(200) | no | — | Full name |
| `email` | varchar(254) | no | — | Login email |
| `phone` | varchar(20) | yes | — | Phone number |
| `status` | UserStatus | no | `ACTIVE` | `ACTIVE` / `INACTIVE` / `LOCKED` / `PENDING_INVITE` |
| `password_hash` | text | no | — | Bcrypt hash |
| `totp_secret` | text | yes | — | Encrypted TOTP secret for 2FA |
| `totp_enabled` | boolean | no | `false` | Whether 2FA is active |
| `failed_login_count` | int | no | `0` | Consecutive failed logins (resets on success) |
| `locked_until` | timestamptz | yes | — | Account lock expiry after too many failures |
| `last_login_at` | timestamptz | yes | — | Last successful login |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |
| `deleted_at` | timestamptz | yes | — | Soft delete |

**Relations**: tenant? → Tenant, branch? → Branch, inspector? → Inspector, sessions[], created_appointments[], done_checked_appointments[], financial entries (initiated, approved, voided)

---

### sessions

JWT refresh token sessions.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `user_id` | uuid | no | — | FK → users |
| `refresh_token_hash` | text | no | — | SHA-256 of the refresh token |
| `ip_address` | varchar(45) | yes | — | Client IP at creation |
| `user_agent` | varchar(500) | yes | — | Browser/client identifier |
| `country_code` | varchar(2) | yes | — | GeoIP country |
| `device_fingerprint` | varchar(64) | yes | — | Optional device fingerprint |
| `expires_at` | timestamptz | no | — | Session expiry (10 days) |
| `revoked_at` | timestamptz | yes | — | Set on logout or forced revocation |
| `created_at` | timestamptz | no | `now()` | |

---

### password_reset_tokens

One-time tokens for password reset flow.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `user_id` | uuid | no | — | FK → users |
| `token_hash` | text | no | — | SHA-256 of the raw reset token |
| `expires_at` | timestamptz | no | — | Token expiry |
| `used_at` | timestamptz | yes | — | Set when consumed |
| `created_at` | timestamptz | no | `now()` | |

---

### password_history

Tracks previous password hashes to prevent reuse.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `user_id` | uuid | no | — | FK → users |
| `password_hash` | text | no | — | Previous bcrypt hash |
| `created_at` | timestamptz | no | `now()` | |

---

## 2. Properties

### properties

Physical property linked to a tenant for inspection.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `tenant_id` | uuid | no | — | FK → tenants |
| `branch_id` | uuid | yes | — | FK → branches. Optional branch assignment. |
| `property_code` | varchar(50) | no | — | Human-readable code. Unique per tenant. |
| `type` | PropertyType | no | — | `RESIDENTIAL` / `COMMERCIAL` / `INDUSTRIAL` / `RURAL` |
| `street` | varchar(300) | no | — | Street address |
| `address_line_2` | varchar(200) | yes | — | Unit/suite/level |
| `suburb` | varchar(100) | no | — | Suburb/city |
| `postcode` | varchar(20) | no | — | Postal code |
| `state` | varchar(100) | no | — | State/province |
| `country` | varchar(100) | no | `AU` | Country |
| `lat` | decimal(10,7) | yes | — | Latitude (from geocoding) |
| `lng` | decimal(10,7) | yes | — | Longitude (from geocoding) |
| `geocoding_status` | GeocodingStatus | no | `PENDING` | `PENDING` / `SUCCESS` / `FAILED` / `MANUAL` |
| `coordinates` | geometry(Point,4326) | yes | — | PostGIS point for spatial queries |
| `notes` | text | yes | — | Free-text notes |
| `rules_json` | jsonb | no | `{}` | Property-specific rules |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |
| `deleted_at` | timestamptz | yes | — | Soft delete |

**Unique**: `(tenant_id, property_code)`

---

## 3. Service Catalog

### service_types

Catalog of inspection types.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `code` | varchar(50) | no | — | Machine-readable code. Globally unique. |
| `name` | varchar(200) | no | — | Display name |
| `flow_type` | ServiceTypeFlowType | no | — | `ROUTINE` / `INGOING` / `OUTGOING`. Determines confirmation requirements. |
| `requires_tenant_confirmation` | boolean | no | `true` | Whether tenant portal confirmation is required before scheduling |
| `status` | ServiceTypeStatus | no | `ACTIVE` | `ACTIVE` / `INACTIVE` |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

---

### service_price_rules

Pricing configuration per tenant + service type + optional branch.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `tenant_id` | uuid | no | — | FK → tenants |
| `currency` | varchar(3) | no | — | ISO 4217 |
| `service_type_id` | uuid | no | — | FK → service_types |
| `branch_id` | uuid | yes | — | FK → branches. NULL = tenant-wide rule. |
| `price_amount` | decimal(12,2) | no | — | Amount charged to tenant |
| `payout_type` | PayoutType | no | — | `FIXED` / `PERCENTAGE` — how inspector payout is calculated |
| `payout_value` | decimal(12,2) | no | — | Fixed amount or percentage value |
| `bonus_rule_json` | jsonb | yes | — | Optional bonus rules |
| `status` | PriceRuleStatus | no | `ACTIVE` | `ACTIVE` / `INACTIVE` |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

**Unique**: `(tenant_id, service_type_id, branch_id)` — one active rule per combination.

---

## 4. Inspectors

### inspectors

Contractor who performs property inspections. Cross-tenant entity (can serve multiple agencies).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `user_id` | uuid | yes | — | FK → users. Links to auth account with INSP role. Unique. |
| `name` | varchar(200) | no | — | Display name |
| `email` | varchar(254) | no | — | Contact email. Globally unique. |
| `phone` | varchar(20) | yes | — | Contact phone |
| `status` | InspectorStatus | no | `ACTIVE` | `ACTIVE` / `INACTIVE` |
| `payment_settings_json` | jsonb | no | `{}` | Payment preferences (bank details, etc.) |
| `regions_json` | jsonb | no | `[]` | Legacy region assignments (being replaced by inspector_regions) |
| `service_types_json` | jsonb | no | `[]` | Service types the inspector can perform |
| `client_eligibility_json` | jsonb | no | `[]` | List of `{ tenantId }` entries the inspector is eligible for. Feedback round proposes renaming to `blocked_clients_json` with inverted semantics (feature 008 FR-006a, pending). |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |
| `deleted_at` | timestamptz | yes | — | Soft delete |

---

### inspector_availability_slots

Inspector schedule slots for a given date.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `inspector_id` | uuid | no | — | FK → inspectors |
| `date` | date | no | — | The date this slot is for |
| `start_time` | varchar(5) | no | — | `HH:mm` format |
| `end_time` | varchar(5) | no | — | `HH:mm` format |
| `region_json` | jsonb | yes | — | Region metadata for the slot |
| `capacity` | int | no | `1` | How many appointments the slot can hold |
| `status` | AvailabilitySlotStatus | no | `AVAILABLE` | `AVAILABLE` / `BOOKED` / `CANCELLED` |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

---

### inspector_regions

Many-to-many join between inspectors and service regions.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `inspector_id` | uuid | no | — | FK → inspectors. Part of composite PK. |
| `region_id` | uuid | no | — | FK → service_regions. Part of composite PK. |
| `assigned_at` | timestamptz | no | `now()` | When the assignment was made |
| `assigned_by` | text | yes | — | User who made the assignment |

**PK**: `(inspector_id, region_id)`

---

## 5. Contacts

### contacts

Per-tenant contact registry (feature 021). Stores people the agency works with — tenants, property managers, brokers, housekeepers.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `tenant_id` | uuid | no | — | FK → tenants. Scopes the contact to an agency. |
| `type` | ContactType | no | — | `TENANT` / `PROPERTY_MANAGER` / `HOUSEKEEPER` / `BROKER` / `OTHER` — permanent identity classification |
| `display_name` | varchar(200) | no | — | The contact's display name |
| `company` | varchar(200) | yes | — | Company name (relevant for PMs and brokers) |
| `primary_email` | varchar(254) | yes | — | Main email. Unique per tenant among active contacts. |
| `primary_phone` | varchar(30) | yes | — | Main phone. Unique per tenant among active contacts. |
| `additional_channels_json` | jsonb | no | `[]` | Array of `{ channel: "EMAIL"|"PHONE", value, label? }`. Max ~10. |
| `notes` | text | yes | — | Free-text operator notes |
| `is_active` | boolean | no | `true` | Soft-delete flag. Inactive contacts excluded from search/autocomplete. |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

**Partial unique indexes** (active contacts only, managed in migration SQL):
- `contacts_tenant_email_active_unique` — `UNIQUE (tenant_id, primary_email) WHERE is_active = true AND primary_email IS NOT NULL`
- `contacts_tenant_phone_active_unique` — `UNIQUE (tenant_id, primary_phone) WHERE is_active = true AND primary_phone IS NOT NULL`

**CHECK constraint**: `contacts_at_least_one_channel` — `primary_email IS NOT NULL OR primary_phone IS NOT NULL`

**GIN index**: `contacts_display_name_trgm_idx` — trigram index for fast autocomplete search (requires `pg_trgm` extension)

---

## 6. Appointments

### appointments

Central business entity. Every other feature exists to support its lifecycle.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `appointment_number` | int | no | autoincrement | Globally unique human-readable reference |
| `tenant_id` | uuid | no | — | FK → tenants |
| `branch_id` | uuid | no | — | FK → branches. Must be active. |
| `property_id` | uuid | no | — | FK → properties. Must belong to same tenant. |
| `service_type_id` | uuid | no | — | FK → service_types. Must be active. |
| `inspector_id` | uuid | yes | — | FK → inspectors. Set when SCHEDULED. |
| `service_group_id` | uuid | yes | — | FK → service_groups. Set when linked to a marketplace group. |
| `status` | AppointmentStatus | no | `DRAFT` | `DRAFT` / `AWAITING_INSPECTOR` / `SCHEDULED` / `DONE` / `CANCELLED` / `REJECTED` |
| `scheduled_date` | date | no | — | The date the inspection is scheduled for |
| `time_slot` | varchar(50) | no | — | Format `HH:mm-HH:mm`. Validated against effective catalog. |
| `key_required` | boolean | no | `false` | Whether the inspector needs a key to enter |
| `meeting_location` | varchar(500) | yes | — | Where to meet |
| `key_location` | varchar(500) | yes | — | Where to pick up the key |
| `tenant_confirmation_status` | TenantConfirmationStatus | no | `PENDING` | `PENDING` / `CONFIRMED` / `UNAVAILABLE` / `NO_RESPONSE` |
| `price_amount` | decimal(12,2) | no | — | Amount charged to tenant. Snapshot from pricing rule at creation. Immutable. |
| `payout_amount` | decimal(12,2) | no | — | Amount paid to inspector. Computed at creation. Immutable. |
| `pricing_rule_snapshot_json` | jsonb | no | — | Frozen copy of the pricing rule at creation time |
| `notes` | text | yes | — | Operator notes |
| `custom_fields_json` | jsonb | yes | — | Opaque custom fields |
| `reason` | text | yes | — | Set on transitions that require a reason |
| `cancellation_reason_code` | varchar(50) | yes | — | Typed code on cancellation |
| `rejection_reason_code` | varchar(50) | yes | — | Typed code on rejection |
| `created_by_user_id` | uuid | no | — | FK → users. Who created this appointment. |
| `done_marked_by_user_id` | uuid | yes | — | FK → users. Who marked it DONE. |
| `done_checked_by_user_id` | uuid | yes | — | FK → users. Who cross-checked it (two-person rule). |
| `done_checked_at` | timestamptz | yes | — | When the cross-check happened |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |
| `deleted_at` | timestamptz | yes | — | Soft delete (AM-only, DRAFT-only) |

**Key relations**: contacts[] (junction), restrictions[], portal_tokens[], execution?, financial_entries[], notifications[]

---

### appointment_contacts

Junction + snapshot table linking appointments to the contact registry (feature 021). Each row freezes the contact's name/email/phone at link time for audit safety.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `appointment_id` | uuid | no | — | FK → appointments. ON DELETE CASCADE. Multiple rows per appointment. |
| `contact_id` | uuid | yes | — | FK → contacts (feature 021). **Nullable** for legacy data (pre-021 rows have NULL). |
| `tenant_name` | varchar(200) | no | — | **Legacy** — renter display name. Kept during expand phase. |
| `primary_email` | varchar(254) | yes | — | **Legacy** — kept during expand phase |
| `secondary_email` | varchar(254) | yes | — | **Legacy** — kept during expand phase |
| `primary_phone` | varchar(30) | yes | — | **Legacy** — kept during expand phase |
| `secondary_phone` | varchar(30) | yes | — | **Legacy** — kept during expand phase |
| `role` | AppointmentContactRole | no | `TENANT` | Contextual role: `TENANT` / `TENANT_REPRESENTATIVE` / `HOUSEKEEPER` / `PROPERTY_MANAGER` / `BROKER` / `OTHER` |
| `is_primary` | boolean | no | `true` | Exactly one row per appointment must be true |
| `snapshot_name` | varchar(200) | yes | — | Frozen at link time from `contacts.display_name` |
| `snapshot_email` | varchar(254) | yes | — | Frozen at link time from `contacts.primary_email` |
| `snapshot_phone` | varchar(30) | yes | — | Frozen at link time from `contacts.primary_phone` |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

**Partial unique indexes** (managed in migration SQL):
- `UNIQUE (appointment_id) WHERE is_primary = TRUE` — exactly one primary per appointment
- `UNIQUE (appointment_id, contact_id) WHERE contact_id IS NOT NULL` — no duplicate registry contacts per appointment

---

### appointment_restrictions

Scheduling restrictions reported by the renter, agency, or inspector.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `appointment_id` | uuid | no | — | FK → appointments. ON DELETE CASCADE. |
| `is_home` | boolean | no | — | Whether the renter is normally home |
| `unavailable_days_json` | jsonb | yes | — | Array of day strings (e.g., `"MON"`, `"WED"`) |
| `unavailable_hours_json` | jsonb | yes | — | Array of hour ranges |
| `notes` | text | yes | — | Free-text notes |
| `source` | RestrictionSource | no | — | `TENANT_PORTAL` / `OPERATOR` / `IMPORT` |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

---

### appointment_imports

Bulk import job tracking for appointment CSV/XLSX uploads.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `tenant_id` | uuid | no | — | FK → tenants |
| `status` | varchar(20) | no | `PENDING` | `PENDING` / `PROCESSING` / `DONE` / `FAILED` |
| `file_key` | varchar(500) | no | — | Storage key in Supabase Storage |
| `original_filename` | varchar(255) | no | — | Original uploaded filename |
| `total_rows` | int | no | `0` | Total rows in the file |
| `success_count` | int | no | `0` | Successfully imported rows |
| `error_count` | int | no | `0` | Failed rows |
| `errors_json` | jsonb | yes | — | Per-row error details |
| `created_by_user_id` | uuid | no | — | FK → users |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

---

### appointment_time_slots

Configurable time slot catalog per tenant + optional branch.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `tenant_id` | uuid | no | — | FK → tenants |
| `branch_id` | uuid | yes | — | FK → branches. NULL = tenant-wide slot. |
| `label` | varchar(100) | no | — | Display label (e.g., "Morning") |
| `start_time` | varchar(5) | no | — | `HH:mm` format |
| `end_time` | varchar(5) | no | — | `HH:mm` format |
| `sort_order` | int | no | `0` | Display ordering |
| `is_active` | boolean | no | `true` | Whether this slot is available for selection |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |
| `deleted_at` | timestamptz | yes | — | Soft delete |

**Unique**: `(tenant_id, branch_id, start_time, end_time)`

---

## 7. Service Groups & Marketplace

### service_groups

Batch of appointments grouped for marketplace offer/acceptance flow.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `tenant_id` | uuid | no | — | FK → tenants |
| `service_type_id` | uuid | no | — | FK → service_types |
| `status` | ServiceGroupStatus | no | `DRAFT` | `DRAFT` / `PUBLISHED` / `ACCEPTED` / `CANCELLED` / `REJECTED` |
| `group_size` | int | no | — | Number of appointments in the group |
| `offered_count` | int | no | `0` | How many inspectors received the offer |
| `confirmed_count` | int | no | `0` | How many accepted |
| `scheduled_date` | date | no | — | Target inspection date |
| `time_window` | varchar(11) | no | — | e.g., `09:00-17:00` |
| `name` | varchar(255) | yes | — | Display name |
| `region_name` | varchar(255) | yes | — | Region label |
| `description` | text | yes | — | Description for inspectors |
| `priority_mode` | PriorityMode | no | `STANDARD` | `STANDARD` / `PRIORITY_24H` |
| `priority_expires_at` | timestamptz | yes | — | When priority mode expires |
| `exception_type` | ServiceGroupExceptionType | yes | — | `LOW_DENSITY_REGION` / `ISOLATED_SERVICE` / `PRIORITY_CLIENT` |
| `exception_reason` | text | yes | — | Justification for exception |
| `assigned_inspector_id` | uuid | yes | — | FK → inspectors. Set on acceptance. |
| `service_region_id` | uuid | yes | — | FK → service_regions |
| `published_at` | timestamptz | yes | — | When published to marketplace |
| `assigned_at` | timestamptz | yes | — | When inspector accepted |
| `created_by_user_id` | uuid | no | — | FK → users |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

---

### service_regions

Geographic regions for marketplace grouping and inspector assignment. Per-tenant entity.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `tenant_id` | uuid | no | — | FK → tenants |
| `name` | varchar(255) | no | — | Region name. Unique per tenant. |
| `geom` | geometry(Polygon,4326) | yes | — | PostGIS polygon for spatial queries |
| `geojson` | jsonb | no | `{}` | GeoJSON representation |
| `color` | varchar(20) | no | `#3b82f6` | Map display color |
| `status` | RegionStatus | no | `ACTIVE` | `ACTIVE` / `INACTIVE` |
| `created_by_user_id` | uuid | yes | — | FK → users |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

**Unique**: `(tenant_id, name)`

---

## 8. Tenant Portal

### tenant_portal_tokens

One-time tokenized access for renters to confirm/reschedule inspections.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `appointment_id` | uuid | no | — | FK → appointments |
| `token_hash` | text | no | — | SHA-256 of the raw token. Globally unique. Raw token returned only once. |
| `expires_at` | timestamptz | no | — | 7 PM day-before-scheduled in tenant timezone |
| `status` | TenantPortalTokenStatus | no | `ACTIVE` | `ACTIVE` / `EXPIRED` / `REVOKED` |
| `used_at` | timestamptz | yes | — | Single-use for mutations (GET still works after used) |
| `last_accessed_at` | timestamptz | yes | — | Updated on every portal access |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

---

### tenant_portal_activities

Append-only log of renter actions via the portal.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `appointment_id` | uuid | no | — | FK → appointments |
| `tenant_portal_token_id` | uuid | no | — | FK → tenant_portal_tokens |
| `action` | TenantPortalAction | no | — | `VIEW` / `CONFIRM` / `RESCHEDULE` / `CONTACT_UPDATED` / `UNAVAILABLE_REPORTED` |
| `previous_values_json` | jsonb | yes | — | Before snapshot |
| `new_values_json` | jsonb | yes | — | After snapshot |
| `ip_address` | text | yes | — | Client IP |
| `user_agent` | text | yes | — | Browser/client |
| `created_at` | timestamptz | no | `now()` | |
| `retention_category` | AuditRetentionCategory | yes | — | Feature 020 retention tier |
| `redaction_status` | AuditRedactionStatus | no | `NONE` | Feature 020 PII redaction state |
| `cold_storage` | boolean | no | `false` | Feature 020 archival flag |

---

## 9. Inspector Execution

### inspection_executions

Record of an inspector executing an inspection in the field.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `appointment_id` | uuid | no | — | FK → appointments. One execution per appointment. Unique. |
| `inspector_id` | uuid | no | — | FK → inspectors |
| `started_at` | timestamptz | no | — | When the inspector pressed "Start" |
| `finished_at` | timestamptz | yes | — | When the inspector pressed "Done" |
| `resumed_at` | timestamptz | yes | — | When a paused execution was resumed |
| `start_latitude` | decimal(10,7) | no | — | GPS lat at start |
| `start_longitude` | decimal(10,7) | no | — | GPS lng at start |
| `finish_latitude` | decimal(10,7) | yes | — | GPS lat at finish |
| `finish_longitude` | decimal(10,7) | yes | — | GPS lng at finish |
| `geolocation_distance_meters` | decimal(10,2) | yes | — | Distance between start and finish |
| `checklist_json` | jsonb | yes | — | Inspection checklist data |
| `notes` | text | yes | — | Inspector notes |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

---

### inspection_assets

Evidence files (photos, documents, signatures) uploaded during inspection.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `appointment_id` | uuid | no | — | FK → appointments |
| `inspection_execution_id` | uuid | no | — | FK → inspection_executions |
| `storage_key` | text | no | — | Supabase Storage object key. Globally unique. |
| `mime_type` | text | no | — | File MIME type |
| `size_bytes` | int | yes | — | File size |
| `kind` | InspectionAssetKind | no | — | `PHOTO` / `DOCUMENT` / `SIGNATURE` |
| `status` | InspectionAssetStatus | no | `PENDING` | `PENDING` / `UPLOADED` / `UPLOAD_FAILED` |
| `uploaded_by` | text | no | — | User who uploaded |
| `upload_expires_at` | timestamptz | yes | — | Presigned URL expiry |
| `created_at` | timestamptz | no | `now()` | |

---

## 10. Billing & Finance

### financial_entries

Append-only ledger of financial transactions. Immutable after approval.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key (deterministic UUID for idempotency) |
| `tenant_id` | uuid | no | — | FK → tenants |
| `appointment_id` | uuid | yes | — | FK → appointments |
| `inspector_id` | uuid | yes | — | FK → inspectors |
| `entry_type` | FinancialEntryType | no | — | `TENANT_DEBIT` / `INSPECTOR_PAYOUT` / `REFUND` / `MANUAL_ADJUSTMENT` |
| `amount` | decimal(12,2) | no | — | Transaction amount. Always positive. |
| `currency` | char(3) | no | — | Inherited from tenant at creation |
| `status` | FinancialEntryStatus | no | `PENDING` | `PENDING` / `APPROVED` / `CANCELLED` / `VOIDED` |
| `description` | varchar(500) | no | — | Human-readable description |
| `effective_at` | timestamptz | no | — | Business date of the entry |
| `initiated_by_user_id` | uuid | no | — | FK → users. Who created it (or SYSTEM_USER_ID). |
| `approved_by_user_id` | uuid | yes | — | FK → users. Two-person approval rule. |
| `approved_at` | timestamptz | yes | — | When approved |
| `reference_entry_id` | uuid | yes | — | FK → financial_entries (self). For refunds/adjustments referencing the original. |
| `reason` | text | yes | — | Reason for manual adjustments/refunds |
| `voided_by_user_id` | uuid | yes | — | FK → users. Who voided it. |
| `voided_at` | timestamptz | yes | — | When voided |
| `void_reason` | text | yes | — | Reason for voiding |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

---

### inspector_invoices

Closing document for inspector payouts in a billing period.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `inspector_id` | uuid | no | — | FK → inspectors |
| `period_start` | date | no | — | Billing period start |
| `period_end` | date | no | — | Billing period end |
| `period_type` | BillingPeriodType | no | — | `WEEKLY` / `BIWEEKLY` / `MONTHLY` |
| `status` | InspectorInvoiceStatus | no | `OPEN` | `OPEN` / `CLOSED` / `PAID` / `SUPERSEDED` |
| `total_amount` | decimal(12,2) | no | `0` | Sum of approved INSPECTOR_PAYOUT entries in the period |
| `currency` | char(3) | no | — | |
| `file_key` | text | yes | — | Storage key for generated PDF |
| `generated_by_user_id` | uuid | yes | — | FK → users. Operator who generated. |
| `generated_at` | timestamptz | yes | — | |
| `paid_at` | timestamptz | yes | — | When marked as paid (feature 017) |
| `paid_by_user_id` | uuid | yes | — | FK → users (feature 017) |
| `payment_reference` | varchar(255) | yes | — | External payment reference (feature 017) |
| `notes` | text | yes | — | |
| `previous_invoice_id` | uuid | yes | — | FK → inspector_invoices (self). For supersession chain. Unique. |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

**Unique**: `(inspector_id, period_start, period_end)`

---

### tenant_invoices

Rolled-up invoice for tenant billing periods.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `tenant_id` | uuid | no | — | FK → tenants |
| `period_from` | date | no | — | Billing period start |
| `period_to` | date | no | — | Billing period end |
| `total_debit` | decimal(12,2) | no | `0` | Sum of TENANT_DEBIT entries |
| `total_refund` | decimal(12,2) | no | `0` | Sum of REFUND entries |
| `total_adjustment` | decimal(12,2) | no | `0` | Sum of MANUAL_ADJUSTMENT entries |
| `net_amount` | decimal(12,2) | no | `0` | `total_debit - total_refund + total_adjustment` |
| `currency` | char(3) | no | — | |
| `status` | TenantInvoiceStatus | no | `OPEN` | `OPEN` / `CLOSED` / `PAID` / `SUPERSEDED` |
| `file_key` | text | yes | — | Storage key for generated PDF |
| `previous_invoice_id` | uuid | yes | — | FK → tenant_invoices (self). Unique. |
| `generated_by_user_id` | uuid | yes | — | FK → users |
| `generated_at` | timestamptz | yes | — | |
| `notes` | text | yes | — | |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

---

## 11. Notifications

### notifications

Every outbound notification (email, SMS, WhatsApp) is persisted before dispatch.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `tenant_id` | uuid | no | — | FK → tenants |
| `appointment_id` | uuid | yes | — | FK → appointments. Optional — some notifications aren't appointment-scoped. |
| `recipient` | varchar(320) | no | — | Email address or phone number |
| `channel` | NotificationChannel | no | — | `EMAIL` / `SMS` / `WHATSAPP` |
| `template_code` | varchar(100) | no | — | References a notification_template |
| `status` | NotificationStatus | no | `PENDING` | `PENDING` / `SENT` / `DELIVERED` / `FAILED` / `SKIPPED` / `SKIPPED_OPT_OUT` |
| `notification_class` | NotificationClass | yes | — | `TRANSACTIONAL` / `OPERATIONAL` / `MARKETING` |
| `provider_name` | varchar(50) | yes | — | e.g., `resend`, `mobile-message`, `zenvia` |
| `provider_message_id` | varchar(200) | yes | — | Provider's tracking ID for webhook matching |
| `sent_at` | timestamptz | yes | — | When dispatched |
| `delivered_at` | timestamptz | yes | — | Confirmed delivery via webhook |
| `failed_at` | timestamptz | yes | — | Terminal failure |
| `failure_reason` | text | yes | — | Provider error message |
| `payload_json` | jsonb | no | — | Template variables |
| `retry_count` | int | no | `0` | Current retry attempt |
| `next_retry_at` | timestamptz | yes | — | Exponential backoff schedule |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

---

### notification_templates

Configurable templates with tenant-specific overrides.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `tenant_id` | uuid | yes | — | FK → tenants. NULL = platform default. |
| `template_code` | varchar(100) | no | — | e.g., `INSPECTION_NOTICE`, `REMINDER_7_DAYS` |
| `channel` | NotificationChannel | no | — | Which channel this template serves |
| `subject` | varchar(255) | yes | — | Email subject (null for SMS/WhatsApp) |
| `body_html` | text | yes | — | HTML body for email |
| `body_text` | text | no | — | Plain text body (all channels) |
| `variables_json` | jsonb | no | — | Expected `{{variable}}` names |
| `is_active` | boolean | no | `true` | |
| `notification_class` | NotificationClass | no | `OPERATIONAL` | Classification for consent management |
| `whatsapp_approval_status` | WhatsAppApprovalStatus | no | `PENDING` | Meta approval status for WhatsApp templates |
| `whatsapp_approval_reference` | varchar(255) | yes | — | Meta reference ID |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

**Unique**: `(tenant_id, template_code, channel)`

---

### notification_attempts

Per-attempt audit trail for notification delivery.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `notification_id` | uuid | no | — | FK → notifications |
| `attempt_number` | int | no | — | Sequential attempt number |
| `status` | NotificationAttemptStatus | no | `PENDING` | `PENDING` / `SUCCESS` / `FAILED` |
| `provider_error` | text | yes | — | Error from provider on failure |
| `started_at` | timestamptz | no | — | When the attempt started |
| `finished_at` | timestamptz | yes | — | When the attempt completed |

---

### notification_consents

Per-recipient opt-in/opt-out tracking for notification classes (feature 018).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `recipient` | varchar(320) | no | — | Email or phone |
| `channel` | NotificationChannel | no | — | |
| `tenant_id` | uuid | no | — | Scoped to tenant |
| `notification_class` | NotificationClass | no | `OPERATIONAL` | |
| `opted_out` | boolean | no | `false` | Whether the recipient opted out |
| `opted_out_at` | timestamptz | yes | — | When they opted out |
| `change_source` | ConsentChangeSource | yes | — | `unsubscribe_link` / `operator_override` / `re_opt_in` |
| `changed_at` | timestamptz | yes | — | Last change timestamp |
| `changed_by_user_id` | uuid | yes | — | FK → users (for operator overrides) |
| `reason` | text | yes | — | Reason for override |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

**Unique**: `(recipient, channel, tenant_id, notification_class)`

---

## 12. Reports

### reports

Generated report jobs (XLSX/CSV/PDF).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `tenant_id` | uuid | yes | — | FK → tenants. NULL for platform-wide reports. |
| `report_type` | ReportType | no | — | `INSPECTIONS_SCHEDULED` / `INSPECTIONS_DONE` / `INSPECTOR_PERFORMANCE` / etc. |
| `filters_json` | jsonb | no | — | Report filter parameters |
| `format` | ReportFormat | no | `XLSX` | `XLSX` / `CSV` / `PDF` |
| `status` | ReportStatus | no | `PENDING` | `PENDING` / `PROCESSING` / `READY` / `FAILED` |
| `file_key` | text | yes | — | Storage key for the generated file |
| `requested_by_user_id` | uuid | no | — | FK → users |
| `scheduled_report_id` | uuid | yes | — | FK → scheduled_reports. Back-reference if created by a schedule. |
| `started_at` | timestamptz | yes | — | |
| `completed_at` | timestamptz | yes | — | |
| `failed_at` | timestamptz | yes | — | |
| `error_message` | text | yes | — | |
| `row_count` | int | yes | — | Number of rows in the report |
| `expires_at` | timestamptz | yes | — | File retention expiry (30 days default) |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

---

### scheduled_reports

Recurring report schedules (feature 019).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `tenant_id` | uuid | no | — | FK → tenants |
| `report_type` | ReportType | no | — | Same as reports |
| `filters_json` | jsonb | no | — | Report filter parameters |
| `format` | ReportFormat | no | `XLSX` | |
| `cron_expression` | varchar(100) | no | — | Standard cron (e.g., `0 8 * * 1` for every Monday 8am) |
| `delivery_email` | varchar(254) | no | — | Legacy delivery target |
| `display_name` | varchar(120) | yes | — | Human-readable schedule name |
| `delivery_mode` | ScheduleDeliveryMode | no | `OWNER_ONLY` | `OWNER_ONLY` / `RECIPIENT_LIST` / `TENANT_WIDE` |
| `recipient_user_ids` | jsonb | no | `[]` | Array of user IDs for RECIPIENT_LIST mode |
| `skip_delivery_when_empty` | boolean | no | `false` | Skip email if report has zero rows |
| `consecutive_failure_count` | int | no | `0` | Auto-pauses after threshold |
| `status` | ScheduleStatus | no | `ACTIVE` | `ACTIVE` / `PAUSED` |
| `deleted_at` | timestamptz | yes | — | Soft delete |
| `is_active` | boolean | no | `true` | Legacy flag (read `status` in new code) |
| `last_run_at` | timestamptz | yes | — | |
| `next_run_at` | timestamptz | yes | — | Computed from cron_expression |
| `created_by_user_id` | uuid | no | — | FK → users |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

---

### scheduled_report_runs

Per-execution ledger for scheduled reports (feature 019).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `schedule_id` | uuid | no | — | FK → scheduled_reports. ON DELETE CASCADE. |
| `report_id` | uuid | yes | — | FK → reports. The generated report row. |
| `status` | ScheduleRunStatus | no | — | `queued` / `running` / `completed` / `failed` / `skipped_catchup` / `skipped_empty` |
| `scheduled_for` | timestamptz | no | — | The target execution time |
| `started_at` | timestamptz | yes | — | |
| `completed_at` | timestamptz | yes | — | |
| `error_message` | text | yes | — | |
| `recipient_count` | int | yes | — | How many recipients received the report |
| `delivery_status_json` | jsonb | yes | — | Per-recipient delivery outcome |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

**Unique**: `(schedule_id, scheduled_for)`

---

## 13. Audit & Compliance

### audit_logs

Append-only audit trail for all sensitive actions. Authoritative for dispute resolution and cross-check verification.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `tenant_id` | uuid | yes | — | Scoped to tenant (NULL for system-level actions) |
| `actor_type` | AuditActorType | no | — | `USER` / `SYSTEM` / `ANONYMOUS` |
| `actor_id` | uuid | yes | — | FK-like to users. NULL for SYSTEM/ANONYMOUS. |
| `entity_type` | varchar(100) | no | — | e.g., `appointment`, `financial_entry`, `contact` |
| `entity_id` | uuid | yes | — | The affected entity's ID |
| `action` | varchar(200) | no | — | e.g., `appointment.status_transition`, `contact.created` |
| `reason` | text | yes | — | Reason for the action (when required) |
| `before_json` | jsonb | yes | — | State before the action |
| `after_json` | jsonb | yes | — | State after the action |
| `request_id` | varchar(100) | yes | — | Correlates with HTTP request for tracing |
| `ip_address` | varchar(45) | yes | — | Client IP |
| `metadata_json` | jsonb | yes | — | Additional metadata (e.g., `{ source: 'bulk-edit' }`) |
| `created_at` | timestamptz | no | `now()` | |
| `retention_category` | AuditRetentionCategory | yes | — | `FINANCIAL` / `OPERATIONAL_CRITICAL` / `OPERATIONAL_GENERAL` (feature 020) |
| `redaction_status` | AuditRedactionStatus | no | `NONE` | `NONE` / `PARTIAL` / `FULL` / `IN_PROGRESS` (feature 020) |
| `cold_storage` | boolean | no | `false` | Whether moved to archive (feature 020) |
| `preservation_rule_id` | uuid | yes | — | FK → audit_preservation_rules. Exempts from retention. |

---

### audit_logs_archive

Cold-storage mirror of audit_logs (feature 020). Same schema, relaxed FKs.

Same columns as `audit_logs` plus `archived_at` (timestamptz, default `now()`).

---

### audit_retention_category_configs

DB-backed retention tier configuration (feature 020).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `name` | AuditRetentionCategory | no | — | Unique. `FINANCIAL` / `OPERATIONAL_CRITICAL` / `OPERATIONAL_GENERAL` |
| `retention_years` | int | no | — | How long to keep entries (e.g., 7 for financial) |
| `hard_delete_enabled` | boolean | no | `false` | Whether entries are permanently deleted after retention |
| `description` | text | yes | — | |
| `action_patterns_json` | jsonb | no | `[]` | Action patterns that map to this category |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

---

### audit_preservation_rules

Rules that exempt specific audit entries from retention (feature 020).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `name` | varchar(200) | no | — | Rule display name |
| `rule_type` | PreservationRuleType | no | — | `CROSS_CHECK` / `LEGAL_HOLD` |
| `entity_type` | varchar(100) | yes | — | Scoped to entity type |
| `entity_id` | uuid | yes | — | Scoped to specific entity |
| `tenant_id` | uuid | yes | — | Scoped to tenant |
| `is_active` | boolean | no | `true` | |
| `created_by_user_id` | uuid | no | — | |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

---

### audit_legal_holds

Per-entity legal holds preventing any data deletion (feature 020).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `entity_type` | varchar(100) | no | — | e.g., `appointment` |
| `entity_id` | uuid | no | — | The held entity |
| `tenant_id` | uuid | yes | — | |
| `reason` | text | no | — | Why the hold was placed |
| `placed_by_user_id` | uuid | no | — | AM who placed it |
| `placed_at` | timestamptz | no | `now()` | |
| `released_by_user_id` | uuid | yes | — | AM who released it |
| `released_at` | timestamptz | yes | — | |
| `is_active` | boolean | no | `true` | |

---

### pii_field_mappings

Registry of PII fields for automated redaction (feature 020).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `action_pattern` | varchar(200) | no | — | Audit action pattern (e.g., `tenant_portal.*`) |
| `json_field_path` | varchar(500) | no | — | JSON path to the PII field (e.g., `after.primaryEmail`) |
| `classification` | varchar(50) | no | — | PII classification (e.g., `email`, `phone`, `name`) |
| `requires_manual_review` | boolean | no | `false` | Whether auto-redaction needs human confirmation |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

**Unique**: `(action_pattern, json_field_path)`

---

### data_subject_erasure_requests

LGPD/GDPR erasure request lifecycle tracking (feature 020).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `subject_identifier_type` | varchar(20) | no | — | `email` / `phone` / `name` |
| `subject_identifier_value` | varchar(500) | no | — | The PII value to erase |
| `resolved_pii_values_json` | jsonb | yes | — | All PII values found for the subject |
| `status` | ErasureRequestStatus | no | `PENDING` | `PENDING` / `SCANNING` / `PREVIEW` / `CONFIRMED` / `EXECUTING` / `COMPLETED` / `FAILED` |
| `entries_found_count` | int | yes | — | Audit entries containing the PII |
| `entries_redacted_count` | int | yes | — | Entries successfully redacted |
| `entries_flagged_for_review_count` | int | yes | — | Entries needing manual review |
| `completion_report_json` | jsonb | yes | — | Final report |
| `initiated_by_user_id` | uuid | no | — | AM who initiated |
| `initiated_at` | timestamptz | no | `now()` | |
| `completed_at` | timestamptz | yes | — | |

---

## 14. Infrastructure

### idempotency_keys

Prevents duplicate processing of critical operations.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `key` | text | no | — | The idempotency key (from `Idempotency-Key` header). Globally unique. |
| `scope` | text | no | — | Operation scope (e.g., `status-transition`, `financial-entries-on-done`) |
| `response` | jsonb | no | — | Cached response |
| `payload_hash` | varchar(64) | yes | — | SHA-256 of the request payload for mismatch detection |
| `expires_at` | timestamptz | no | — | Key expiry (24h default) |
| `created_at` | timestamptz | no | `now()` | |

---

### property_imports

Bulk import tracking for properties (same shape as appointment_imports).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | generated | Primary key |
| `tenant_id` | uuid | no | — | FK → tenants |
| `status` | varchar(20) | no | `PENDING` | `PENDING` / `PROCESSING` / `DONE` / `FAILED` |
| `file_key` | varchar(500) | no | — | Storage key |
| `original_filename` | varchar(255) | no | — | |
| `total_rows` | int | no | `0` | |
| `success_count` | int | no | `0` | |
| `error_count` | int | no | `0` | |
| `errors_json` | jsonb | yes | — | Per-row errors |
| `created_by_user_id` | uuid | no | — | FK → users |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | auto | |

---

## Entity Relationship Diagram (key relations)

```
Tenant 1──* Branch
Tenant 1──* User
Tenant 1──* Property
Tenant 1──* Contact (feature 021)
Tenant 1──* Appointment
Tenant 1──* ServiceGroup
Tenant 1──* FinancialEntry
Tenant 1──* Notification

Branch 1──* Appointment
Branch 1──* ServicePriceRule

Property 1──* Appointment

ServiceType 1──* Appointment
ServiceType 1──* ServicePriceRule
ServiceType 1──* ServiceGroup

Inspector 1──* Appointment
Inspector 1──* InspectorAvailabilitySlot
Inspector 1──* InspectionExecution
Inspector 1──* FinancialEntry
Inspector 1──* InspectorInvoice
Inspector *──* ServiceRegion (via InspectorRegion)

Contact 1──* AppointmentContact (junction)
Appointment 1──* AppointmentContact (junction)
Appointment 1──* AppointmentRestriction
Appointment 1──* TenantPortalToken
Appointment 1──1 InspectionExecution
Appointment 1──* InspectionAsset
Appointment 1──* FinancialEntry
Appointment 1──* Notification

ServiceGroup 1──* Appointment

User 1──* Session
User 1──* Appointment (created_by)
User 1──* FinancialEntry (initiated, approved, voided)
User 1──* InspectorInvoice (generated, paid)
```
