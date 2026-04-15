# API Contracts: Contact Endpoints

**Feature**: `021-contacts`
**Prefix**: `/v1/contacts`
**Auth**: JWT (Bearer token)

## Endpoints

### POST /v1/contacts

**Purpose**: Create a new contact in the tenant registry.
**Actors**: AM, OP, CL_ADMIN

**Request Body** (`contactRegistrySchema`):

```json
{
  "tenantId": "uuid (AM only — OP/CL resolved from JWT)",
  "type": "TENANT | PROPERTY_MANAGER | HOUSEKEEPER | BROKER | OTHER",
  "displayName": "string (1-200 chars, required)",
  "company": "string (1-200 chars, optional)",
  "primaryEmail": "string (email, max 254, optional)",
  "primaryPhone": "string (max 30, optional)",
  "additionalChannels": [
    { "channel": "EMAIL | PHONE", "value": "string", "label": "string (optional)" }
  ],
  "notes": "string (optional)"
}
```

**Validations**:
- At least one of `primaryEmail` or `primaryPhone` must be non-null.
- `primaryEmail` must not match an existing active contact in the same tenant.
- `primaryPhone` must not match an existing active contact in the same tenant.
- `additionalChannels` entries must not duplicate `primaryEmail` or `primaryPhone`.
- No duplicate `(channel, value)` pairs within `additionalChannels`.

**Success Response** (`201 Created`):

```json
{
  "id": "uuid",
  "tenantId": "uuid",
  "type": "PROPERTY_MANAGER",
  "displayName": "John Smith",
  "company": "Smith Realty",
  "primaryEmail": "john@smithrealty.com",
  "primaryPhone": "+61412345678",
  "additionalChannels": [],
  "notes": null,
  "isActive": true,
  "createdAt": "2026-04-12T10:00:00Z",
  "updatedAt": "2026-04-12T10:00:00Z"
}
```

**Error Responses**:

| Code | Error | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod validation failure |
| 400 | `CONTACT_NO_CHANNEL` | Neither email nor phone provided |
| 400 | `CONTACT_CHANNEL_DUPLICATED` | Additional channel duplicates primary or itself |
| 409 | `CONTACT_EMAIL_ALREADY_EXISTS` | Active contact with same email in same tenant |
| 409 | `CONTACT_PHONE_ALREADY_EXISTS` | Active contact with same phone in same tenant |
| 403 | `FORBIDDEN` | Actor not AM, OP, or CL_ADMIN |

---

### PATCH /v1/contacts/:contactId

**Purpose**: Update a contact's fields. Does NOT retroactively change appointment snapshots.
**Actors**: AM, OP, CL_ADMIN

**Request Body** (`contactRegistryUpdateSchema`):

```json
{
  "type": "PROPERTY_MANAGER (optional)",
  "displayName": "string (optional)",
  "company": "string (optional, null to clear)",
  "primaryEmail": "string (optional, null to clear)",
  "primaryPhone": "string (optional, null to clear)",
  "additionalChannels": "array (optional, full replacement)",
  "notes": "string (optional, null to clear)",
  "isActive": "boolean (optional — use for deactivation/reactivation)"
}
```

**Validations**: same as POST for channel uniqueness and at-least-one-channel (applied to merged result, not just the patch).

**Success Response** (`200 OK`): Full contact object.

**Error Responses**: Same as POST, plus:

| Code | Error | When |
|---|---|---|
| 404 | `CONTACT_NOT_FOUND` | Contact does not exist or belongs to different tenant |

---

### GET /v1/contacts

**Purpose**: List contacts with filters, search, and pagination.
**Actors**: AM, OP, CL_ADMIN, CL_USER (read-only)

**Query Parameters**:

| Param | Type | Default | Notes |
|---|---|---|---|
| `search` | string | — | Trigram search on `displayName`, `primaryEmail`, `primaryPhone` |
| `type` | ContactType | — | Filter by type |
| `isActive` | boolean | `true` | Filter by active status |
| `tenantId` | uuid | JWT tenant | AM only — cross-tenant |
| `page` | integer | 1 | |
| `pageSize` | integer | 20 | Max 100 |
| `sortBy` | string | `displayName` | Allowed: `displayName`, `createdAt`, `type` |
| `sortOrder` | string | `asc` | `asc` or `desc` |

**Success Response** (`200 OK`):

```json
{
  "data": [ /* contact objects */ ],
  "total": 145,
  "page": 1,
  "pageSize": 20
}
```

---

### GET /v1/contacts/:contactId

**Purpose**: Read a single contact with optional appointment history.
**Actors**: AM, OP, CL_ADMIN, CL_USER

**Query Parameters**:

| Param | Type | Default | Notes |
|---|---|---|---|
| `includeAppointments` | boolean | `false` | Include paginated appointment linkage summary |

**Success Response** (`200 OK`): Full contact object. When `includeAppointments=true`, includes:

```json
{
  "...contact fields...",
  "appointments": {
    "data": [
      {
        "appointmentId": "uuid",
        "appointmentNumber": 1234,
        "status": "SCHEDULED",
        "scheduledDate": "2026-05-01",
        "role": "PROPERTY_MANAGER"
      }
    ],
    "total": 42
  }
}
```

**Error Responses**:

| Code | Error | When |
|---|---|---|
| 404 | `CONTACT_NOT_FOUND` | Does not exist or different tenant (non-AM) |

---

## Appointment Contact Linkage (consumed by feature 006)

The appointment creation/update endpoints (`POST /v1/appointments`, `PATCH /v1/appointments/:id`) accept a `contacts` array using the `appointmentContactLinkSchema`:

```json
{
  "contacts": [
    {
      "contactId": "uuid (existing registry contact)",
      "role": "TENANT",
      "isPrimary": true
    },
    {
      "inline": {
        "type": "HOUSEKEEPER",
        "displayName": "Maria",
        "primaryPhone": "+61498765432"
      },
      "role": "HOUSEKEEPER",
      "isPrimary": false
    }
  ]
}
```

**Validation rules** (enforced by appointment use case, not contact endpoints):
- Exactly one entry with `isPrimary: true`.
- `contactId` entries: contact must exist, be active, and belong to the same tenant.
- `inline` entries: creates a registry contact + junction atomically.
- Cannot use both `contactId` and `inline` on the same entry.

This schema is defined in `packages/shared` and documented here for cross-reference. The actual endpoints are owned by feature 006.
