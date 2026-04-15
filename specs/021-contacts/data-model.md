# Data Model: Contacts

**Feature**: `021-contacts`
**Status**: NEW
**Source**: architectural review during Feedback Round 2026-04-13

All timestamps are `timestamptz`. All IDs are UUID v4. Column names follow `snake_case`; the Prisma client exposes them as `camelCase`.

## Enums

### `ContactType`

```
TENANT | PROPERTY_MANAGER | HOUSEKEEPER | BROKER | OTHER
```

Identifies what kind of person this contact is in the agency's context. This is the contact's **identity type** — a permanent classification. It is distinct from `AppointmentContactRole` (feature 006), which describes the contact's **role in a specific appointment**.

A person who is `type = PROPERTY_MANAGER` in the registry could act as `role = OTHER` in a specific appointment where they're filling in for someone. The two enums are deliberately separate.

Default on create: no default — the caller MUST specify.

### `ContactChannelType`

```
EMAIL | PHONE
```

Used inside `additional_channels_json` to distinguish channel types.

## Entities

### `contacts`

Per-tenant registry of people the agency works with. Each row represents a single person with a stable identity.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `tenant_id` | uuid | no | — | FK → `tenants.id`. Scopes the contact to an agency. |
| `type` | `ContactType` | no | — | Identity classification. |
| `display_name` | varchar(200) | no | — | The contact's display name. |
| `company` | varchar(200) | yes | — | Relevant for PMs and brokers who represent a company. |
| `primary_email` | varchar(254) | yes | — | The contact's main email. Unique per tenant among active contacts. |
| `primary_phone` | varchar(30) | yes | — | The contact's main phone number. Unique per tenant among active contacts. |
| `additional_channels_json` | jsonb | no | `'[]'` | Array of `{ channel: "EMAIL" \| "PHONE", value: string, label?: string }`. Bounded cardinality (max ~5). |
| `notes` | text | yes | — | Free-text operator notes about this contact. |
| `is_active` | boolean | no | `true` | Soft-delete flag. Inactive contacts are excluded from search/autocomplete. |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |

**Indexes**

- `UNIQUE (tenant_id, primary_email) WHERE is_active = true AND primary_email IS NOT NULL` — prevents two active contacts with the same email in the same tenant.
- `UNIQUE (tenant_id, primary_phone) WHERE is_active = true AND primary_phone IS NOT NULL` — prevents two active contacts with the same phone in the same tenant.
- `(tenant_id, type)` — for filtered listing.
- `(tenant_id, is_active)` — for scoped active-only queries.
- `GIN (display_name gin_trgm_ops)` — trigram index for fast autocomplete search. Requires `pg_trgm` extension (enabled by default on Supabase). Fallback: `(lower(display_name) varchar_pattern_ops)` if `pg_trgm` is unavailable.
- `(tenant_id, display_name)` — for sorted listing.

**Invariants**

- **At least one contact channel**: either `primary_email` or `primary_phone` MUST be non-null. Enforced by a CHECK constraint:

  ```sql
  ALTER TABLE contacts
    ADD CONSTRAINT contacts_at_least_one_channel
    CHECK (primary_email IS NOT NULL OR primary_phone IS NOT NULL);
  ```

- **No duplication between primary and additional channels**: `primary_email` MUST NOT appear in `additional_channels_json` as an EMAIL entry, and `primary_phone` MUST NOT appear as a PHONE entry. Enforced at the application layer via Zod `.refine()` (error code: `CONTACT_CHANNEL_DUPLICATED`). A DB CHECK using `jsonb_path_exists` is possible but fragile across Postgres versions — the application check is the primary enforcement, with integration tests as the safety net.

- **No intra-array duplication**: within `additional_channels_json`, no two entries may have the same `(channel, value)` pair. Enforced at the application layer only.

- **`type` is mandatory and cannot be null**: the caller must classify the contact at creation time.

- **Email/phone uniqueness is per-tenant among active contacts**: the partial unique indexes allow the same email to exist across different tenants (multi-tenant isolation) and allow deactivated contacts to share an email with a new active one (mistake correction).

## Relationship with `appointment_contacts` (feature 006)

The `contacts` table is the **registry** (live data). The `appointment_contacts` table (defined in `specs/006-appointments/data-model.md`) is the **junction + snapshot** (frozen data per appointment).

```
contacts (021)                appointment_contacts (006)
┌───────────────────┐         ┌────────────────────────────┐
│ id (PK)           │◄────────│ contact_id (FK, nullable)  │
│ tenant_id         │         │ appointment_id (FK)         │
│ type              │         │ role (contextual)           │
│ display_name      │         │ is_primary                  │
│ primary_email     │  ──X──► │ snapshot_name (frozen)      │
│ primary_phone     │  ──X──► │ snapshot_email (frozen)     │
│ additional_*      │  ──X──► │ snapshot_phone (frozen)     │
│ is_active         │         └────────────────────────────┘
└───────────────────┘
     ──X──► = copied once at link time, never updated by registry changes
```

**`contact_id` is nullable** on the junction for backward compatibility:
- **Existing appointments** (pre-021): `contact_id = NULL`, snapshot fields are populated from the legacy `appointment_contacts` data. The snapshot is the only source of truth for these.
- **New appointments** (post-021): `contact_id` points to the registry row. The snapshot is populated at link time.

The junction schema is owned by feature 006's data-model.md. This document only defines the `contacts` entity itself.

## Domain Logic

### `ContactEntity`

Read-only value object: `id`, `tenantId`, `type`, `displayName`, `company`, `primaryEmail`, `primaryPhone`, `additionalChannels`, `notes`, `isActive`, `createdAt`, `updatedAt`.

### Validation helpers (`contact-validation.service.ts`)

Pure functions, no I/O:

- `validateNoDuplicateChannels(primaryEmail, primaryPhone, additionalChannels)` → throws `CONTACT_CHANNEL_DUPLICATED` on conflict.
- `validateAtLeastOneChannel(primaryEmail, primaryPhone)` → throws `CONTACT_NO_CHANNEL` if both are null.

## Ports (domain interfaces)

### `IContactRepository`

- `findById(contactId, tenantId: string | null)` → `Contact | null`. `null` tenantId is an AM/OP escape for cross-tenant lookups.
- `findAll(filters, pagination)` → paginated contacts.
- `search(tenantId, query, type?, isActive?)` → contacts matching by trigram on `display_name`, `primary_email`, `primary_phone`.
- `save(contact)` → void (insert).
- `update(contactId, tenantId, partial)` → void.
- `existsByEmail(tenantId, email, excludeContactId?)` → boolean. Used for uniqueness check before create/update.
- `existsByPhone(tenantId, phone, excludeContactId?)` → boolean.
- `findAppointmentsByContactId(contactId, pagination)` → paginated appointment summaries (reverse lookup via `appointment_contacts.contact_id`).

## Audit Linkage

Actions emitted via `AuditService`:

- `contact.created`
- `contact.updated`
- `contact.deactivated`
- `contact.reactivated`

Every entry carries `tenantId`, `entityId`, `before`/`after` snapshots.

## Migration Strategy

### Phase 1 — Schema expansion (additive, no data loss)

1. Enable `pg_trgm` extension if not already enabled (Supabase has it by default).
2. Create `ContactType` enum.
3. Create `ContactChannelType` enum.
4. Create `contacts` table with all columns, indexes, and CHECK constraints.
5. Alter `appointment_contacts` to add `contact_id` (nullable FK → `contacts.id`) and `snapshot_name`, `snapshot_email`, `snapshot_phone` columns (nullable initially).

### Phase 2 — Data backfill (idempotent)

1. For each existing `appointment_contacts` row:
   - Copy `tenant_name` → `snapshot_name`, `primary_email` → `snapshot_email`, `primary_phone` → `snapshot_phone`.
   - Leave `contact_id = NULL` (no registry contact is auto-created for legacy rows — the operator can link them later if desired).
2. Make `snapshot_name` NOT NULL after backfill (every row now has a value).

### Phase 3 — Column cleanup (contract migration)

1. Drop legacy columns from `appointment_contacts`: `tenant_name`, `primary_email`, `secondary_email`, `primary_phone`, `secondary_phone`, `additional_emails_json`, `additional_phones_json`.
2. This is a **breaking change** for the appointment CRUD — the code must be updated first to read from snapshot fields and write via the junction pattern.

**Migration ordering**: Phase 1 and Phase 2 run together. Phase 3 runs after the code is updated to use the new schema (expand/contract pattern per CLAUDE.md CI/CD rules).
