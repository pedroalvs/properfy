# Property Module – Implementation Spec

> **SUPERSEDED** by `specs/003-properties/` — this legacy spec is preserved for historical reference only.

**Version:** 1.0
**Module path:** `apps/backend/src/modules/property`
**Last updated:** 2026-03-15

---

## 1. Overview

### Purpose

The Property module manages real estate properties (imoveis) that are the subject of inspection appointments. Each property belongs to a tenant (and optionally a branch). Properties are created manually or via spreadsheet import, and can be geocoded asynchronously using the Mapbox API to resolve coordinates from their address.

### Actors

| Actor | Interactions |
|---|---|
| AM | Create, read, update, delete (soft) any property across any tenant; trigger geocoding |
| OP | Create, read, update properties (any tenant); trigger geocoding; no delete |
| CL_ADMIN | Create, read, update, delete properties in own tenant/branches |
| CL_USER | Read properties in own tenant; create/update if permission flag enabled |
| INSP | No property management access (reads limited property info via appointment) |

### Domain Boundaries

- Owns: `Property` entity
- Does NOT own: `Appointment`, `Branch`, `Tenant`
- The property is referenced by `Appointment` (one appointment → one property). Deleting a property with linked appointments is blocked.
- Depends on: Tenant module (tenant existence check), Auth module (JWT context)
- External: Mapbox Geocoding API (async, via queue job)

### Dependencies

- Auth module: JWT middleware provides actor context
- Tenant module: verify tenant exists and is ACTIVE before creating a property
- Branch module: verify branch belongs to the specified tenant
- Appointment module: check for existing appointments before soft-deleting a property
- Mapbox API: geocoding service (external, async, with fallback)
- pg-boss (PostgreSQL-backed, no Redis required): queue for async geocoding jobs

---

## 2. Data Model

### 2.1 Enums

#### `PropertyType`

```prisma
enum PropertyType {
  RESIDENTIAL   // Houses, apartments, townhouses, units
  COMMERCIAL    // Offices, retail, commercial premises
  INDUSTRIAL    // Industrial/warehouse properties
  RURAL         // Rural/agricultural properties
}
```

#### `GeocodingStatus`

```prisma
enum GeocodingStatus {
  PENDING       // Geocoding has not been attempted
  GEOCODED      // Coordinates resolved successfully
  FAILED        // Geocoding attempted but failed (will retry)
  MANUAL        // Coordinates set manually by operator
}
```

### 2.2 Entity: `Property`

**Table:** `properties`

| Field | Prisma Type | Nullable | Default | Constraint |
|---|---|---|---|---|
| id | String | No | `uuid()` | PK |
| tenant_id | String | No | — | FK → tenants.id; NOT NULL |
| branch_id | String | Yes | — | FK → branches.id; nullable |
| property_code | String | Yes | — | max 100 chars; unique per tenant |
| type | PropertyType | No | `RESIDENTIAL` | enum |
| street | String | No | — | max 300 chars |
| address_line_2 | String | Yes | — | max 200 chars; unit/suite/lot |
| suburb | String | No | — | max 100 chars |
| postcode | String | No | — | max 10 chars |
| state | String | No | — | max 50 chars |
| country | String | No | `"AU"` | ISO 3166-1 alpha-2; 2 chars |
| latitude | Float | Yes | — | -90 to 90; null until geocoded |
| longitude | Float | Yes | — | -180 to 180; null until geocoded |
| geocoding_status | GeocodingStatus | No | `PENDING` | enum |
| geocoding_attempted_at | DateTime | Yes | — | last geocoding attempt timestamp |
| notes | String | Yes | — | max 2000 chars; general property notes |
| rules_json | Json | Yes | — | See rules_json structure |
| created_at | DateTime | No | `now()` | |
| updated_at | DateTime | No | `now()` | auto-updated |
| deleted_at | DateTime | Yes | — | soft delete |

**Indexes:**

```prisma
@@unique([tenant_id, property_code], name: "properties_tenant_property_code_key")
@@index([tenant_id])
@@index([tenant_id, branch_id])
@@index([tenant_id, type])
@@index([tenant_id, geocoding_status])
@@index([suburb])
@@index([postcode])
@@index([deleted_at])
```

#### `rules_json` Structure

```typescript
interface PropertyRules {
  // Access
  keyNumber?: string;             // Key safe/lockbox number
  accessNotes?: string;           // How to access the property (max 500 chars)
  parkingNotes?: string;          // Parking instructions (max 300 chars)
  petOnPremises?: boolean;        // Whether pets are present
  petNotes?: string;              // Pet details if any

  // Inspection-specific
  requiresKeyCollection?: boolean;
  keyCollectionAddress?: string;

  // Custom fields from import
  customFields?: Record<string, string>;
}
```

### 2.3 Complete Prisma Schema (property module entities)

```prisma
enum PropertyType {
  RESIDENTIAL
  COMMERCIAL
  INDUSTRIAL
  RURAL
}

enum GeocodingStatus {
  PENDING
  GEOCODED
  FAILED
  MANUAL
}

model Property {
  id                      String           @id @default(uuid())
  tenant_id               String
  branch_id               String?
  property_code           String?          @db.VarChar(100)
  type                    PropertyType     @default(RESIDENTIAL)
  street                  String           @db.VarChar(300)
  address_line_2          String?          @db.VarChar(200)
  suburb                  String           @db.VarChar(100)
  postcode                String           @db.VarChar(10)
  state                   String           @db.VarChar(50)
  country                 String           @default("AU") @db.Char(2)
  latitude                Float?
  longitude               Float?
  geocoding_status        GeocodingStatus  @default(PENDING)
  geocoding_attempted_at  DateTime?
  notes                   String?          @db.VarChar(2000)
  rules_json              Json?
  created_at              DateTime         @default(now())
  updated_at              DateTime         @updatedAt
  deleted_at              DateTime?

  tenant                  Tenant           @relation(fields: [tenant_id], references: [id])
  branch                  Branch?          @relation(fields: [branch_id], references: [id])
  appointments            Appointment[]

  @@unique([tenant_id, property_code], name: "properties_tenant_property_code_key")
  @@index([tenant_id])
  @@index([tenant_id, branch_id])
  @@index([tenant_id, type])
  @@index([tenant_id, geocoding_status])
  @@index([suburb])
  @@index([postcode])
  @@index([deleted_at])
  @@map("properties")
}
```

---

## 3. Use Cases

### 3.1 Create Property (`createProperty`)

**Actor:** AM, OP, CL_ADMIN, CL_USER (if tenant allows)

**Preconditions:**
- Tenant exists and is ACTIVE
- If `branchId` provided: branch must belong to the specified tenant and be ACTIVE
- If `propertyCode` provided: must be unique within the tenant

**Input DTO:**

```typescript
const CreatePropertyInputSchema = z.object({
  branchId: z.string().uuid().optional(),
  propertyCode: z.string().min(1).max(100).trim().optional(),
  type: z.nativeEnum(PropertyType).default("RESIDENTIAL"),
  street: z.string().min(1).max(300).trim(),
  addressLine2: z.string().max(200).trim().optional(),
  suburb: z.string().min(1).max(100).trim(),
  postcode: z.string().min(1).max(10).trim(),
  state: z.string().min(1).max(50).trim(),
  country: z.string().length(2).default("AU"),
  notes: z.string().max(2000).optional(),
  rules: z.object({
    keyNumber: z.string().max(100).optional(),
    accessNotes: z.string().max(500).optional(),
    parkingNotes: z.string().max(300).optional(),
    petOnPremises: z.boolean().optional(),
    petNotes: z.string().max(300).optional(),
    requiresKeyCollection: z.boolean().optional(),
    keyCollectionAddress: z.string().max(300).optional(),
    customFields: z.record(z.string()).optional(),
  }).optional(),
});
```

**Step-by-step process:**

1. Validate input.
2. Resolve `tenantId` from actor context:
   - AM/OP: `tenantId` must be provided as query param or path param (e.g., `POST /v1/tenants/:tenantId/properties` or `POST /v1/properties` with `tenantId` in body for AM/OP).
   - CL_ADMIN/CL_USER: use `actor.tenantId` from JWT.
3. Verify tenant exists and is ACTIVE.
4. If `branchId` provided: verify branch belongs to tenant and is ACTIVE.
5. If `propertyCode` provided: check uniqueness within tenant; if conflict return `PROPERTY_CODE_CONFLICT`.
6. Create property record with `geocoding_status = PENDING`, `latitude = null`, `longitude = null`.
7. Enqueue geocoding job `property.geocode` with `{ propertyId, tenantId }`.
8. Emit event `property.created.v1`.
9. Write audit log.
10. Return created property (without coordinates yet — they are populated async).

**Output DTO:**

```typescript
{
  id: string;
  tenantId: string;
  branchId: string | null;
  propertyCode: string | null;
  type: PropertyType;
  street: string;
  addressLine2: string | null;
  suburb: string;
  postcode: string;
  state: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  geocodingStatus: GeocodingStatus;
  notes: string | null;
  rules: PropertyRules | null;
  createdAt: string;
  updatedAt: string;
}
```

**Possible Errors:**

| Code | Message | Condition |
|---|---|---|
| `AUTH_FORBIDDEN` | Insufficient permissions | Wrong role or cross-tenant |
| `TENANT_NOT_FOUND` | Tenant not found | Non-existent tenant |
| `TENANT_INACTIVE` | Tenant is not active | Tenant is INACTIVE or PENDING |
| `BRANCH_NOT_FOUND` | Branch not found | branchId not in tenant |
| `BRANCH_INACTIVE` | Branch is not active | Branch is INACTIVE |
| `PROPERTY_CODE_CONFLICT` | Property code already in use in this tenant | Duplicate propertyCode |
| `VALIDATION_ERROR` | Request payload is invalid | Zod failure |

**Side Effects:**
- Queue job `property.geocode` enqueued
- Audit log: `property.created`
- Event: `property.created.v1`

---

### 3.2 List Properties (`listProperties`)

**Actor:** AM, OP (any tenant), CL_ADMIN/CL_USER (own tenant)

**Input DTO (query params):**

```typescript
const ListPropertiesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["street", "suburb", "postcode", "type", "createdAt", "propertyCode"]).default("street"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  branchId: z.string().uuid().optional(),
  type: z.nativeEnum(PropertyType).optional(),
  geocodingStatus: z.nativeEnum(GeocodingStatus).optional(),
  search: z.string().max(200).optional(), // searches street, addressLine2, suburb, postcode, propertyCode
});
```

**Step-by-step process:**

1. Resolve `tenantId`:
   - AM/OP: from path or query param.
   - CL_ADMIN/CL_USER: from `actor.tenantId`.
2. Build query:
   - Always filter: `tenant_id = tenantId` AND `deleted_at IS NULL`
   - If `branchId`: filter by `branch_id`
   - If `type`: filter by `type`
   - If `geocodingStatus`: filter by `geocoding_status`
   - If `search`: `street ILIKE %search%` OR `suburb ILIKE %search%` OR `postcode ILIKE %search%` OR `property_code ILIKE %search%` OR `address_line_2 ILIKE %search%`
3. Count total.
4. Fetch page.
5. Return paginated response.

**Output DTO:**

```typescript
{
  data: PropertySummary[];
  meta: { page, pageSize, total, totalPages }
}

interface PropertySummary {
  id: string;
  tenantId: string;
  branchId: string | null;
  propertyCode: string | null;
  type: PropertyType;
  street: string;
  addressLine2: string | null;
  suburb: string;
  postcode: string;
  state: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  geocodingStatus: GeocodingStatus;
  createdAt: string;
}
```

**Possible Errors:**

| Code | Message | Condition |
|---|---|---|
| `AUTH_FORBIDDEN` | Insufficient permissions | Cross-tenant access |
| `VALIDATION_ERROR` | Invalid query params | Zod failure |

---

### 3.3 Get Property (`getProperty`)

**Actor:** AM, OP (any), CL_ADMIN/CL_USER (own tenant)

**Input:** `propertyId` (path param)

**Step-by-step process:**

1. Load property by id where `deleted_at IS NULL`.
2. If not found: return `PROPERTY_NOT_FOUND`.
3. Authorize: AM/OP always; CL roles check `property.tenant_id == actor.tenantId`.
4. Return full property including rules_json.

**Output DTO:** Full property object (same as createProperty response).

**Possible Errors:**

| Code | Message | Condition |
|---|---|---|
| `AUTH_FORBIDDEN` | Insufficient permissions | Cross-tenant |
| `PROPERTY_NOT_FOUND` | Property not found | Non-existent or soft-deleted |

---

### 3.4 Update Property (`updateProperty`)

**Actor:** AM, OP (any), CL_ADMIN (own tenant), CL_USER (own tenant if permission enabled)

**Preconditions:**
- Property exists and is not soft-deleted
- If `propertyCode` changing: must remain unique within tenant
- If `branchId` changing: new branch must belong to tenant and be ACTIVE

**Input DTO:**

```typescript
const UpdatePropertyInputSchema = z.object({
  branchId: z.string().uuid().optional().nullable(),
  propertyCode: z.string().min(1).max(100).trim().optional().nullable(),
  type: z.nativeEnum(PropertyType).optional(),
  street: z.string().min(1).max(300).trim().optional(),
  addressLine2: z.string().max(200).trim().optional().nullable(),
  suburb: z.string().min(1).max(100).trim().optional(),
  postcode: z.string().min(1).max(10).trim().optional(),
  state: z.string().min(1).max(50).trim().optional(),
  country: z.string().length(2).optional(),
  latitude: z.number().min(-90).max(90).optional().nullable(),   // manual coordinate override
  longitude: z.number().min(-180).max(180).optional().nullable(), // manual coordinate override
  notes: z.string().max(2000).optional().nullable(),
  rules: z.object({
    keyNumber: z.string().max(100).optional().nullable(),
    accessNotes: z.string().max(500).optional().nullable(),
    parkingNotes: z.string().max(300).optional().nullable(),
    petOnPremises: z.boolean().optional(),
    petNotes: z.string().max(300).optional().nullable(),
    requiresKeyCollection: z.boolean().optional(),
    keyCollectionAddress: z.string().max(300).optional().nullable(),
    customFields: z.record(z.string()).optional(),
  }).optional(),
});
```

**Step-by-step process:**

1. Validate input.
2. Load property; if not found return `PROPERTY_NOT_FOUND`.
3. Authorize.
4. If address fields changed (street, suburb, postcode, state, country):
   - Reset `geocoding_status = PENDING`, `latitude = null`, `longitude = null`.
   - Enqueue new geocoding job.
5. If `latitude` and `longitude` provided manually:
   - Set `geocoding_status = MANUAL` (manual override takes precedence over async geocoding).
   - Do NOT enqueue geocoding job.
6. If `propertyCode` changed: check uniqueness.
7. If `branchId` changed: validate new branch.
8. Apply updates.
9. Emit event `property.updated.v1`.
10. Write audit log with before/after.
11. Return updated property.

**Possible Errors:**

| Code | Message | Condition |
|---|---|---|
| `AUTH_FORBIDDEN` | Insufficient permissions | Wrong role or cross-tenant |
| `PROPERTY_NOT_FOUND` | Property not found | Non-existent or soft-deleted |
| `BRANCH_NOT_FOUND` | Branch not found | branchId not in tenant |
| `BRANCH_INACTIVE` | Branch is not active | INACTIVE branch |
| `PROPERTY_CODE_CONFLICT` | Property code already in use | Duplicate propertyCode |
| `VALIDATION_ERROR` | Invalid payload | Zod failure |

**Side Effects:**
- Conditionally: `property.geocode` job enqueued if address changed
- Audit log: `property.updated`
- Event: `property.updated.v1`

---

### 3.5 Delete Property (`deleteProperty`)

**Actor:** AM (any), CL_ADMIN (own tenant)

**Preconditions:**
- Property exists and is not already soft-deleted
- No appointments reference this property in any non-CANCELLED/REJECTED status

**Input DTO:** None (path param `propertyId` only)

**Step-by-step process:**

1. Authenticate and authorize: AM or CL_ADMIN of same tenant.
2. Load property.
3. If not found: return `PROPERTY_NOT_FOUND`.
4. Check for linked appointments: query appointment module for appointments with `property_id = propertyId` and status NOT IN (`CANCELLED`, `REJECTED`). If any exist: return `PROPERTY_HAS_ACTIVE_APPOINTMENTS`.
5. Set `deleted_at = now()`.
6. Emit event `property.deleted.v1`.
7. Write audit log.
8. Return 204 No Content.

**Output:** 204 No Content

**Possible Errors:**

| Code | Message | Condition |
|---|---|---|
| `AUTH_FORBIDDEN` | Insufficient permissions | OP or CL_USER; or CL_ADMIN cross-tenant |
| `PROPERTY_NOT_FOUND` | Property not found | Non-existent or already deleted |
| `PROPERTY_HAS_ACTIVE_APPOINTMENTS` | Cannot delete property with active appointments | Linked DRAFT/AWAITING_INSPECTOR/SCHEDULED/DONE appointments exist |
| `VALIDATION_ERROR` | Invalid path param | Non-UUID |

---

### 3.6 Geocode Property (`geocodeProperty`)

**Actor:** AM, OP (manual re-trigger via API), or system (async job)

**Preconditions:**
- Property exists

**Input DTO (for manual re-trigger via API):**

```typescript
// No body; triggers geocoding for a specific property
// Path: POST /v1/properties/:propertyId/geocode
```

**Step-by-step process:**

1. Authorize: AM or OP only for manual trigger.
2. Load property.
3. If geocoding_status = MANUAL: return error `PROPERTY_GEOCODING_MANUAL_OVERRIDE` (cannot re-geocode a manually set coordinate without first clearing it).
4. Set `geocoding_status = PENDING`.
5. Enqueue `property.geocode` job.
6. Return 202 Accepted with current property state.

**Output:** 202 Accepted with property object showing `geocodingStatus: "PENDING"`.

**Internal geocoding job execution (see section 8):**

1. Load property by `propertyId`.
2. Build address string: `"${street}, ${suburb} ${state} ${postcode}, ${country}"`.
3. Call Mapbox Geocoding API (forward geocoding).
4. If successful:
   - Set `latitude`, `longitude`, `geocoding_status = GEOCODED`, `geocoding_attempted_at = now()`.
5. If failed (API error, no results):
   - Set `geocoding_status = FAILED`, `geocoding_attempted_at = now()`.
   - Retry per retry policy (up to 6 attempts).
   - After max retries: set `geocoding_status = FAILED` permanently, emit alert.

---

### 3.7 Import Properties via Spreadsheet (`importProperties`)

**Actor:** AM, OP, CL_ADMIN

**This is a specialized create flow handled by the Import sub-module (referenced here for context).**

**Preconditions:**
- File is XLSX format
- Maximum 1000 rows per file

**Deduplication rule:**
- If a property already exists in the tenant with matching `street + address_line_2 + postcode` (case-insensitive): return a warning row (do not create duplicate). Existing property_code is used if matched.

**Columns mapped from spreadsheet:**

| Column | Maps to | Required |
|---|---|---|
| Property code | property_code | No |
| Service | (appointment service_type; not property field) | Yes |
| Street | street | Yes |
| Suburb | suburb | Yes |
| Postcode | postcode | Yes |
| State | state | Yes |
| Country | country | No (default "AU") |
| Address line 2 | address_line_2 | No |
| Notes | notes | No |
| Realty description | rules_json.accessNotes | No |
| OTHER: Key number | rules_json.keyNumber | No |

**Error conditions (reject row):**
- `Street` empty
- `Suburb` empty
- `Postcode` empty or invalid format
- `State` empty

**Warning conditions (import with warning):**
- Address geocoding fails → `geocoding_status = FAILED`
- `Property code` provided but already used for a different address
- Possible duplicate: same address + same service type in last 3 months

---

## 4. API Contracts

### 4.1 `POST /v1/properties`

**Auth:** Bearer token
**Roles:** AM, OP, CL_ADMIN, CL_USER (if `tenant.settings.allowClientUserManagement = true` — interpretation: CL_USER property create is always allowed unless explicitly restricted; implementation can default to CL_ADMIN+ only with configurable override)

**Request body:**

```json
{
  "branchId": "uuid",
  "propertyCode": "PROP-001",
  "type": "RESIDENTIAL",
  "street": "12 Regent Street",
  "addressLine2": "Unit 4",
  "suburb": "Redfern",
  "postcode": "2016",
  "state": "NSW",
  "country": "AU",
  "notes": "Second floor, left unit",
  "rules": {
    "keyNumber": "K-1234",
    "accessNotes": "Key in lockbox at front gate",
    "petOnPremises": true,
    "petNotes": "Small dog, stays in laundry"
  }
}
```

| Field | Type | Required | Rule |
|---|---|---|---|
| branchId | string | No | UUID; must belong to actor's tenant |
| propertyCode | string | No | max 100; unique per tenant |
| type | PropertyType | No | Default RESIDENTIAL |
| street | string | Yes | min 1, max 300 |
| addressLine2 | string | No | max 200 |
| suburb | string | Yes | min 1, max 100 |
| postcode | string | Yes | min 1, max 10 |
| state | string | Yes | min 1, max 50 |
| country | string | No | 2-char ISO; default "AU" |
| notes | string | No | max 2000 |
| rules | object | No | See rules schema |

**Success response (201):**

```json
{
  "id": "uuid",
  "tenantId": "uuid",
  "branchId": "uuid",
  "propertyCode": "PROP-001",
  "type": "RESIDENTIAL",
  "street": "12 Regent Street",
  "addressLine2": "Unit 4",
  "suburb": "Redfern",
  "postcode": "2016",
  "state": "NSW",
  "country": "AU",
  "latitude": null,
  "longitude": null,
  "geocodingStatus": "PENDING",
  "notes": "Second floor, left unit",
  "rules": {
    "keyNumber": "K-1234",
    "accessNotes": "Key in lockbox at front gate",
    "petOnPremises": true,
    "petNotes": "Small dog, stays in laundry"
  },
  "createdAt": "2026-03-15T09:00:00.000Z",
  "updatedAt": "2026-03-15T09:00:00.000Z"
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 403 | `AUTH_FORBIDDEN` | Wrong role or cross-tenant |
| 404 | `TENANT_NOT_FOUND` | Tenant not found |
| 409 | `TENANT_INACTIVE` | Tenant not ACTIVE |
| 404 | `BRANCH_NOT_FOUND` | branchId invalid or wrong tenant |
| 409 | `BRANCH_INACTIVE` | Branch INACTIVE |
| 409 | `PROPERTY_CODE_CONFLICT` | Duplicate property code |
| 422 | `VALIDATION_ERROR` | Zod failure |

---

### 4.2 `GET /v1/properties`

**Auth:** Bearer token
**Roles:** AM, OP (any tenant; `tenantId` required as query param); CL_ADMIN, CL_USER (own tenant implicit)

**Query params:**

| Param | Type | Default | Rule |
|---|---|---|---|
| tenantId | string | — | Required for AM/OP; ignored for CL (uses JWT) |
| page | number | 1 | min 1 |
| pageSize | number | 20 | min 1, max 100 |
| sortBy | string | "street" | street, suburb, postcode, type, createdAt, propertyCode |
| sortOrder | string | "asc" | asc, desc |
| branchId | string | — | UUID filter |
| type | PropertyType | — | RESIDENTIAL, COMMERCIAL, INDUSTRIAL, RURAL |
| geocodingStatus | GeocodingStatus | — | PENDING, GEOCODED, FAILED, MANUAL |
| search | string | — | searches street, suburb, postcode, propertyCode, addressLine2 |

**Success response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "tenantId": "uuid",
      "branchId": "uuid",
      "propertyCode": "PROP-001",
      "type": "RESIDENTIAL",
      "street": "12 Regent Street",
      "addressLine2": "Unit 4",
      "suburb": "Redfern",
      "postcode": "2016",
      "state": "NSW",
      "country": "AU",
      "latitude": -33.8924,
      "longitude": 151.2034,
      "geocodingStatus": "GEOCODED",
      "createdAt": "2026-03-15T09:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 403 | `AUTH_FORBIDDEN` | Cross-tenant or insufficient role |
| 422 | `VALIDATION_ERROR` | Invalid params |

---

### 4.3 `GET /v1/properties/:propertyId`

**Auth:** Bearer token
**Roles:** AM, OP (any); CL_ADMIN, CL_USER (own tenant)

**Path params:**

| Param | Type | Rule |
|---|---|---|
| propertyId | string | UUID |

**Success response (200):** Full property object including `rules`.

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 403 | `AUTH_FORBIDDEN` | Cross-tenant access |
| 404 | `PROPERTY_NOT_FOUND` | Not found or soft-deleted |

---

### 4.4 `PATCH /v1/properties/:propertyId`

**Auth:** Bearer token
**Roles:** AM, OP (any); CL_ADMIN (own tenant); CL_USER (own tenant if permitted)

**Request body:** Partial property update (all fields optional).

Note: Providing `latitude` and `longitude` together sets `geocodingStatus = MANUAL`. Providing either without the other returns a validation error.

**Success response (200):** Updated full property object.

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 403 | `AUTH_FORBIDDEN` | Wrong role or cross-tenant |
| 404 | `PROPERTY_NOT_FOUND` | Not found |
| 404 | `BRANCH_NOT_FOUND` | Invalid new branchId |
| 409 | `BRANCH_INACTIVE` | New branch is INACTIVE |
| 409 | `PROPERTY_CODE_CONFLICT` | Duplicate property code |
| 422 | `VALIDATION_ERROR` | Invalid payload |

---

### 4.5 `DELETE /v1/properties/:propertyId`

**Auth:** Bearer token
**Roles:** AM (any), CL_ADMIN (own tenant)

**Success response:** 204 No Content

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 403 | `AUTH_FORBIDDEN` | OP, CL_USER, or cross-tenant CL_ADMIN |
| 404 | `PROPERTY_NOT_FOUND` | Not found or already deleted |
| 409 | `PROPERTY_HAS_ACTIVE_APPOINTMENTS` | Linked active appointments |

---

### 4.6 `POST /v1/properties/:propertyId/geocode`

**Auth:** Bearer token
**Roles:** AM, OP only

**Body:** None

**Success response (202):**

```json
{
  "id": "uuid",
  "geocodingStatus": "PENDING",
  "geocodingAttemptedAt": null,
  "message": "Geocoding job enqueued"
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 403 | `AUTH_FORBIDDEN` | Not AM or OP |
| 404 | `PROPERTY_NOT_FOUND` | Not found |
| 409 | `PROPERTY_GEOCODING_MANUAL_OVERRIDE` | Status is MANUAL; must clear coordinates first |

---

### 4.7 Rate limits

| Endpoint | Limit |
|---|---|
| `POST /v1/properties` | General tenant rate limit: 60 req/min per tenant |
| `POST /v1/properties/:id/geocode` | 20 req/min per user |
| `POST /v1/appointments/import` (contains property creation) | 60 req/min per tenant |

---

## 5. Business Rules

1. **Mandatory tenant scope:** Every property query must include `tenant_id` as a filter condition. There is no operation that returns properties across multiple tenants in a single result set (except AM internal tooling).
2. **Property code uniqueness:** `property_code` must be unique per tenant. It is optional — two properties in the same tenant can both have a null `property_code`. The unique constraint only applies when a code is provided.
3. **Address fields are required:** `street`, `suburb`, `postcode`, and `state` are mandatory on create. `country` defaults to `"AU"`. These four fields are the minimum to attempt geocoding.
4. **Geocoding is asynchronous:** When a property is created or its address is updated, geocoding is queued as a background job. The API response does not wait for geocoding. `latitude` and `longitude` will be null initially.
5. **Manual coordinate override:** When an operator provides explicit `latitude` and `longitude` via PATCH, the `geocoding_status` is set to `MANUAL`. This signals that the coordinates should not be overwritten by the async geocoding job. To revert to auto-geocoding, the operator must patch `latitude: null, longitude: null` (which resets status to `PENDING` and enqueues the geocoding job).
6. **Geocoding failure fallback:** If geocoding fails after all retries (6 attempts), `geocoding_status = FAILED` is set. The property remains usable for appointments — geocoding is supplementary, not blocking. An operator can manually set coordinates or re-trigger geocoding.
7. **Soft delete:** `deleted_at` marks a property as deleted. Soft-deleted properties do not appear in list or get endpoints. Their `id` is retained for historical appointment records.
8. **Delete blocked by active appointments:** A property cannot be soft-deleted if it has appointments in any status except `CANCELLED` or `REJECTED`. The operator must first cancel/complete those appointments.
9. **Branch validation:** If `branch_id` is provided, the branch must belong to the same `tenant_id` as the property. Assigning a property to a branch from a different tenant is a hard error, not a warning.
10. **Inactive branch validation:** A property can be associated with an INACTIVE branch (for historical records), but new properties cannot be assigned to INACTIVE branches on creation.
11. **Country code:** `country` is stored as ISO 3166-1 alpha-2 (2 uppercase characters). The default is `"AU"` (Australia). The API accepts lowercase and normalizes to uppercase.
12. **rules_json merge strategy:** When updating `rules`, the incoming rules object is deep-merged with the existing `rules_json`. A PATCH with `{ rules: { keyNumber: "K-999" } }` only updates `keyNumber`, preserving all other rule fields.
13. **notes vs rules:** `notes` is a general free-text field for any miscellaneous notes. `rules_json` is structured access/inspection-specific metadata. Both are optional.
14. **Postcode validation:** The postcode field is stored as a string (not integer) to preserve leading zeros and support international formats. No format validation is enforced at the database level; the application layer may apply country-specific format rules (for AU: 4-digit numeric string is recommended).
15. **Import deduplication:** During spreadsheet import, if a property with the same `street + address_line_2 + postcode` (case-insensitive, trimmed) already exists in the tenant, no new property is created. The existing property_id is used for the appointment being imported. A warning is recorded in the import result.
16. **Import volume limit:** Spreadsheet import is limited to 1000 rows per file. Files exceeding this limit are rejected at upload time with an appropriate error.
17. **CL_USER property creation:** By default, CL_USER can create properties. If the tenant configuration restricts this (future feature flag), the application checks the flag and returns `AUTH_FORBIDDEN` for CL_USER create operations.
18. **Geocoding status transitions:**
    - `PENDING` → `GEOCODED` (job success)
    - `PENDING` → `FAILED` (job max retries exceeded)
    - `FAILED` → `PENDING` (manual re-trigger or address update)
    - Any status → `MANUAL` (operator sets coordinates explicitly)
    - `MANUAL` → `PENDING` (operator clears manual coordinates)
19. **Property coordinates and appointment matching:** The `latitude` and `longitude` on a property are used by the service group / marketplace feature to match inspectors to inspection locations. If coordinates are not available, inspector matching falls back to suburb/postcode matching.

---

## 6. Authorization Matrix

| Action | AM | OP | CL_ADMIN | CL_USER | INSP |
|---|---|---|---|---|---|
| createProperty (any tenant) | Yes | Yes | No | No | No |
| createProperty (own tenant) | Yes | Yes | Yes | Yes* | No |
| listProperties (any tenant) | Yes | Yes | No | No | No |
| listProperties (own tenant) | Yes | Yes | Yes | Yes | No |
| getProperty (any tenant) | Yes | Yes | No | No | No |
| getProperty (own tenant) | Yes | Yes | Yes | Yes | No |
| updateProperty (any tenant) | Yes | Yes | No | No | No |
| updateProperty (own tenant) | Yes | Yes | Yes | Yes* | No |
| deleteProperty (any tenant) | Yes | No | No | No | No |
| deleteProperty (own tenant) | Yes | No | Yes | No | No |
| geocodeProperty (manual trigger) | Yes | Yes | No | No | No |

*CL_USER: can create and update properties by default. Tenant-level configuration may restrict this in a future iteration.

---

## 7. Domain Events

### `property.created.v1`

```typescript
{
  eventType: "property.created.v1",
  occurredAt: string,
  payload: {
    propertyId: string,
    tenantId: string,
    branchId: string | null,
    street: string,
    suburb: string,
    postcode: string,
    state: string,
    country: string,
    createdByUserId: string,
  }
}
```

**Consumers:** Audit log service, geocoding job (trigger via use case, not event)

---

### `property.updated.v1`

```typescript
{
  eventType: "property.updated.v1",
  occurredAt: string,
  payload: {
    propertyId: string,
    tenantId: string,
    changedFields: string[],
    addressChanged: boolean,
    updatedByUserId: string,
  }
}
```

**Consumers:** Audit log service

---

### `property.deleted.v1`

```typescript
{
  eventType: "property.deleted.v1",
  occurredAt: string,
  payload: {
    propertyId: string,
    tenantId: string,
    deletedByUserId: string,
  }
}
```

**Consumers:** Audit log service

---

### `property.geocoding_failed.v1`

```typescript
{
  eventType: "property.geocoding_failed.v1",
  occurredAt: string,
  payload: {
    propertyId: string,
    tenantId: string,
    address: string,
    attemptCount: number,
    errorMessage: string,
  }
}
```

**Consumers:** Audit log service, operational alert system

---

### `property.geocoded.v1`

```typescript
{
  eventType: "property.geocoded.v1",
  occurredAt: string,
  payload: {
    propertyId: string,
    tenantId: string,
    latitude: number,
    longitude: number,
  }
}
```

**Consumers:** Audit log service, service group matching (if cached)

---

## 8. Queue Jobs

### `property.geocode`

**Queue name:** `property`
**Job name:** `property.geocode`
**Processor:** Property worker (`apps/backend/src/modules/property/infrastructure/workers/geocode.worker.ts`)

**Payload:**

```typescript
{
  jobId: string,    // unique job id (for idempotency)
  propertyId: string,
  tenantId: string,
  address: {
    street: string,
    addressLine2?: string,
    suburb: string,
    postcode: string,
    state: string,
    country: string,
  }
}
```

**Job execution steps:**

1. Load property by `propertyId`. If not found or `deleted_at IS NOT NULL`: skip (log and discard).
2. If `geocoding_status = MANUAL`: skip (manual override active; log and discard).
3. If `geocoding_status = GEOCODED`: skip (already done by a previous run; idempotent).
4. Build address string: `"${address.street}${address.addressLine2 ? ', ' + address.addressLine2 : ''}, ${address.suburb} ${address.state} ${address.postcode}, ${address.country}"`.
5. Call Mapbox Geocoding API:
   - Endpoint: `GET https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressString)}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1&country=${address.country.toLowerCase()}`
6. If response HTTP 200 and `features[0]` exists:
   - Extract `center[0]` (longitude) and `center[1]` (latitude).
   - Update property: `latitude`, `longitude`, `geocoding_status = GEOCODED`, `geocoding_attempted_at = now()`.
   - Emit `property.geocoded.v1`.
7. If no features or response non-200:
   - Update `geocoding_attempted_at = now()`.
   - Throw error to trigger pg-boss retry.
8. On max retries exceeded (pg-boss sets job state to `failed` in pgboss.job table):
   - Update `geocoding_status = FAILED`.
   - Emit `property.geocoding_failed.v1`.
   - Alert operational team.

**Retry policy:**

```typescript
{
  attempts: 6,
  backoff: {
    type: "exponential",
    delay: 15000,   // 15 seconds initial delay
  },
  // Sequence: 15s, 45s, 2min, 5min, 15min (approximately)
}
```

**DLQ behavior:**

- Job moved to DLQ after 6 failed attempts
- DLQ name: `property:geocode:failed`
- Retention: 14 days
- Alert: operational alert when DLQ size exceeds 10 items
- Reprocessing: AM/OP can re-trigger via `POST /v1/properties/:id/geocode`

**Idempotency:**

- If a property already has `geocoding_status = GEOCODED` or `= MANUAL`, the job skips processing and marks itself successful
- Uses `propertyId` as the natural idempotency key (only one active geocoding job per property at a time; enforced by checking status at job start)

---

## 9. External Integrations

### Mapbox Geocoding API

**Service:** Mapbox
**Endpoint:** `https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json`
**Method:** GET
**Auth:** Query param `access_token` (from env `MAPBOX_ACCESS_TOKEN`)

**Parameters used:**

| Param | Value |
|---|---|
| access_token | `${MAPBOX_ACCESS_TOKEN}` |
| limit | `1` (only need best match) |
| country | `${country.toLowerCase()}` (e.g., "au") |
| types | `address` (to narrow to street addresses) |

**Response structure used:**

```json
{
  "features": [
    {
      "center": [151.2034, -33.8924],  // [longitude, latitude]
      "place_name": "12 Regent Street, Redfern NSW 2016, Australia"
    }
  ]
}
```

**Circuit breaker:**

- Implemented using `opossum` or equivalent
- Threshold: 50% failure rate over 30 seconds → open circuit
- Half-open probe: every 60 seconds
- Fallback behavior: when circuit open, set `geocoding_status = PENDING` (skip attempt, schedule retry for later)

**Fallback (geocoding failure):**

1. Geocoding fails → mark `geocoding_status = FAILED` after max retries
2. Property remains usable; appointment creation proceeds without coordinates
3. OP is alerted to manually correct coordinates via PATCH
4. `POST /v1/properties/:id/geocode` allows manual re-trigger at any time

**Environment variables:**

| Variable | Description |
|---|---|
| `MAPBOX_ACCESS_TOKEN` | Mapbox API access token (secret) |

---

## 10. Test Scenarios

### 10.1 Unit Tests (Use Cases)

#### CreatePropertyUseCase

- [ ] Should create property with geocodingStatus=PENDING and null coordinates
- [ ] Should enqueue geocoding job after creation
- [ ] Should return `PROPERTY_CODE_CONFLICT` when propertyCode already used in tenant
- [ ] Same propertyCode in different tenant should be allowed
- [ ] Should return `BRANCH_NOT_FOUND` for invalid branchId
- [ ] Should return `BRANCH_INACTIVE` for inactive branch
- [ ] Should return `TENANT_INACTIVE` for inactive tenant
- [ ] Should return `AUTH_FORBIDDEN` for cross-tenant access
- [ ] Should set country default to "AU" when not provided
- [ ] Should normalize country code to uppercase

#### UpdatePropertyUseCase

- [ ] Should update fields and return updated property
- [ ] Should reset geocodingStatus to PENDING and enqueue geocoding job when address fields change
- [ ] Should NOT re-enqueue geocoding job when only notes or rules change
- [ ] Should set geocodingStatus=MANUAL when latitude and longitude are provided
- [ ] Should return validation error when only latitude is provided without longitude
- [ ] Should return validation error when only longitude is provided without latitude
- [ ] Clearing latitude/longitude (null) should reset geocodingStatus to PENDING and enqueue job
- [ ] Should deep-merge rules_json on update
- [ ] Should check propertyCode uniqueness on change
- [ ] Should validate new branchId belongs to tenant

#### DeletePropertyUseCase

- [ ] Should soft-delete property with no active appointments
- [ ] Should return `PROPERTY_HAS_ACTIVE_APPOINTMENTS` with DRAFT appointments
- [ ] Should return `PROPERTY_HAS_ACTIVE_APPOINTMENTS` with SCHEDULED appointments
- [ ] Should allow delete when only CANCELLED/REJECTED appointments exist
- [ ] CL_ADMIN should successfully delete own-tenant property
- [ ] OP should receive `AUTH_FORBIDDEN` on delete attempt
- [ ] CL_ADMIN should receive `AUTH_FORBIDDEN` for cross-tenant property

#### GeocodePropertyJob

- [ ] Should set GEOCODED status and coordinates on Mapbox success
- [ ] Should emit property.geocoded.v1 event on success
- [ ] Should throw error (trigger retry) on Mapbox API failure
- [ ] Should skip processing if status is already GEOCODED
- [ ] Should skip processing if status is MANUAL
- [ ] Should skip processing if property is soft-deleted
- [ ] Should set FAILED status and emit property.geocoding_failed.v1 after max retries (DLQ)

### 10.2 Integration Tests (API + DB)

- [ ] `POST /v1/properties` → 201 with valid payload as CL_ADMIN
- [ ] `POST /v1/properties` → 409 on duplicate propertyCode in same tenant
- [ ] `POST /v1/properties` → 201 with same propertyCode in different tenant (AM cross-tenant test)
- [ ] `GET /v1/properties` → 200 with pagination and branchId filter
- [ ] `GET /v1/properties?search=regent` → returns properties matching street
- [ ] `GET /v1/properties/:id` → 200 for own-tenant property as CL_ADMIN
- [ ] `GET /v1/properties/:id` → 403 for cross-tenant property as CL_ADMIN
- [ ] `PATCH /v1/properties/:id` → 200 with partial update
- [ ] `PATCH /v1/properties/:id` → geocoding job enqueued when street changes
- [ ] `PATCH /v1/properties/:id` → geocodingStatus=MANUAL when lat/lng provided
- [ ] `DELETE /v1/properties/:id` → 204 as CL_ADMIN with no appointments
- [ ] `DELETE /v1/properties/:id` → 409 with active appointment
- [ ] `DELETE /v1/properties/:id` → 403 as OP
- [ ] `POST /v1/properties/:id/geocode` → 202 as OP
- [ ] `POST /v1/properties/:id/geocode` → 409 when geocodingStatus=MANUAL
- [ ] `GET /v1/properties?geocodingStatus=FAILED` → filter works correctly

### 10.3 Edge Cases

- [ ] Property with propertyCode=null: second property with propertyCode=null in same tenant should be allowed (null is not unique-constrained)
- [ ] Very long street name (300 chars) should be accepted
- [ ] Street name with special characters (apostrophes, hyphens) should not break SQL
- [ ] Geocoding job: address with special characters is URL-encoded before sending to Mapbox
- [ ] Geocoding job: Mapbox returns empty features array → treated as failure → retry
- [ ] Geocoding job: Mapbox returns HTTP 429 → respect Retry-After header if present
- [ ] Soft-deleted property: GET by id returns 404; not visible in list; still referenced by historical appointments
- [ ] Creating appointment with soft-deleted property_id: appointment module should validate property is active
- [ ] Latitude/longitude boundary values: lat=90, lon=180 and lat=-90, lon=-180 should be accepted
- [ ] Latitude/longitude out of bounds: lat=91 should be rejected by Zod validation

### 10.4 Security / Multi-Tenant Scenarios

- [ ] AM can list properties from any tenant by passing `tenantId` query param
- [ ] CL_ADMIN cannot pass a different `tenantId` to list another tenant's properties (JWT tenantId takes precedence)
- [ ] OP cannot delete a property (explicitly blocked even for OP)
- [ ] Soft-deleted properties do not appear in list results for any role
- [ ] All audit log entries include tenantId, actorId, before_json, after_json
- [ ] Geocoding job cannot update a property from a different tenant (tenantId is part of job payload and validated in job handler)
- [ ] `search` parameter with SQL injection patterns (e.g., `' OR 1=1 --`) is safely handled by Prisma parameterized queries
- [ ] Creating a property where `branchId` belongs to a different tenant returns 404 (not 403, to avoid revealing branch existence)
