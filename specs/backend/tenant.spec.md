# Tenant Module – Implementation Spec

> **SUPERSEDED** by `specs/002-tenants-branches/` — this legacy spec is preserved for historical reference only.

**Version:** 1.0
**Module path:** `apps/backend/src/modules/tenant`
**Last updated:** 2026-03-15

---

## 1. Overview

### Purpose

The Tenant module manages the multi-tenant core of Properfy: creating and managing real estate agency accounts (Tenants) and their branch offices (Branches). Every business entity in the platform belongs to a tenant. This module enforces multi-tenant isolation as a foundational concern.

### Actors

| Actor | Interactions |
|---|---|
| AM | Create tenant, view all tenants, update any tenant, deactivate any tenant, create/update/deactivate any branch |
| OP | View all tenants, view all branches (read-only for AM-scoped operations) |
| CL_ADMIN | View own tenant, update own tenant settings, create/update branches in own tenant |
| CL_USER | View own tenant (read-only), view own tenant branches |
| INSP | No tenant management access |

### Domain Boundaries

- Owns: `Tenant`, `Branch` entities
- Does NOT own: `User`, `Property`, `Appointment`, billing — those reference tenant_id but are managed by their own modules
- Depends on: Auth module (JWT context for actor resolution)

### Dependencies

- Auth module: JWT middleware provides `actor.tenantId`, `actor.role`
- Property module: Properties reference `branch_id`; deactivation must check for active properties/appointments (cross-module query)
- Appointment module: Deactivation of tenant or branch must check for open appointments (cross-module query via service boundary)

---

## 2. Data Model

### 2.1 Enums

#### `TenantStatus`

```prisma
enum TenantStatus {
  ACTIVE      // Fully operational
  INACTIVE    // Suspended; users cannot log in or create appointments
  PENDING     // Newly created, awaiting setup completion
}
```

#### `BranchStatus`

```prisma
enum BranchStatus {
  ACTIVE    // Branch is operational
  INACTIVE  // Branch is deactivated; cannot create new appointments
}
```

### 2.2 Entity: `Tenant`

**Table:** `tenants`

| Field | Prisma Type | Nullable | Default | Constraint |
|---|---|---|---|---|
| id | String | No | `uuid()` | PK |
| name | String | No | — | max 200 chars; display name |
| legal_name | String | No | — | max 200 chars; legal/fiscal name |
| status | TenantStatus | No | `PENDING` | enum |
| timezone | String | No | `"Australia/Sydney"` | IANA timezone string, max 60 chars |
| currency | String | No | `"AUD"` | ISO 4217, 3 chars |
| settings_json | Json | No | `{}` | See settings_json structure |
| created_at | DateTime | No | `now()` | |
| updated_at | DateTime | No | `now()` | auto-updated |
| deleted_at | DateTime | Yes | — | soft delete |

**Indexes:**

```prisma
@@index([status])
@@index([deleted_at])
@@unique([legal_name])
```

#### `settings_json` Structure

```typescript
interface TenantSettings {
  // Branding
  logoUrl?: string;               // URL to tenant logo (Supabase storage)
  primaryColor?: string;          // Hex color for email templates, e.g. "#1A73E8"

  // Notifications
  notificationFromName?: string;   // Sender display name in emails
  notificationFromEmail?: string;  // Sender email (must be verified domain)
  smsFromName?: string;            // SMS sender ID (max 11 chars alphanumeric)

  // Billing
  billingPeriod?: "WEEKLY" | "BIWEEKLY" | "MONTHLY"; // default "MONTHLY"
  billingDayOfWeek?: number;       // 0-6 for WEEKLY/BIWEEKLY (0=Sunday)
  billingDayOfMonth?: number;      // 1-28 for MONTHLY

  // Feature flags / permissions per tenant
  allowClientCancellation?: boolean;    // default true
  allowClientRescheduling?: boolean;    // default true
  allowClientFinancialView?: boolean;   // default false
  allowClientReportExport?: boolean;    // default false
  allowClientUserManagement?: boolean;  // default false

  // Inspector offer config
  priorityOfferHours?: number;          // default 24; configurable priority offer window
  inspectorOfferRadiusKm?: number;      // default 2; radius for inspector matching

  // Email template overrides (per-tenant custom templates)
  emailTemplates?: {
    initial?: { subject?: string; headerText?: string; footerText?: string; signature?: string; };
    reminder7d?: { subject?: string; headerText?: string; };
    reminder5d?: { subject?: string; headerText?: string; };
    reminder3d?: { subject?: string; headerText?: string; };
    escalation?: { subject?: string; headerText?: string; };
    confirmed?: { subject?: string; headerText?: string; };
    rescheduled?: { subject?: string; headerText?: string; };
    cancelled?: { subject?: string; headerText?: string; };
  };
}
```

### 2.3 Entity: `Branch`

**Table:** `branches`

| Field | Prisma Type | Nullable | Default | Constraint |
|---|---|---|---|---|
| id | String | No | `uuid()` | PK |
| tenant_id | String | No | — | FK → tenants.id |
| name | String | No | — | max 200 chars |
| address_json | Json | Yes | — | See address_json structure |
| status | BranchStatus | No | `ACTIVE` | enum |
| created_at | DateTime | No | `now()` | |
| updated_at | DateTime | No | `now()` | auto-updated |
| deleted_at | DateTime | Yes | — | soft delete |

**Indexes:**

```prisma
@@index([tenant_id])
@@index([tenant_id, status])
@@index([deleted_at])
```

#### `address_json` Structure

```typescript
interface BranchAddress {
  street?: string;
  addressLine2?: string;
  suburb?: string;
  postcode?: string;
  state?: string;
  country?: string;   // default "AU"
  latitude?: number;
  longitude?: number;
}
```

### 2.4 Complete Prisma Schema (tenant module entities)

```prisma
enum TenantStatus {
  ACTIVE
  INACTIVE
  PENDING
}

enum BranchStatus {
  ACTIVE
  INACTIVE
}

model Tenant {
  id            String        @id @default(uuid())
  name          String        @db.VarChar(200)
  legal_name    String        @unique @db.VarChar(200)
  status        TenantStatus  @default(PENDING)
  timezone      String        @default("Australia/Sydney") @db.VarChar(60)
  currency      String        @default("AUD") @db.Char(3)
  settings_json Json          @default("{}")
  created_at    DateTime      @default(now())
  updated_at    DateTime      @updatedAt
  deleted_at    DateTime?

  branches      Branch[]
  users         User[]

  @@index([status])
  @@index([deleted_at])
  @@map("tenants")
}

model Branch {
  id            String        @id @default(uuid())
  tenant_id     String
  name          String        @db.VarChar(200)
  address_json  Json?
  status        BranchStatus  @default(ACTIVE)
  created_at    DateTime      @default(now())
  updated_at    DateTime      @updatedAt
  deleted_at    DateTime?

  tenant        Tenant        @relation(fields: [tenant_id], references: [id])
  users         User[]
  properties    Property[]

  @@index([tenant_id])
  @@index([tenant_id, status])
  @@index([deleted_at])
  @@map("branches")
}
```

---

## 3. Use Cases

### 3.1 Create Tenant (`createTenant`)

**Actor:** AM only

**Preconditions:**
- Actor has role AM
- `legal_name` is unique across all tenants (including soft-deleted is a policy decision: block reuse by default)

**Input DTO:**

```typescript
const CreateTenantInputSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  legalName: z.string().min(1).max(200).trim(),
  timezone: z.string().min(1).max(60).default("Australia/Sydney"),
  currency: z.string().length(3).default("AUD"),
  settings: z.object({
    logoUrl: z.string().url().optional(),
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    billingPeriod: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
    billingDayOfWeek: z.number().int().min(0).max(6).optional(),
    billingDayOfMonth: z.number().int().min(1).max(28).optional(),
    allowClientCancellation: z.boolean().optional(),
    allowClientRescheduling: z.boolean().optional(),
    allowClientFinancialView: z.boolean().optional(),
    allowClientReportExport: z.boolean().optional(),
    allowClientUserManagement: z.boolean().optional(),
    priorityOfferHours: z.number().int().min(1).max(168).optional(),
    inspectorOfferRadiusKm: z.number().min(0.5).max(50).optional(),
  }).optional().default({}),
});
```

**Step-by-step process:**

1. Validate input.
2. Authorize: verify actor role is AM.
3. Check `legalName` uniqueness (case-insensitive); if exists return `TENANT_LEGAL_NAME_CONFLICT`.
4. Create `Tenant` record with `status = PENDING`.
5. Emit domain event `tenant.created.v1`.
6. Write audit log.
7. Return created tenant.

**Output DTO:**

```typescript
{
  id: string;
  name: string;
  legalName: string;
  status: "PENDING";
  timezone: string;
  currency: string;
  settings: TenantSettings;
  createdAt: string;
  updatedAt: string;
}
```

**Possible Errors:**

| Code | Message | Condition |
|---|---|---|
| `AUTH_FORBIDDEN` | Insufficient permissions | Actor is not AM |
| `TENANT_LEGAL_NAME_CONFLICT` | Legal name already in use | Duplicate legalName |
| `VALIDATION_ERROR` | Request payload is invalid | Zod failure |

**Side Effects:**
- Audit log: `tenant.created`
- Event: `tenant.created.v1`

---

### 3.2 Update Tenant (`updateTenant`)

**Actor:** AM (any tenant), CL_ADMIN (own tenant only, limited fields)

**Preconditions:**
- Tenant exists and is not soft-deleted
- CL_ADMIN can only update: `name`, `settings` (subset)
- AM can update all fields

**Input DTO:**

```typescript
const UpdateTenantInputSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  legalName: z.string().min(1).max(200).trim().optional(), // AM only
  timezone: z.string().min(1).max(60).optional(),          // AM only
  currency: z.string().length(3).optional(),               // AM only
  status: z.enum(["ACTIVE", "INACTIVE", "PENDING"]).optional(), // AM only
  settings: z.object({
    logoUrl: z.string().url().optional().nullable(),
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
    notificationFromName: z.string().max(100).optional(),
    notificationFromEmail: z.string().email().optional(),
    smsFromName: z.string().max(11).optional(),
    billingPeriod: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
    billingDayOfWeek: z.number().int().min(0).max(6).optional(),
    billingDayOfMonth: z.number().int().min(1).max(28).optional(),
    allowClientCancellation: z.boolean().optional(),
    allowClientRescheduling: z.boolean().optional(),
    allowClientFinancialView: z.boolean().optional(),
    allowClientReportExport: z.boolean().optional(),
    allowClientUserManagement: z.boolean().optional(),
    priorityOfferHours: z.number().int().min(1).max(168).optional(),
    inspectorOfferRadiusKm: z.number().min(0.5).max(50).optional(),
  }).optional(),
});
```

**Step-by-step process:**

1. Validate input.
2. Load tenant by id where `deleted_at IS NULL`.
3. If not found: return `TENANT_NOT_FOUND`.
4. Authorize:
   - If actor is AM: proceed.
   - If actor is CL_ADMIN and `actor.tenantId == tenant.id`: allow only `name` and `settings` fields. If any AM-only fields are provided, return `AUTH_FORBIDDEN`.
   - Otherwise: return `AUTH_FORBIDDEN`.
5. If `legalName` is changing: check uniqueness (AM only); if conflict return `TENANT_LEGAL_NAME_CONFLICT`.
6. For `settings`: deep merge with existing `settings_json` (do not replace entirely).
7. Apply updates.
8. Emit event `tenant.updated.v1`.
9. Write audit log with `before_json` and `after_json`.
10. Return updated tenant.

**Output DTO:** Same as createTenant output, plus full settings.

**Possible Errors:**

| Code | Message | Condition |
|---|---|---|
| `AUTH_FORBIDDEN` | Insufficient permissions | Role not allowed or cross-tenant access |
| `TENANT_NOT_FOUND` | Tenant not found | Non-existent or soft-deleted id |
| `TENANT_LEGAL_NAME_CONFLICT` | Legal name already in use | Duplicate on update |
| `VALIDATION_ERROR` | Request payload is invalid | Zod failure |

**Side Effects:**
- Audit log with before/after
- Event: `tenant.updated.v1`

---

### 3.3 List Tenants (`listTenants`)

**Actor:** AM, OP

**Preconditions:**
- Actor is AM or OP

**Input DTO (query params):**

```typescript
const ListTenantsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["name", "legalName", "status", "createdAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  status: z.enum(["ACTIVE", "INACTIVE", "PENDING"]).optional(),
  search: z.string().max(100).optional(), // name or legalName ILIKE
});
```

**Step-by-step process:**

1. Authorize: AM or OP only; otherwise return `AUTH_FORBIDDEN`.
2. Build query:
   - Filter `deleted_at IS NULL`
   - If `status`: filter by status
   - If `search`: `name ILIKE %search%` OR `legal_name ILIKE %search%`
3. Count total matching records.
4. Fetch page.
5. Return paginated response.

**Output DTO:**

```typescript
{
  data: TenantSummary[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }
}

interface TenantSummary {
  id: string;
  name: string;
  legalName: string;
  status: TenantStatus;
  timezone: string;
  currency: string;
  createdAt: string;
}
```

**Possible Errors:**

| Code | Message | Condition |
|---|---|---|
| `AUTH_FORBIDDEN` | Insufficient permissions | Actor is not AM or OP |
| `VALIDATION_ERROR` | Invalid query params | Zod failure |

---

### 3.4 Get Tenant (`getTenant`)

**Actor:** AM, OP (any tenant), CL_ADMIN/CL_USER (own tenant only)

**Input:** `tenantId` (path param)

**Step-by-step process:**

1. Load tenant by id where `deleted_at IS NULL`.
2. If not found: return `TENANT_NOT_FOUND`.
3. Authorize:
   - AM or OP: always allowed.
   - CL_ADMIN or CL_USER: only if `actor.tenantId == tenant.id`.
   - Otherwise: `AUTH_FORBIDDEN`.
4. Return full tenant including settings.

**Output DTO:**

```typescript
{
  id: string;
  name: string;
  legalName: string;
  status: TenantStatus;
  timezone: string;
  currency: string;
  settings: TenantSettings;
  createdAt: string;
  updatedAt: string;
}
```

**Possible Errors:**

| Code | Message | Condition |
|---|---|---|
| `AUTH_FORBIDDEN` | Insufficient permissions | Cross-tenant access by CL role |
| `TENANT_NOT_FOUND` | Tenant not found | Non-existent or soft-deleted |

---

### 3.5 Deactivate Tenant (`deactivateTenant`)

**Actor:** AM only

**Preconditions:**
- Tenant is ACTIVE or PENDING
- No open appointments (DRAFT, AWAITING_INSPECTOR, SCHEDULED) associated with the tenant

**Input DTO:**

```typescript
const DeactivateTenantInputSchema = z.object({
  reason: z.string().min(1).max(500),
});
```

**Step-by-step process:**

1. Authorize: AM only.
2. Load tenant; if not found return `TENANT_NOT_FOUND`.
3. If tenant already INACTIVE: return `TENANT_ALREADY_INACTIVE`.
4. Query appointment module service: check for open appointments for this tenant.
   - If any exist: return `TENANT_HAS_OPEN_APPOINTMENTS` with count.
5. Set `tenant.status = INACTIVE`.
6. Emit event `tenant.deactivated.v1`.
7. Write audit log with reason.
8. Return updated tenant.

**Possible Errors:**

| Code | Message | Condition |
|---|---|---|
| `AUTH_FORBIDDEN` | Insufficient permissions | Not AM |
| `TENANT_NOT_FOUND` | Tenant not found | Non-existent |
| `TENANT_ALREADY_INACTIVE` | Tenant is already inactive | Already INACTIVE |
| `TENANT_HAS_OPEN_APPOINTMENTS` | Cannot deactivate tenant with open appointments | Open appointments exist |
| `VALIDATION_ERROR` | Reason is required | Zod failure |

**Side Effects:**
- Audit log with reason
- Event: `tenant.deactivated.v1`
- Note: Deactivating a tenant does NOT soft-delete users or branches — they remain but users cannot log in (their tenant is INACTIVE, checked at auth time).

---

### 3.6 Create Branch (`createBranch`)

**Actor:** AM (any tenant), CL_ADMIN (own tenant)

**Preconditions:**
- Tenant exists and is ACTIVE
- `name` is unique within the tenant (case-insensitive)

**Input DTO:**

```typescript
const CreateBranchInputSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  address: z.object({
    street: z.string().max(300).optional(),
    addressLine2: z.string().max(200).optional(),
    suburb: z.string().max(100).optional(),
    postcode: z.string().max(10).optional(),
    state: z.string().max(50).optional(),
    country: z.string().length(2).default("AU"),
  }).optional(),
});
```

**Step-by-step process:**

1. Validate input.
2. Load tenant; verify exists and ACTIVE.
3. Authorize: AM or CL_ADMIN of same tenant.
4. Check branch name uniqueness within tenant; if conflict return `BRANCH_NAME_CONFLICT`.
5. Create `Branch` record with `status = ACTIVE`.
6. Emit event `branch.created.v1`.
7. Write audit log.
8. Return created branch.

**Output DTO:**

```typescript
{
  id: string;
  tenantId: string;
  name: string;
  address: BranchAddress | null;
  status: BranchStatus;
  createdAt: string;
  updatedAt: string;
}
```

**Possible Errors:**

| Code | Message | Condition |
|---|---|---|
| `AUTH_FORBIDDEN` | Insufficient permissions | Wrong role or cross-tenant |
| `TENANT_NOT_FOUND` | Tenant not found | Non-existent |
| `TENANT_INACTIVE` | Tenant is not active | Tenant is INACTIVE or PENDING |
| `BRANCH_NAME_CONFLICT` | Branch name already in use in this tenant | Duplicate name |
| `VALIDATION_ERROR` | Invalid payload | Zod failure |

---

### 3.7 Update Branch (`updateBranch`)

**Actor:** AM (any), CL_ADMIN (own tenant only)

**Input DTO:**

```typescript
const UpdateBranchInputSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  address: z.object({
    street: z.string().max(300).optional().nullable(),
    addressLine2: z.string().max(200).optional().nullable(),
    suburb: z.string().max(100).optional().nullable(),
    postcode: z.string().max(10).optional().nullable(),
    state: z.string().max(50).optional().nullable(),
    country: z.string().length(2).optional(),
  }).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(), // AM only
});
```

**Step-by-step process:**

1. Load branch by id and `tenantId` from path; verify `deleted_at IS NULL`.
2. If not found: `BRANCH_NOT_FOUND`.
3. Authorize: AM or CL_ADMIN of same tenant.
4. CL_ADMIN cannot change `status` — if provided, return `AUTH_FORBIDDEN`.
5. If `name` changing: check uniqueness within tenant.
6. Apply updates; deep-merge `address`.
7. Emit event `branch.updated.v1`.
8. Write audit log.
9. Return updated branch.

**Possible Errors:**

| Code | Message | Condition |
|---|---|---|
| `AUTH_FORBIDDEN` | Insufficient permissions | Cross-tenant or CL trying to change status |
| `BRANCH_NOT_FOUND` | Branch not found | Non-existent or wrong tenant |
| `BRANCH_NAME_CONFLICT` | Branch name already in use | Duplicate name |
| `VALIDATION_ERROR` | Invalid payload | Zod failure |

---

### 3.8 List Branches (`listBranches`)

**Actor:** AM, OP (any tenant), CL_ADMIN/CL_USER (own tenant)

**Input DTO (query params):**

```typescript
const ListBranchesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z.enum(["name", "status", "createdAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  search: z.string().max(100).optional(),
});
```

**Step-by-step process:**

1. Resolve `tenantId` from path parameter.
2. Authorize: AM/OP always; CL_ADMIN/CL_USER only if `actor.tenantId == tenantId`.
3. Query branches where `tenant_id = tenantId` and `deleted_at IS NULL`.
4. Apply filters and pagination.
5. Return paginated list.

**Output DTO:**

```typescript
{
  data: BranchSummary[];
  meta: { page, pageSize, total, totalPages }
}
```

---

### 3.9 Deactivate Branch (`deactivateBranch`)

**Actor:** AM only

**Preconditions:**
- Branch is ACTIVE
- No open appointments (DRAFT, AWAITING_INSPECTOR, SCHEDULED) for this branch

**Input DTO:**

```typescript
const DeactivateBranchInputSchema = z.object({
  reason: z.string().min(1).max(500),
});
```

**Step-by-step process:**

1. Authorize: AM only.
2. Load branch by id; verify belongs to the specified tenant.
3. If branch already INACTIVE: return `BRANCH_ALREADY_INACTIVE`.
4. Query appointment module: check for open appointments for this branch.
   - If any: return `BRANCH_HAS_OPEN_APPOINTMENTS`.
5. Set `branch.status = INACTIVE`.
6. Emit event `branch.deactivated.v1`.
7. Write audit log with reason.
8. Return updated branch.

**Possible Errors:**

| Code | Message | Condition |
|---|---|---|
| `AUTH_FORBIDDEN` | Insufficient permissions | Not AM |
| `BRANCH_NOT_FOUND` | Branch not found | Non-existent or wrong tenant |
| `BRANCH_ALREADY_INACTIVE` | Branch is already inactive | Already INACTIVE |
| `BRANCH_HAS_OPEN_APPOINTMENTS` | Cannot deactivate branch with open appointments | Open appointments exist |
| `VALIDATION_ERROR` | Reason is required | Zod failure |

---

## 4. API Contracts

### 4.1 `POST /v1/tenants`

**Auth:** Bearer token
**Roles:** AM only

**Request body:**

```json
{
  "name": "Sunrise Real Estate",
  "legalName": "Sunrise Real Estate Pty Ltd",
  "timezone": "Australia/Sydney",
  "currency": "AUD",
  "settings": {
    "billingPeriod": "MONTHLY",
    "billingDayOfMonth": 1,
    "allowClientCancellation": true,
    "allowClientRescheduling": true
  }
}
```

**Success response (201):**

```json
{
  "id": "uuid",
  "name": "Sunrise Real Estate",
  "legalName": "Sunrise Real Estate Pty Ltd",
  "status": "PENDING",
  "timezone": "Australia/Sydney",
  "currency": "AUD",
  "settings": { ... },
  "createdAt": "2026-03-15T09:00:00.000Z",
  "updatedAt": "2026-03-15T09:00:00.000Z"
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 403 | `AUTH_FORBIDDEN` | Not AM |
| 409 | `TENANT_LEGAL_NAME_CONFLICT` | Duplicate legalName |
| 422 | `VALIDATION_ERROR` | Invalid payload |

---

### 4.2 `GET /v1/tenants`

**Auth:** Bearer token
**Roles:** AM, OP

**Query params:**

| Param | Type | Default | Rule |
|---|---|---|---|
| page | number | 1 | min 1 |
| pageSize | number | 20 | min 1, max 100 |
| sortBy | string | "name" | name, legalName, status, createdAt |
| sortOrder | string | "asc" | asc, desc |
| status | string | — | ACTIVE, INACTIVE, PENDING |
| search | string | — | searches name and legalName |

**Success response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Sunrise Real Estate",
      "legalName": "Sunrise Real Estate Pty Ltd",
      "status": "ACTIVE",
      "timezone": "Australia/Sydney",
      "currency": "AUD",
      "createdAt": "2026-03-15T09:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 403 | `AUTH_FORBIDDEN` | Not AM or OP |

---

### 4.3 `GET /v1/tenants/:tenantId`

**Auth:** Bearer token
**Roles:** AM, OP (any); CL_ADMIN, CL_USER (own tenant only)

**Path params:**

| Param | Type | Rule |
|---|---|---|
| tenantId | string | UUID |

**Success response (200):** Full tenant object including settings.

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 403 | `AUTH_FORBIDDEN` | CL accessing wrong tenant |
| 404 | `TENANT_NOT_FOUND` | Not found |

---

### 4.4 `PATCH /v1/tenants/:tenantId`

**Auth:** Bearer token
**Roles:** AM (all fields); CL_ADMIN (name, settings subset)

**Request body:** Partial tenant update (all fields optional).

**Success response (200):** Updated full tenant object.

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 403 | `AUTH_FORBIDDEN` | Wrong role or cross-tenant |
| 404 | `TENANT_NOT_FOUND` | Not found |
| 409 | `TENANT_LEGAL_NAME_CONFLICT` | Duplicate legalName |
| 422 | `VALIDATION_ERROR` | Invalid payload |

---

### 4.5 `POST /v1/tenants/:tenantId/deactivate`

**Auth:** Bearer token
**Roles:** AM only

**Request body:**

```json
{
  "reason": "Client contract terminated"
}
```

**Success response (200):** Updated tenant object with `status: "INACTIVE"`.

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 403 | `AUTH_FORBIDDEN` | Not AM |
| 404 | `TENANT_NOT_FOUND` | Not found |
| 409 | `TENANT_ALREADY_INACTIVE` | Already inactive |
| 409 | `TENANT_HAS_OPEN_APPOINTMENTS` | Has open appointments |
| 422 | `VALIDATION_ERROR` | Reason missing |

---

### 4.6 `POST /v1/tenants/:tenantId/branches`

**Auth:** Bearer token
**Roles:** AM (any tenant), CL_ADMIN (own tenant)

**Request body:**

```json
{
  "name": "CBD Branch",
  "address": {
    "street": "100 George St",
    "suburb": "Sydney",
    "postcode": "2000",
    "state": "NSW",
    "country": "AU"
  }
}
```

**Success response (201):** Created branch object.

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 403 | `AUTH_FORBIDDEN` | Wrong role or cross-tenant |
| 404 | `TENANT_NOT_FOUND` | Tenant not found |
| 409 | `BRANCH_NAME_CONFLICT` | Duplicate name in tenant |
| 422 | `VALIDATION_ERROR` | Invalid payload |

---

### 4.7 `GET /v1/tenants/:tenantId/branches`

**Auth:** Bearer token
**Roles:** AM, OP (any tenant); CL_ADMIN, CL_USER (own tenant)

**Query params:** page, pageSize, sortBy, sortOrder, status, search

**Success response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "tenantId": "uuid",
      "name": "CBD Branch",
      "address": { ... },
      "status": "ACTIVE",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "meta": { "page": 1, "pageSize": 50, "total": 1, "totalPages": 1 }
}
```

---

### 4.8 `PATCH /v1/tenants/:tenantId/branches/:branchId`

**Auth:** Bearer token
**Roles:** AM (all fields); CL_ADMIN (name, address only)

**Request body:** Partial branch update.

**Success response (200):** Updated branch object.

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 403 | `AUTH_FORBIDDEN` | Wrong role or cross-tenant |
| 404 | `BRANCH_NOT_FOUND` | Not found or wrong tenant |
| 409 | `BRANCH_NAME_CONFLICT` | Duplicate name |
| 422 | `VALIDATION_ERROR` | Invalid payload |

---

### 4.9 `POST /v1/tenants/:tenantId/branches/:branchId/deactivate`

**Auth:** Bearer token
**Roles:** AM only

**Request body:**

```json
{
  "reason": "Office closed permanently"
}
```

**Success response (200):** Updated branch with `status: "INACTIVE"`.

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 403 | `AUTH_FORBIDDEN` | Not AM |
| 404 | `BRANCH_NOT_FOUND` | Not found |
| 409 | `BRANCH_ALREADY_INACTIVE` | Already inactive |
| 409 | `BRANCH_HAS_OPEN_APPOINTMENTS` | Has open appointments |
| 422 | `VALIDATION_ERROR` | Reason missing |

---

## 5. Business Rules

1. **Tenant isolation:** Every repository query for business entities must include `tenant_id` as a filter. No cross-tenant data leakage is permitted.
2. **AM is tenant-free:** Users with role AM have `tenant_id = null` in the JWT. They can access all tenants. This is not an exception — it is the designed behavior.
3. **OP is tenant-free:** Same as AM regarding tenant_id, but OP has read-mostly access to tenants (cannot create or deactivate).
4. **PENDING status:** Newly created tenants start as `PENDING`. An AM must explicitly set them to `ACTIVE` before CL users can operate. This prevents misconfigured tenants from going live accidentally.
5. **Tenant deactivation requires no open appointments:** Before setting a tenant to `INACTIVE`, the system must verify there are no appointments in status `DRAFT`, `AWAITING_INSPECTOR`, or `SCHEDULED` for that tenant. An AM cannot bypass this rule via the API.
6. **Branch deactivation requires no open appointments:** Same rule applies at branch level. Open appointments must be resolved (cancelled, completed, or moved to another branch) first.
7. **Soft delete behavior:** Soft-deleted tenants (`deleted_at IS NOT NULL`) are excluded from all queries by default. Their `id` is retained for referential integrity of historical records (appointments, audit logs, etc.).
8. **Legal name uniqueness:** `legal_name` must be globally unique across all tenants (including INACTIVE). If a tenant is deactivated, their legal_name cannot be reused without AM explicitly removing the old tenant via hard delete (not exposed in API; database-level operation only).
9. **Settings deep merge:** When updating `settings_json`, the application must deep-merge the incoming settings with the existing ones. A `PATCH` with `settings: { billingPeriod: "WEEKLY" }` must not reset other settings fields.
10. **CL_ADMIN settings scope:** CL_ADMIN can update: `name`, `settings.logoUrl`, `settings.primaryColor`, `settings.notificationFromName`, `settings.notificationFromEmail`, `settings.smsFromName`, and email template overrides. CL_ADMIN cannot update: `legalName`, `timezone`, `currency`, `status`, billing configuration, or permission flags.
11. **Branch name uniqueness per tenant:** Branch names must be unique within a single tenant (case-insensitive). The same name can exist in different tenants.
12. **Branch status via deactivate endpoint:** The `status` field of a branch is only changed via the explicit deactivate endpoint (not via PATCH). Reactivation is done via PATCH `{ status: "ACTIVE" }` by AM only.
13. **Inactive tenant → users cannot log in:** When a tenant is deactivated, the auth middleware must check `tenant.status` during JWT validation. If tenant is `INACTIVE`, requests from CL users of that tenant are rejected with `AUTH_TENANT_INACTIVE`. AM and OP are unaffected.
14. **Branch count per tenant:** No hard limit on number of branches per tenant. Practical limits enforced by platform-level rate limits on creation.
15. **`settings_json` validation:** The `settings_json` column stores arbitrary JSON but the application layer must validate the structure against the `TenantSettings` interface on write. Unknown fields in settings are silently ignored (not rejected).
16. **Billing period consistency:** If `billingPeriod = "WEEKLY"` or `"BIWEEKLY"`, `billingDayOfWeek` must be provided. If `billingPeriod = "MONTHLY"`, `billingDayOfMonth` must be provided. The application enforces this cross-field validation.
17. **Audit trail mandatory:** Every tenant and branch modification (create, update, deactivate) must produce an audit log record including `before_json` and `after_json`. Reads are not audited.

---

## 6. Authorization Matrix

| Action | AM | OP | CL_ADMIN | CL_USER | INSP |
|---|---|---|---|---|---|
| createTenant | Yes | No | No | No | No |
| listTenants | Yes | Yes | No | No | No |
| getTenant (any) | Yes | Yes | No | No | No |
| getTenant (own) | Yes | Yes | Yes | Yes | No |
| updateTenant (any) | Yes | No | No | No | No |
| updateTenant (own, limited) | Yes | No | Yes | No | No |
| deactivateTenant | Yes | No | No | No | No |
| createBranch (any tenant) | Yes | No | No | No | No |
| createBranch (own tenant) | Yes | No | Yes | No | No |
| listBranches (any tenant) | Yes | Yes | No | No | No |
| listBranches (own tenant) | Yes | Yes | Yes | Yes | No |
| getBranch (any) | Yes | Yes | No | No | No |
| getBranch (own) | Yes | Yes | Yes | Yes | No |
| updateBranch (any) | Yes | No | No | No | No |
| updateBranch (own, limited) | Yes | No | Yes | No | No |
| deactivateBranch | Yes | No | No | No | No |

---

## 7. Domain Events

### `tenant.created.v1`

```typescript
{
  eventType: "tenant.created.v1",
  occurredAt: string,
  payload: {
    tenantId: string,
    name: string,
    legalName: string,
    createdByUserId: string,
  }
}
```

**Consumers:** Audit log service

---

### `tenant.updated.v1`

```typescript
{
  eventType: "tenant.updated.v1",
  occurredAt: string,
  payload: {
    tenantId: string,
    changedFields: string[],
    updatedByUserId: string,
  }
}
```

**Consumers:** Audit log service

---

### `tenant.deactivated.v1`

```typescript
{
  eventType: "tenant.deactivated.v1",
  occurredAt: string,
  payload: {
    tenantId: string,
    reason: string,
    deactivatedByUserId: string,
  }
}
```

**Consumers:** Audit log service, notification service (optional: notify tenant admin)

---

### `branch.created.v1`

```typescript
{
  eventType: "branch.created.v1",
  occurredAt: string,
  payload: {
    branchId: string,
    tenantId: string,
    name: string,
    createdByUserId: string,
  }
}
```

**Consumers:** Audit log service

---

### `branch.updated.v1`

```typescript
{
  eventType: "branch.updated.v1",
  occurredAt: string,
  payload: {
    branchId: string,
    tenantId: string,
    changedFields: string[],
    updatedByUserId: string,
  }
}
```

**Consumers:** Audit log service

---

### `branch.deactivated.v1`

```typescript
{
  eventType: "branch.deactivated.v1",
  occurredAt: string,
  payload: {
    branchId: string,
    tenantId: string,
    reason: string,
    deactivatedByUserId: string,
  }
}
```

**Consumers:** Audit log service

---

## 8. Queue Jobs

No async queue jobs are required for the tenant module. All operations are synchronous. If a future need arises (e.g., bulk deactivation of users when a tenant is deactivated), a job would be added to the `tenant` domain worker.

---

## 9. External Integrations

None directly. The tenant module is purely internal. Notification configuration stored in `settings_json` is consumed by the Notification module when sending emails/SMS.

---

## 10. Test Scenarios

### 10.1 Unit Tests (Use Cases)

#### CreateTenantUseCase

- [ ] Should create tenant with PENDING status when AM creates it
- [ ] Should return `AUTH_FORBIDDEN` when non-AM creates a tenant
- [ ] Should return `TENANT_LEGAL_NAME_CONFLICT` when legalName is already used
- [ ] Should default timezone to "Australia/Sydney" when not provided
- [ ] Should default currency to "AUD" when not provided
- [ ] Should deep-merge settings_json with defaults
- [ ] Should emit `tenant.created.v1` event
- [ ] Should write audit log on create

#### UpdateTenantUseCase

- [ ] AM should be able to update all fields including legalName and status
- [ ] CL_ADMIN should be able to update name and allowed settings fields
- [ ] CL_ADMIN should receive `AUTH_FORBIDDEN` when trying to change legalName
- [ ] CL_ADMIN should receive `AUTH_FORBIDDEN` when trying to change status
- [ ] CL_ADMIN from a different tenant should receive `AUTH_FORBIDDEN`
- [ ] Should deep-merge settings, not replace entirely
- [ ] Should return `TENANT_LEGAL_NAME_CONFLICT` on duplicate legalName
- [ ] Should write audit log with before_json and after_json

#### DeactivateTenantUseCase

- [ ] AM should successfully deactivate a tenant with no open appointments
- [ ] Should return `AUTH_FORBIDDEN` when non-AM calls this
- [ ] Should return `TENANT_HAS_OPEN_APPOINTMENTS` when open appointments exist
- [ ] Should return `TENANT_ALREADY_INACTIVE` when already inactive

#### CreateBranchUseCase

- [ ] AM should create branch in any tenant
- [ ] CL_ADMIN should create branch in own tenant
- [ ] CL_ADMIN should receive `AUTH_FORBIDDEN` for a different tenant
- [ ] Should return `BRANCH_NAME_CONFLICT` on duplicate name within tenant
- [ ] Same branch name in a different tenant should be allowed
- [ ] Should return `TENANT_INACTIVE` if tenant is not ACTIVE

#### DeactivateBranchUseCase

- [ ] Should deactivate branch with no open appointments
- [ ] Should return `BRANCH_HAS_OPEN_APPOINTMENTS` when open appointments exist
- [ ] Should return `AUTH_FORBIDDEN` for non-AM

### 10.2 Integration Tests (API + DB)

- [ ] `POST /v1/tenants` → 201 as AM
- [ ] `POST /v1/tenants` → 403 as OP
- [ ] `GET /v1/tenants` → 200 as AM, paginated list
- [ ] `GET /v1/tenants` → 403 as CL_ADMIN
- [ ] `GET /v1/tenants/:id` → 200 as CL_ADMIN for own tenant
- [ ] `GET /v1/tenants/:id` → 403 as CL_ADMIN for foreign tenant
- [ ] `PATCH /v1/tenants/:id` → 200 as AM with legalName change
- [ ] `PATCH /v1/tenants/:id` → 200 as CL_ADMIN with allowed field
- [ ] `PATCH /v1/tenants/:id` → 403 as CL_ADMIN for legalName field
- [ ] `POST /v1/tenants/:id/deactivate` → 409 when open appointments exist
- [ ] `POST /v1/tenants/:tenantId/branches` → 201 as CL_ADMIN
- [ ] `POST /v1/tenants/:tenantId/branches` → 409 on duplicate branch name
- [ ] `GET /v1/tenants/:tenantId/branches` → 200 with pagination
- [ ] `POST /v1/tenants/:tenantId/branches/:branchId/deactivate` → 409 with open appointments

### 10.3 Edge Cases

- [ ] Creating tenant with legalName differing only in whitespace/casing should be blocked
- [ ] Settings deep merge: PATCH with `{ settings: { billingPeriod: "WEEKLY" } }` should not reset logoUrl
- [ ] Pagination with `pageSize=100` returns at most 100 records
- [ ] `search` query with special SQL characters (%, _) should be safely escaped
- [ ] Simultaneous branch name conflict check (race condition): last-write wins is acceptable but both should not be created with the same name (use DB unique constraint as safety net)
- [ ] Updating branch with same name as current should not trigger name conflict error

### 10.4 Security / Multi-Tenant Scenarios

- [ ] CL_ADMIN from tenant A cannot GET, PATCH, or list resources of tenant B (even with valid JWT)
- [ ] JWT with tenant_id claim that exists but is INACTIVE: CL user requests should be rejected with `AUTH_TENANT_INACTIVE`
- [ ] AM with tenant_id=null in JWT should access all tenants without restriction
- [ ] OP with tenant_id=null may access read and mutation endpoints across tenants per CLAUDE.md §6 / `specs/DECISIONS.md` DEC-003 (cross-tenant operator). Superseded phrasing: "OP with tenant_id=null should only access read endpoints".
- [ ] Soft-deleted tenant: GET by id returns 404, not the deleted record
- [ ] All audit log entries for tenant operations must include tenant_id, actor_id, before_json, after_json
- [ ] Creating a branch for a tenant the CL_ADMIN does not belong to returns 403, not a DB constraint error
