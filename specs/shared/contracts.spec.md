# Shared Contracts — Implementation Spec

**Package:** `packages/shared/`
**Version:** 1.0
**Status:** Ready for implementation
**Last updated:** 2026-03-15

This document is self-contained. A developer can implement the entire `packages/shared` package from this spec alone without consulting any other documentation.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Data Model](#2-data-model)
3. [Use Cases](#3-use-cases)
4. [API Contracts](#4-api-contracts)
5. [Business Rules](#5-business-rules)
6. [Authorization Matrix](#6-authorization-matrix)
7. [Domain Events](#7-domain-events)
8. [Queue Jobs](#8-queue-jobs)
9. [External Integrations](#9-external-integrations)
10. [Test Scenarios](#10-test-scenarios)

---

## 1. Overview

`packages/shared` is the single source of truth for all types, enums, and Zod schemas that are consumed by both the backend (`apps/backend`) and frontend (`apps/web`, `apps/pwa`). Nothing business-logic-specific lives here — this package is a pure data contract layer.

**Key responsibilities:**

- Define all shared enumerations used across the platform
- Provide Zod schemas for API request/response validation
- Provide TypeScript types inferred from Zod schemas
- Provide generic API response type helpers (`PaginatedResponse<T>`, `ErrorResponse`)

**Constraints:**

- `packages/shared` MUST have zero runtime dependencies on `apps/backend`, `apps/web`, or `apps/pwa`.
- `packages/shared` may depend on `zod` only (and `typescript` as a dev dependency).
- All exports must be re-exported from `packages/shared/src/index.ts` for clean imports.
- This package is compiled to both ESM and CJS targets for compatibility.

**Package configuration:**

```
packages/shared/
├── src/
│   ├── enums/
│   │   ├── appointment.ts
│   │   ├── user.ts
│   │   ├── notification.ts
│   │   ├── financial.ts
│   │   ├── service-group.ts
│   │   ├── property.ts
│   │   └── index.ts
│   ├── schemas/
│   │   ├── pagination.ts
│   │   ├── address.ts
│   │   ├── contact.ts
│   │   ├── restriction.ts
│   │   ├── appointment.ts
│   │   ├── auth.ts
│   │   ├── property.ts
│   │   ├── tenant.ts
│   │   ├── service-group.ts
│   │   ├── notification.ts
│   │   └── index.ts
│   ├── types/
│   │   ├── api.ts
│   │   ├── appointment.ts
│   │   ├── auth.ts
│   │   └── index.ts
│   └── index.ts
├── package.json
├── tsconfig.json
└── tsconfig.build.json
```

---

## 2. Data Model

### 2.1 package.json

```json
{
  "name": "@properfy/shared",
  "version": "0.1.0",
  "description": "Shared types, enums, and Zod schemas for Properfy",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup src/index.ts --format esm,cjs --dts",
    "dev": "tsup src/index.ts --format esm,cjs --dts --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint src"
  },
  "peerDependencies": {
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "tsup": "^8.0.0",
    "vitest": "^1.0.0"
  }
}
```

### 2.2 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

---

## 3. Use Cases

Not applicable — this package is a pure library with no runtime use cases. All exported symbols are consumed by other packages.

---

## 4. API Contracts

### 4.1 Enums

All enums are exported as both TypeScript `const` objects (for runtime use) and TypeScript `type` unions.

#### 4.1.1 AppointmentStatus

**File:** `src/enums/appointment.ts`

```typescript
/**
 * The lifecycle status of an appointment (inspection).
 *
 * DRAFT            - Created but not yet released for operations.
 * AWAITING_INSPECTOR - Published and available for inspector acceptance. Alias: OPEN.
 * SCHEDULED        - Accepted by an inspector; programmed for execution.
 * DONE             - Inspection executed and finalized.
 * CANCELLED        - Cancelled (requires reason).
 * REJECTED         - Invalid or impossible to execute (requires reason).
 */
export const AppointmentStatus = {
  DRAFT: 'DRAFT',
  AWAITING_INSPECTOR: 'AWAITING_INSPECTOR',
  SCHEDULED: 'SCHEDULED',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
} as const;

export type AppointmentStatus = (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

/** Historical alias — maps to AWAITING_INSPECTOR */
export const APPOINTMENT_STATUS_OPEN_ALIAS = AppointmentStatus.AWAITING_INSPECTOR;
```

#### 4.1.2 TenantConfirmationStatus

**File:** `src/enums/appointment.ts`

```typescript
/**
 * Whether the property tenant (inquilino) has confirmed the inspection.
 *
 * PENDING     - Notification sent; awaiting response.
 * CONFIRMED   - Tenant confirmed the inspection.
 * UNAVAILABLE - Tenant declared unavailability.
 * NO_RESPONSE - Communication window elapsed with no response.
 */
export const TenantConfirmationStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  UNAVAILABLE: 'UNAVAILABLE',
  NO_RESPONSE: 'NO_RESPONSE',
} as const;

export type TenantConfirmationStatus = (typeof TenantConfirmationStatus)[keyof typeof TenantConfirmationStatus];
```

#### 4.1.3 UserRole

**File:** `src/enums/user.ts`

```typescript
/**
 * Platform roles controlling access and permissions.
 *
 * AM       - Admin Master: platform-wide, all tenants.
 * OP       - Operator: cross-tenant operational team.
 * CL_ADMIN - Client Admin: agency admin, scoped to own tenant.
 * CL_USER  - Client User: agency user, scoped to own tenant with configurable permissions.
 * INSP     - Inspector: own schedule and assignments only.
 * TNT      - Tenant (Inquilino): portal access via unique link only.
 */
export const UserRole = {
  AM: 'AM',
  OP: 'OP',
  CL_ADMIN: 'CL_ADMIN',
  CL_USER: 'CL_USER',
  INSP: 'INSP',
  TNT: 'TNT',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];
```

#### 4.1.4 UserStatus

**File:** `src/enums/user.ts`

```typescript
/**
 * ACTIVE   - User can authenticate and perform actions.
 * INACTIVE - User is disabled; cannot authenticate.
 * LOCKED   - User is temporarily locked (e.g., after failed login attempts).
 */
export const UserStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  LOCKED: 'LOCKED',
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];
```

#### 4.1.5 NotificationChannel

**File:** `src/enums/notification.ts`

```typescript
/**
 * EMAIL    - Transactional email via Resend.
 * SMS      - SMS via Twilio (primary) or Zenvia (fallback).
 * WHATSAPP - WhatsApp messaging via Twilio.
 */
export const NotificationChannel = {
  EMAIL: 'EMAIL',
  SMS: 'SMS',
  WHATSAPP: 'WHATSAPP',
} as const;

export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel];
```

#### 4.1.6 NotificationStatus

**File:** `src/enums/notification.ts`

```typescript
/**
 * PENDING   - Queued for sending; not yet dispatched to provider.
 * SENT      - Accepted by the external provider; delivery not confirmed.
 * DELIVERED - Confirmed delivered to recipient (via provider webhook).
 * FAILED    - All retry attempts exhausted; moved to DLQ.
 */
export const NotificationStatus = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
} as const;

export type NotificationStatus = (typeof NotificationStatus)[keyof typeof NotificationStatus];
```

#### 4.1.7 FinancialEntryType

**File:** `src/enums/financial.ts`

```typescript
/**
 * TENANT_DEBIT      - Charge to the real estate agency (tenant) for a completed inspection.
 * INSPECTOR_PAYOUT  - Payment owed to the inspector for a completed inspection.
 * REFUND            - Reversal when a service was marked DONE but not actually executed.
 * MANUAL_ADJUSTMENT - Manual correction by AM or OP.
 */
export const FinancialEntryType = {
  TENANT_DEBIT: 'TENANT_DEBIT',
  INSPECTOR_PAYOUT: 'INSPECTOR_PAYOUT',
  REFUND: 'REFUND',
  MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT',
} as const;

export type FinancialEntryType = (typeof FinancialEntryType)[keyof typeof FinancialEntryType];
```

#### 4.1.8 FinancialEntryStatus

**File:** `src/enums/financial.ts`

```typescript
/**
 * PENDING   - Entry created but not yet approved.
 * APPROVED  - Approved by operator cross-check; included in invoicing.
 * CANCELLED - Entry voided (e.g., after refund or correction).
 */
export const FinancialEntryStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  CANCELLED: 'CANCELLED',
} as const;

export type FinancialEntryStatus = (typeof FinancialEntryStatus)[keyof typeof FinancialEntryStatus];
```

#### 4.1.9 ServiceGroupStatus

**File:** `src/enums/service-group.ts`

```typescript
/**
 * DRAFT     - Group created but not yet visible in the marketplace.
 * PUBLISHED - Group is visible to eligible inspectors in the marketplace.
 * ACCEPTED  - An inspector accepted the group; all appointments are SCHEDULED.
 * CANCELLED - Group was cancelled; appointments return to AWAITING_INSPECTOR.
 */
export const ServiceGroupStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ACCEPTED: 'ACCEPTED',
  CANCELLED: 'CANCELLED',
} as const;

export type ServiceGroupStatus = (typeof ServiceGroupStatus)[keyof typeof ServiceGroupStatus];
```

#### 4.1.10 PriorityMode

**File:** `src/enums/service-group.ts`

```typescript
/**
 * STANDARD    - Standard marketplace offer; no expiry.
 * PRIORITY_24H - Urgent offer with a 24-hour acceptance window (configurable per tenant).
 */
export const PriorityMode = {
  STANDARD: 'STANDARD',
  PRIORITY_24H: 'PRIORITY_24H',
} as const;

export type PriorityMode = (typeof PriorityMode)[keyof typeof PriorityMode];
```

#### 4.1.11 InspectorInvoiceStatus

**File:** `src/enums/financial.ts`

```typescript
/**
 * OPEN   - Invoice period is active; entries are still being accumulated.
 * CLOSED - Period closed; invoice is ready for payment.
 * PAID   - Payment has been confirmed and recorded.
 */
export const InspectorInvoiceStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  PAID: 'PAID',
} as const;

export type InspectorInvoiceStatus = (typeof InspectorInvoiceStatus)[keyof typeof InspectorInvoiceStatus];
```

#### 4.1.12 TenantPortalTokenStatus

**File:** `src/enums/appointment.ts`

```typescript
/**
 * ACTIVE  - Token is valid and can be used to access the tenant portal.
 * EXPIRED - Token has passed its expiry time (7:00 PM day before inspection).
 *           Portal is read-only once expired.
 * REVOKED - Token was explicitly revoked (e.g., appointment cancelled).
 */
export const TenantPortalTokenStatus = {
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
} as const;

export type TenantPortalTokenStatus = (typeof TenantPortalTokenStatus)[keyof typeof TenantPortalTokenStatus];
```

#### 4.1.13 PropertyType

**File:** `src/enums/property.ts`

```typescript
/**
 * RESIDENTIAL - Residential dwelling (house, apartment, unit).
 * COMMERCIAL  - Commercial premises (office, shop, warehouse).
 * INDUSTRIAL  - Industrial/warehouse properties.
 * RURAL       - Rural/agricultural properties.
 */
export const PropertyType = {
  RESIDENTIAL: 'RESIDENTIAL',
  COMMERCIAL: 'COMMERCIAL',
  INDUSTRIAL: 'INDUSTRIAL',
  RURAL: 'RURAL',
} as const;

export type PropertyType = (typeof PropertyType)[keyof typeof PropertyType];
```

#### 4.1.14 RestrictionSource

**File:** `src/enums/appointment.ts`

```typescript
/**
 * Records who set the appointment restriction.
 *
 * TENANT_PORTAL - Tenant submitted restrictions via their portal link.
 * OPERATOR      - Restriction manually recorded by OP or AM.
 * IMPORT        - Restriction imported from a spreadsheet upload.
 */
export const RestrictionSource = {
  TENANT_PORTAL: 'TENANT_PORTAL',
  OPERATOR: 'OPERATOR',
  IMPORT: 'IMPORT',
} as const;

export type RestrictionSource = (typeof RestrictionSource)[keyof typeof RestrictionSource];
```

#### 4.1.15 BillingPeriod

**File:** `src/enums/financial.ts`

```typescript
/**
 * The closing/invoicing period for financial entries.
 * Configurable per client and per inspector.
 *
 * WEEKLY    - Closes every 7 days.
 * BIWEEKLY  - Closes every 14 days.
 * MONTHLY   - Closes at end of calendar month.
 */
export const BillingPeriod = {
  WEEKLY: 'WEEKLY',
  BIWEEKLY: 'BIWEEKLY',
  MONTHLY: 'MONTHLY',
} as const;

export type BillingPeriod = (typeof BillingPeriod)[keyof typeof BillingPeriod];
```

#### 4.1.16 Enums index

**File:** `src/enums/index.ts`

```typescript
export * from './appointment';
export * from './user';
export * from './notification';
export * from './financial';
export * from './service-group';
export * from './property';
```

---

### 4.2 API Response Types

**File:** `src/types/api.ts`

```typescript
/**
 * Standard paginated response wrapper for list endpoints.
 * Used by all GET /v1/* list endpoints.
 *
 * @example
 * GET /v1/appointments → PaginatedResponse<AppointmentSummary>
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Standard error response envelope for all error responses.
 * HTTP status code is set in the response; this is the body shape.
 *
 * @example
 * HTTP 422
 * {
 *   "error": {
 *     "code": "APPOINTMENT_INVALID_STATUS",
 *     "message": "Appointment must be in AWAITING_INSPECTOR status",
 *     "details": { "currentStatus": "SCHEDULED" }
 *   }
 * }
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * JWT claims included in Properfy access tokens (RS256).
 * Decoded on the backend; used for authorization.
 */
export interface JwtPayload {
  sub: string;          // user or inspector ID
  tenantId: string | null;  // null for AM and OP (platform-wide)
  role: UserRole;
  email: string;
  iat: number;
  exp: number;
  kid: string;          // key ID for RS256 rotation
}

/**
 * Auth context extracted from JWT by middleware.
 * Passed to all use cases as part of the command context.
 */
export interface AuthContext {
  actorId: string;
  tenantId: string | null;
  role: UserRole;
  requestId: string;
}
```

**File:** `src/types/index.ts`

```typescript
export * from './api';
export * from './appointment';
export * from './auth';
```

---

### 4.3 Zod Schemas

#### 4.3.1 Pagination Schema

**File:** `src/schemas/pagination.ts`

```typescript
import { z } from 'zod';

/**
 * Standard pagination query parameters for list endpoints.
 * Applied via query string: GET /v1/resource?page=1&pageSize=20&sortBy=created_at&sortOrder=desc
 */
export const PaginationSchema = z.object({
  page: z
    .coerce
    .number()
    .int()
    .min(1, { message: 'page must be at least 1' })
    .default(1),

  pageSize: z
    .coerce
    .number()
    .int()
    .min(1, { message: 'pageSize must be at least 1' })
    .max(100, { message: 'pageSize must not exceed 100' })
    .default(20),

  sortBy: z
    .string()
    .trim()
    .optional(),

  sortOrder: z
    .enum(['asc', 'desc'])
    .optional()
    .default('desc'),
});

export type PaginationParams = z.infer<typeof PaginationSchema>;
```

#### 4.3.2 Date Range Schema

**File:** `src/schemas/pagination.ts`

```typescript
/**
 * ISO date range for filtering list endpoints.
 * Both fields are ISO 8601 date strings: "YYYY-MM-DD"
 */
export const DateRangeSchema = z.object({
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'fromDate must be a date in YYYY-MM-DD format' })
    .optional(),

  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'toDate must be a date in YYYY-MM-DD format' })
    .optional(),
}).refine(
  (data) => {
    if (data.fromDate && data.toDate) {
      return data.fromDate <= data.toDate;
    }
    return true;
  },
  { message: 'fromDate must be before or equal to toDate', path: ['fromDate'] }
);

export type DateRangeParams = z.infer<typeof DateRangeSchema>;
```

#### 4.3.3 Address Schema

**File:** `src/schemas/address.ts`

```typescript
import { z } from 'zod';

/**
 * Physical address for properties.
 * Matches the Properfy import spreadsheet column structure.
 *
 * Required: street, suburb, postcode, state, country
 * Optional: addressLine2, latitude, longitude
 *
 * latitude/longitude are populated by the geocoding pipeline (Mapbox).
 */
export const AddressSchema = z.object({
  street: z
    .string()
    .trim()
    .min(1, { message: 'street is required' })
    .max(255),

  addressLine2: z
    .string()
    .trim()
    .max(255)
    .optional()
    .nullable(),

  suburb: z
    .string()
    .trim()
    .min(1, { message: 'suburb is required' })
    .max(100),

  postcode: z
    .string()
    .trim()
    .regex(/^\d{4}$/, { message: 'postcode must be a 4-digit Australian postcode' }),

  state: z
    .enum(['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'], {
      errorMap: () => ({ message: 'state must be a valid Australian state abbreviation' }),
    }),

  country: z
    .string()
    .trim()
    .min(2)
    .max(2)
    .toUpperCase()
    .default('AU'),

  latitude: z
    .number()
    .min(-90)
    .max(90)
    .optional()
    .nullable(),

  longitude: z
    .number()
    .min(-180)
    .max(180)
    .optional()
    .nullable(),
});

export type Address = z.infer<typeof AddressSchema>;

/**
 * Human-readable formatted address string.
 * Used for display in notifications and reports.
 */
export function formatAddress(address: Address): string {
  const parts = [
    address.street,
    address.addressLine2,
    `${address.suburb} ${address.state} ${address.postcode}`,
  ].filter(Boolean);
  return parts.join(', ');
}
```

#### 4.3.4 Contact Schema

**File:** `src/schemas/contact.ts`

```typescript
import { z } from 'zod';

/**
 * Contact information for the property tenant (inquilino).
 * Stored in appointment_contacts table.
 *
 * primaryEmail and primaryPhone are required for Routine Inspections.
 * For Ingoing/Outgoing, tenant contact is optional.
 */
export const ContactSchema = z.object({
  tenantName: z
    .string()
    .trim()
    .min(1, { message: 'tenantName is required' })
    .max(255),

  primaryEmail: z
    .string()
    .trim()
    .email({ message: 'primaryEmail must be a valid email address' })
    .max(255),

  primaryPhone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s\-().]{7,20}$/, { message: 'primaryPhone must be a valid phone number' }),

  secondaryEmail: z
    .string()
    .trim()
    .email({ message: 'secondaryEmail must be a valid email address' })
    .max(255)
    .optional()
    .nullable(),

  secondaryPhone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s\-().]{7,20}$/, { message: 'secondaryPhone must be a valid phone number' })
    .optional()
    .nullable(),
});

export type Contact = z.infer<typeof ContactSchema>;

/**
 * Partial contact for updates (e.g., tenant updating own contact via portal).
 * All fields optional.
 */
export const ContactUpdateSchema = ContactSchema.partial().omit({ tenantName: true });
export type ContactUpdate = z.infer<typeof ContactUpdateSchema>;
```

#### 4.3.5 Restriction Schema

**File:** `src/schemas/restriction.ts`

```typescript
import { z } from 'zod';

/**
 * Day-of-week values (0 = Sunday, 6 = Saturday) matching JS Date.getDay().
 */
export const DayOfWeekSchema = z.union([
  z.literal(0), // Sunday
  z.literal(1), // Monday
  z.literal(2), // Tuesday
  z.literal(3), // Wednesday
  z.literal(4), // Thursday
  z.literal(5), // Friday
  z.literal(6), // Saturday
]);

export type DayOfWeek = z.infer<typeof DayOfWeekSchema>;

/**
 * Time window: 24-hour format "HH:mm"
 */
export const TimeStringSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, { message: 'time must be in HH:mm format (24-hour)' });

/**
 * Operational restrictions and preferences for an inspection.
 * Submitted by the tenant via the portal or by operators.
 *
 * No field is mandatory. The only mandatory action on the portal is
 * whether the tenant confirms, declares unavailability, or requests rescheduling.
 *
 * unavailableDays: array of day-of-week numbers (0–6) where tenant cannot receive inspection.
 * unavailableHours: array of time windows (e.g. [{from: "08:00", to: "10:00"}]) to exclude.
 */
export const UnavailableHourRangeSchema = z.object({
  from: TimeStringSchema,
  to: TimeStringSchema,
}).refine(
  (data) => data.from < data.to,
  { message: 'unavailableHours: "from" must be before "to"', path: ['from'] }
);

export const RestrictionSchema = z.object({
  isHome: z
    .boolean()
    .optional()
    .nullable(),

  unavailableDays: z
    .array(DayOfWeekSchema)
    .max(7)
    .optional()
    .nullable(),

  unavailableHours: z
    .array(UnavailableHourRangeSchema)
    .max(24)
    .optional()
    .nullable(),

  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable(),
});

export type Restriction = z.infer<typeof RestrictionSchema>;
```

#### 4.3.6 Appointment Schemas

**File:** `src/schemas/appointment.ts`

```typescript
import { z } from 'zod';
import { AppointmentStatus, TenantConfirmationStatus } from '../enums/appointment';
import { AddressSchema } from './address';
import { ContactSchema, ContactUpdateSchema } from './contact';
import { RestrictionSchema } from './restriction';
import { PaginationSchema, DateRangeSchema } from './pagination';

/**
 * Schema for the scheduled time slot of an inspection.
 * Format: "HH:mm-HH:mm" (24-hour), e.g. "08:00-12:00"
 */
export const TimeSlotSchema = z
  .string()
  .regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/, {
    message: 'timeSlot must be in HH:mm-HH:mm format, e.g. "08:00-12:00"',
  });

/**
 * ISO date string YYYY-MM-DD
 */
export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  });

/**
 * Create appointment — POST /v1/appointments body.
 * Either propertyId (existing) or propertyData (new inline) must be provided.
 */
export const CreateAppointmentBodySchema = z.object({
  branchId: z.string().cuid({ message: 'branchId must be a valid CUID' }),

  propertyId: z
    .string()
    .cuid({ message: 'propertyId must be a valid CUID' })
    .optional(),

  propertyData: z
    .object({
      propertyCode: z.string().trim().max(100).optional(),
      type: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'RURAL']),
      address: AddressSchema,
      notes: z.string().trim().max(2000).optional(),
    })
    .optional(),

  serviceTypeId: z.string().cuid({ message: 'serviceTypeId must be a valid CUID' }),

  scheduledDate: IsoDateSchema,

  timeSlot: TimeSlotSchema,

  contact: ContactSchema,

  restrictions: RestrictionSchema.optional(),

  keyRequired: z.boolean().default(false),

  meetingLocation: z.string().trim().max(500).optional().nullable(),

  keyLocation: z.string().trim().max(500).optional().nullable(),

  notes: z.string().trim().max(2000).optional().nullable(),
}).refine(
  (data) => data.propertyId !== undefined || data.propertyData !== undefined,
  { message: 'Either propertyId or propertyData must be provided', path: ['propertyId'] }
);

export type CreateAppointmentBody = z.infer<typeof CreateAppointmentBodySchema>;

/**
 * Update appointment — PATCH /v1/appointments/:id body.
 * All fields optional.
 */
export const UpdateAppointmentBodySchema = z.object({
  scheduledDate: IsoDateSchema.optional(),
  timeSlot: TimeSlotSchema.optional(),
  contact: ContactUpdateSchema.optional(),
  restrictions: RestrictionSchema.optional(),
  keyRequired: z.boolean().optional(),
  meetingLocation: z.string().trim().max(500).optional().nullable(),
  keyLocation: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type UpdateAppointmentBody = z.infer<typeof UpdateAppointmentBodySchema>;

/**
 * Status transition — POST /v1/appointments/:id/status-transitions body.
 */
export const StatusTransitionBodySchema = z.object({
  targetStatus: z.nativeEnum(AppointmentStatus),
  reason: z.string().trim().min(1).max(1000).optional(),
});

export type StatusTransitionBody = z.infer<typeof StatusTransitionBodySchema>;

/**
 * Appointment list query parameters.
 */
export const ListAppointmentsQuerySchema = PaginationSchema
  .merge(DateRangeSchema)
  .extend({
    status: z.nativeEnum(AppointmentStatus).optional(),
    serviceTypeId: z.string().cuid().optional(),
    branchId: z.string().cuid().optional(),
    inspectorId: z.string().cuid().optional(),
    tenantId: z.string().cuid().optional(),
    search: z.string().trim().max(200).optional(),
    tenantConfirmationStatus: z.nativeEnum(TenantConfirmationStatus).optional(),
  });

export type ListAppointmentsQuery = z.infer<typeof ListAppointmentsQuerySchema>;
```

#### 4.3.7 Auth Schemas

**File:** `src/schemas/auth.ts`

```typescript
import { z } from 'zod';

/**
 * POST /v1/auth/login request body.
 */
export const LoginBodySchema = z.object({
  email: z
    .string()
    .trim()
    .email({ message: 'email must be a valid email address' })
    .toLowerCase(),

  password: z
    .string()
    .min(8, { message: 'password must be at least 8 characters' })
    .max(128),
});

export type LoginBody = z.infer<typeof LoginBodySchema>;

/**
 * POST /v1/auth/refresh request body.
 */
export const RefreshTokenBodySchema = z.object({
  refreshToken: z
    .string()
    .trim()
    .min(1, { message: 'refreshToken is required' }),
});

export type RefreshTokenBody = z.infer<typeof RefreshTokenBodySchema>;
```

#### 4.3.8 Property Schemas

**File:** `src/schemas/property.ts`

```typescript
import { z } from 'zod';
import { AddressSchema } from './address';
import { PaginationSchema } from './pagination';

/**
 * POST /v1/properties request body.
 */
export const CreatePropertyBodySchema = z.object({
  branchId: z.string().cuid(),

  propertyCode: z
    .string()
    .trim()
    .max(100)
    .optional(),

  type: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'RURAL']),

  address: AddressSchema,

  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable(),
});

export type CreatePropertyBody = z.infer<typeof CreatePropertyBodySchema>;

/**
 * PATCH /v1/properties/:propertyId request body.
 */
export const UpdatePropertyBodySchema = CreatePropertyBodySchema.partial().omit({ branchId: true });
export type UpdatePropertyBody = z.infer<typeof UpdatePropertyBodySchema>;

/**
 * GET /v1/properties query parameters.
 */
export const ListPropertiesQuerySchema = PaginationSchema.extend({
  branchId: z.string().cuid().optional(),
  type: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'RURAL']).optional(),
  search: z.string().trim().max(200).optional(),
});

export type ListPropertiesQuery = z.infer<typeof ListPropertiesQuerySchema>;
```

#### 4.3.9 Tenant Schemas

**File:** `src/schemas/tenant.ts`

```typescript
import { z } from 'zod';

/**
 * Tenant (real estate agency) settings stored as JSON.
 */
export const TenantSettingsSchema = z.object({
  priorityMode24hEnabled: z.boolean().default(false),
  billingPeriod: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']).default('MONTHLY'),
  timezone: z.string().default('Australia/Sydney'),
  currency: z.string().length(3).default('AUD'),
});

export type TenantSettings = z.infer<typeof TenantSettingsSchema>;

/**
 * POST /v1/tenants/:tenantId/users request body.
 */
export const CreateTenantUserBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email().toLowerCase(),
  phone: z.string().trim().optional(),
  role: z.enum(['CL_ADMIN', 'CL_USER']),
  branchId: z.string().cuid().optional().nullable(),
});

export type CreateTenantUserBody = z.infer<typeof CreateTenantUserBodySchema>;
```

#### 4.3.10 Service Group Schemas

**File:** `src/schemas/service-group.ts`

```typescript
import { z } from 'zod';
import { PaginationSchema, DateRangeSchema, IsoDateSchema, TimeSlotSchema } from './pagination';

// Re-export these from their canonical location for convenience
export { IsoDateSchema, TimeSlotSchema };

/**
 * POST /v1/service-groups request body.
 */
export const CreateServiceGroupBodySchema = z.object({
  appointmentIds: z
    .array(z.string().cuid())
    .min(5, { message: 'A service group must contain at least 5 appointments' })
    .max(25, { message: 'A service group must contain at most 25 appointments' }),

  serviceTypeId: z.string().cuid(),

  scheduledDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'scheduledDate must be YYYY-MM-DD' }),

  timeWindow: z
    .string()
    .regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/, { message: 'timeWindow must be HH:mm-HH:mm format' }),

  priorityMode: z.enum(['STANDARD', 'PRIORITY_24H']),
});

export type CreateServiceGroupBody = z.infer<typeof CreateServiceGroupBodySchema>;

/**
 * POST /v1/service-groups/:groupId/assign request body.
 */
export const AssignInspectorBodySchema = z.object({
  inspectorId: z.string().cuid(),
});

export type AssignInspectorBody = z.infer<typeof AssignInspectorBodySchema>;

/**
 * GET /v1/service-groups query parameters.
 */
export const ListServiceGroupsQuerySchema = PaginationSchema
  .merge(DateRangeSchema)
  .extend({
    tenantId: z.string().cuid().optional(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ACCEPTED', 'CANCELLED']).optional(),
    serviceTypeId: z.string().cuid().optional(),
    priorityMode: z.enum(['STANDARD', 'PRIORITY_24H']).optional(),
    scheduledDateFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    scheduledDateTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  });

export type ListServiceGroupsQuery = z.infer<typeof ListServiceGroupsQuerySchema>;
```

#### 4.3.11 Notification Schemas

**File:** `src/schemas/notification.ts`

```typescript
import { z } from 'zod';
import { PaginationSchema, DateRangeSchema } from './pagination';

export const NOTIFICATION_TEMPLATE_CODES = [
  'INSPECTION_NOTICE',
  'REMINDER_7_DAYS',
  'REMINDER_5_DAYS',
  'REMINDER_3_DAYS',
  'PROPERTY_MANAGER_ESCALATION',
  'TENANT_SMS_ALERT',
  'INSPECTION_CONFIRMED',
  'INSPECTION_RESCHEDULED',
  'INSPECTION_CANCELLED',
] as const;

export type NotificationTemplateCode = (typeof NOTIFICATION_TEMPLATE_CODES)[number];

/**
 * GET /v1/notifications query parameters.
 */
export const ListNotificationsQuerySchema = PaginationSchema
  .merge(DateRangeSchema)
  .extend({
    tenantId: z.string().cuid().optional(),
    appointmentId: z.string().cuid().optional(),
    channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP']).optional(),
    status: z.enum(['PENDING', 'SENT', 'DELIVERED', 'FAILED']).optional(),
    templateCode: z.enum(NOTIFICATION_TEMPLATE_CODES).optional(),
  });

export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuerySchema>;

/**
 * PUT /v1/notification-templates/:templateCode/:channel request body.
 */
export const UpsertTemplateBodySchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .optional(),

  bodyHtml: z
    .string()
    .trim()
    .min(1)
    .optional(),

  bodyText: z
    .string()
    .trim()
    .min(1, { message: 'bodyText is required' }),

  isActive: z.boolean(),
});

export type UpsertTemplateBody = z.infer<typeof UpsertTemplateBodySchema>;
```

#### 4.3.12 Schemas index

**File:** `src/schemas/index.ts`

```typescript
export * from './pagination';
export * from './address';
export * from './contact';
export * from './restriction';
export * from './appointment';
export * from './auth';
export * from './property';
export * from './tenant';
export * from './service-group';
export * from './notification';
```

---

### 4.4 Main index

**File:** `src/index.ts`

```typescript
// Enums
export * from './enums';

// Schemas
export * from './schemas';

// Types
export * from './types';
```

---

## 5. Business Rules

**BR-01 — Zod is the only runtime dependency.**
`packages/shared` must not import from any framework (Fastify, React, etc.) or application code. Only `zod` is permitted as a runtime dependency.

**BR-02 — All enums are `as const` objects, not TypeScript `enum` keyword.**
Using `as const` objects instead of `enum` ensures the values are plain strings at runtime, compatible with Prisma, Zod, and frontend code. Every `as const` object must have a companion `type` union derived via `typeof ... [keyof typeof ...]`.

**BR-03 — Zod schemas produce TypeScript types via `z.infer<>`.**
No duplicate type definitions. Every type must be inferred from its corresponding schema. Manual `interface` declarations for schema-validated types are forbidden.

**BR-04 — Enum values must match Prisma enum values exactly.**
The string values in `packages/shared` enums (`AppointmentStatus.DRAFT = 'DRAFT'`) must exactly match the Prisma schema enum values. This is the canonical source; Prisma migrations must align with this package.

**BR-05 — Address uses Australian-specific postcode and state validation.**
`postcode` must be exactly 4 digits (Australian standard). `state` must be one of the 8 Australian state/territory abbreviations. `country` defaults to `'AU'`.

**BR-06 — `PaginatedResponse<T>` is the only list response shape.**
All paginated API endpoints must return a response conforming to `PaginatedResponse<T>`. No custom list shapes are permitted.

**BR-07 — `ErrorResponse` is the only error response shape.**
All API error responses must conform to `ErrorResponse`. The `code` field must be a `SCREAMING_SNAKE_CASE` string. The `message` field must be human-readable. The `details` object is optional and module-specific.

**BR-08 — CUID format is used for all entity IDs.**
Schemas that reference entity IDs (e.g., `branchId`, `propertyId`) must use `.cuid()` Zod validation. This matches the Prisma `@default(cuid())` configuration.

**BR-09 — `ContactSchema` is not used for Ingoing/Outgoing inspections' required fields.**
The `ContactSchema` defines the shape but the application layer controls whether fields are required based on service type. The schema itself always validates the shape when values are provided.

**BR-10 — Template codes are a closed set.**
`NOTIFICATION_TEMPLATE_CODES` is an exhaustive tuple. No template codes outside this set are valid. Adding a new notification event type requires a PR to this package.

**BR-11 — Date strings use ISO 8601 `YYYY-MM-DD` format.**
`IsoDateSchema` enforces this format. Callers must not pass JavaScript `Date` objects or Unix timestamps to date fields — always convert to string first.

**BR-12 — Time slots and time windows use 24-hour `HH:mm-HH:mm` format.**
`TimeSlotSchema` and time window fields enforce this format. No AM/PM notation is accepted in schemas.

**BR-13 — `JwtPayload.tenantId` is nullable for platform-level roles.**
`AM` and `OP` may have `tenantId: null` in their JWT. This must be handled by all authorization middleware.

**BR-14 — `AuthContext` is the standard interface passed to all use cases.**
No use case may accept raw JWT fields individually. Always receive `AuthContext` as the auth parameter to ensure consistent authorization.

---

## 6. Authorization Matrix

Not applicable for this package — it contains only data contracts and has no authorization logic. Authorization is enforced in `apps/backend`.

---

## 7. Domain Events

Not applicable — this package does not emit or consume events. Event payload types are defined here as interfaces.

### 7.1 Shared Event Payload Types

**File:** `src/types/events.ts`

```typescript
import { AppointmentStatus } from '../enums/appointment';
import { NotificationChannel } from '../enums/notification';
import { PriorityMode } from '../enums/service-group';

/**
 * Base interface for all domain events.
 * All domain events must extend this interface.
 */
export interface DomainEvent<T = unknown> {
  eventType: string;
  eventId: string;      // uuid v4
  occurredAt: string;   // ISO 8601
  payload: T;
}

/**
 * Payload for appointment.status_changed.v1
 */
export interface AppointmentStatusChangedPayload {
  appointmentId: string;
  tenantId: string;
  previousStatus: AppointmentStatus;
  newStatus: AppointmentStatus;
  actorId: string;
  actorRole: string;
  reason: string | null;
  requestId: string;
}

/**
 * Payload for service_group.accepted.v1
 */
export interface ServiceGroupAcceptedPayload {
  groupId: string;
  tenantId: string;
  serviceTypeId: string;
  assignedInspectorId: string;
  assignmentType: 'MARKETPLACE' | 'MANUAL';
  scheduledDate: string;
  timeWindow: string;
  appointmentIds: string[];
  acceptedByActorId: string;
  acceptedByActorRole: string;
  requestId: string;
}

/**
 * Payload for notification.failed.v1
 */
export interface NotificationFailedPayload {
  notificationId: string;
  tenantId: string;
  appointmentId: string | null;
  channel: NotificationChannel;
  templateCode: string;
  recipient: string;
  failureReason: string;
  retryCount: number;
  requestId: string;
}
```

Update `src/types/index.ts` to export events:

```typescript
export * from './api';
export * from './appointment';
export * from './auth';
export * from './events';
```

---

## 8. Queue Jobs

Not applicable — this package defines only types. Queue job payload types are defined in the relevant module specs.

---

## 9. External Integrations

Not applicable — this package has no external integrations.

---

## 10. Test Scenarios

### 10.1 Unit Tests

Located at: `packages/shared/src/__tests__/`

**Enum correctness:**
```
[ ] AppointmentStatus has all 6 values: DRAFT, AWAITING_INSPECTOR, SCHEDULED, DONE, CANCELLED, REJECTED
[ ] UserRole has all 6 values: AM, OP, CL_ADMIN, CL_USER, INSP, TNT
[ ] NotificationChannel has all 3 values: EMAIL, SMS, WHATSAPP
[ ] NotificationStatus has all 4 values: PENDING, SENT, DELIVERED, FAILED
[ ] FinancialEntryType has all 4 values: TENANT_DEBIT, INSPECTOR_PAYOUT, REFUND, MANUAL_ADJUSTMENT
[ ] ServiceGroupStatus has all 4 values: DRAFT, PUBLISHED, ACCEPTED, CANCELLED
[ ] PriorityMode has both values: STANDARD, PRIORITY_24H
[ ] BillingPeriod has all 3 values: WEEKLY, BIWEEKLY, MONTHLY
[ ] PropertyType has all 4 values: RESIDENTIAL, COMMERCIAL, INDUSTRIAL, RURAL
[ ] RestrictionSource has all 3 values: TENANT_PORTAL, OPERATOR, IMPORT
[ ] TenantPortalTokenStatus has all 3 values: ACTIVE, EXPIRED, REVOKED
[ ] UserStatus has all 3 values: ACTIVE, INACTIVE, LOCKED
[ ] InspectorInvoiceStatus has all 3 values: OPEN, CLOSED, PAID
[ ] TenantConfirmationStatus has all 4 values: PENDING, CONFIRMED, UNAVAILABLE, NO_RESPONSE
[ ] Enum values are plain strings (not TypeScript enum numeric values)
```

**PaginationSchema:**
```
[ ] Parses valid input: { page: 1, pageSize: 20 }
[ ] Coerces string "1" to number 1 for page
[ ] Coerces string "20" to number 20 for pageSize
[ ] Rejects page = 0 (min 1)
[ ] Rejects pageSize = 0 (min 1)
[ ] Rejects pageSize = 101 (max 100)
[ ] Applies default page = 1 when omitted
[ ] Applies default pageSize = 20 when omitted
[ ] Applies default sortOrder = 'desc' when omitted
[ ] Rejects sortOrder = 'random'
```

**AddressSchema:**
```
[ ] Parses valid Australian address
[ ] Rejects postcode with 3 digits
[ ] Rejects postcode with 5 digits
[ ] Rejects postcode with letters
[ ] Rejects state = 'TX' (US state, not valid)
[ ] Accepts all 8 valid AU states: NSW, VIC, QLD, SA, WA, TAS, NT, ACT
[ ] Defaults country to 'AU' when omitted
[ ] Accepts null for latitude/longitude
[ ] Rejects latitude > 90
[ ] Rejects longitude > 180
[ ] Rejects empty string for street
[ ] Rejects empty string for suburb
```

**ContactSchema:**
```
[ ] Parses valid contact with all fields
[ ] Rejects invalid email for primaryEmail
[ ] Rejects invalid email for secondaryEmail
[ ] Accepts null for secondaryEmail and secondaryPhone
[ ] Accepts valid phone numbers in various formats
[ ] Rejects phone number shorter than 7 digits
```

**RestrictionSchema:**
```
[ ] Parses restriction with all fields null (all optional)
[ ] Rejects invalid day-of-week value (e.g. 7)
[ ] Rejects unavailableHours where from >= to
[ ] Parses valid time range { from: "08:00", to: "12:00" }
[ ] Rejects time strings not matching HH:mm
[ ] Accepts notes up to 1000 characters
[ ] Rejects notes exceeding 1000 characters
```

**DateRangeSchema:**
```
[ ] Parses valid date range: fromDate "2026-01-01", toDate "2026-12-31"
[ ] Rejects fromDate after toDate
[ ] Accepts fromDate without toDate
[ ] Accepts toDate without fromDate
[ ] Rejects non-date strings like "01/01/2026"
[ ] Rejects date in format "2026-1-1" (missing leading zeros)
```

**CreateServiceGroupBodySchema:**
```
[ ] Parses valid body with 5 appointmentIds
[ ] Parses valid body with 25 appointmentIds
[ ] Rejects body with 4 appointmentIds (min 5)
[ ] Rejects body with 26 appointmentIds (max 25)
[ ] Rejects invalid CUID in appointmentIds array
[ ] Rejects invalid timeWindow format (e.g. "8:00-12:00" — missing leading zero)
[ ] Rejects unknown priorityMode value
```

**StatusTransitionBodySchema:**
```
[ ] Parses all valid AppointmentStatus values as targetStatus
[ ] Rejects unknown status like "OPEN" (use AWAITING_INSPECTOR)
[ ] Accepts reason as optional string
[ ] Rejects empty string for reason when provided
```

**NOTIFICATION_TEMPLATE_CODES:**
```
[ ] Contains exactly 9 codes
[ ] Does not contain any unknown codes
[ ] UpsertTemplateBodySchema rejects unknown templateCode via path parameter validation
```

**formatAddress:**
```
[ ] Returns correct format: "123 Main St, Bondi NSW 2026"
[ ] Includes addressLine2 when present: "123 Main St, Unit 4, Bondi NSW 2026"
[ ] Omits addressLine2 when null or undefined
```

### 10.2 Type Safety Tests

These tests verify compile-time type correctness (run via `tsc --noEmit`):

```typescript
// Verify PaginatedResponse is correctly typed
const response: PaginatedResponse<{ id: string }> = {
  data: [{ id: 'cld1' }],
  meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
};

// Verify ErrorResponse structure
const error: ErrorResponse = {
  error: { code: 'NOT_FOUND', message: 'Not found' },
};

// Verify enum values are strings
const status: AppointmentStatus = AppointmentStatus.DRAFT;
// TypeScript must reject: const bad: AppointmentStatus = 'UNKNOWN';

// Verify inferred types from Zod schemas
type AddressType = z.infer<typeof AddressSchema>;
const addr: AddressType = {
  street: '123 Main St',
  suburb: 'Bondi',
  postcode: '2026',
  state: 'NSW',
  country: 'AU',
};
```

### 10.3 Edge Cases

```
[ ] z.coerce.number() handles "1.5" for page (rounds or rejects — verify expected behavior)
[ ] Empty appointmentIds array [] is rejected (min 5, not min 1)
[ ] Zod .nullable() vs .optional() — verify both null and undefined are handled correctly per field
[ ] LoginBodySchema .toLowerCase() transforms email to lowercase before validation
[ ] AddressSchema country .toUpperCase() transforms input to uppercase
[ ] RestrictionSchema with empty arrays [] for unavailableDays and unavailableHours — accepted (valid empty)
```

### 10.4 Build and Export Tests

```
[ ] `pnpm build` produces dist/index.js (ESM) and dist/index.cjs (CJS) and dist/index.d.ts
[ ] All enums are accessible via: import { AppointmentStatus } from '@properfy/shared'
[ ] All schemas are accessible via: import { AddressSchema } from '@properfy/shared'
[ ] All types are accessible via: import type { PaginatedResponse } from '@properfy/shared'
[ ] No circular dependency between files in src/
[ ] TypeScript strict mode passes: tsc --noEmit returns zero errors
```
