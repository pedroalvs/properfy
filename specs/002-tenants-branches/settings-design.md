# Settings Design: Rich Tenant Settings Schema

**Date**: 2026-04-07
**Status**: Approved
**Gap**: GAP-002 from `specs/002-tenants-branches/spec.md`

## Decision

Expand `tenantSettingsSchema` in `packages/shared/src/schemas/tenant.ts` to include all dossier-defined keys. Keep `.passthrough()` instead of `.strict()` to allow forward-compatible keys (like `clUserPermissions` that's already live). Add typed optional fields for each category.

## Full Settings Shape

```typescript
export const tenantSettingsSchema = z.object({
  // Billing
  billingPeriod: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']).default('MONTHLY'),
  billingDayOfWeek: z.number().int().min(0).max(6).optional(),
  billingDayOfMonth: z.number().int().min(1).max(28).optional(),

  // Notification sender
  notificationEmail: z.string().email().max(254).optional(),
  notificationFromName: z.string().max(100).optional(),
  notificationFromEmail: z.string().email().max(254).optional(),
  smsFromName: z.string().max(11).regex(/^[a-zA-Z0-9]+$/).optional(),

  // Branding
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),

  // Feature flags (tenant-level policy)
  allowClientCancellation: z.boolean().default(true),
  allowClientRescheduling: z.boolean().default(true),
  allowClientFinancialView: z.boolean().default(false),
  allowClientReportExport: z.boolean().default(false),
  allowClientUserManagement: z.boolean().default(false),

  // Inspector offer config
  priorityOfferHours: z.number().int().min(1).max(168).default(24),
  inspectorOfferRadiusKm: z.number().min(0).default(2),

  // CL_USER granular permissions
  clUserPermissions: z.array(z.enum([
    'create_appointments',
    'cancel_appointments',
    'reject_appointments',
    'reschedule_appointments',
    'force_confirmation',
    'create_properties',
    'export_reports',
  ])).default([]),

  // Email template overrides (per-event)
  emailTemplates: z.object({
    initial: z.object({ subject: z.string().optional(), headerText: z.string().optional(), footerText: z.string().optional(), signature: z.string().optional() }).optional(),
    reminder7d: z.object({ subject: z.string().optional(), headerText: z.string().optional() }).optional(),
    reminder5d: z.object({ subject: z.string().optional(), headerText: z.string().optional() }).optional(),
    reminder3d: z.object({ subject: z.string().optional(), headerText: z.string().optional() }).optional(),
    escalation: z.object({ subject: z.string().optional(), headerText: z.string().optional() }).optional(),
    confirmed: z.object({ subject: z.string().optional(), headerText: z.string().optional() }).optional(),
    rescheduled: z.object({ subject: z.string().optional(), headerText: z.string().optional() }).optional(),
    cancelled: z.object({ subject: z.string().optional(), headerText: z.string().optional() }).optional(),
  }).optional(),

  // Settings-level timezone override
  timezone: z.string().max(60).optional(),

  // Freeform escape hatch
  customFields: z.record(z.unknown()).optional(),
}).passthrough();
```

## Key decisions

1. **`.passthrough()` instead of `.strict()`**: The current `.strict()` silently strips `clUserPermissions` on update. Switching to `.passthrough()` preserves unknown keys while still validating known ones.

2. **`clUserPermissions` in the schema**: Formally validates the array against the `CL_USER_PERMISSIONS` enum. No more untyped `as string[]` casts.

3. **Feature flags vs `clUserPermissions`**: These coexist as separate concerns:
   - Feature flags (e.g., `allowClientCancellation`) are **tenant-level policy** — "can ANY CL user in this tenant cancel?"
   - `clUserPermissions` are **CL_USER-specific** — "which actions has the CL_ADMIN enabled for CL_USERs?" CL_ADMIN always has these permissions.
   - Future unification is possible but not required now.

4. **Defaults**: All boolean flags and billing period have sensible defaults. Missing keys in existing data will resolve to defaults on read.

5. **No Prisma migration**: Settings remain in `settings_json` JSONB column. No new indexed columns needed — billing period queries are rare and tenant count is low.

## CL_ADMIN Allow-List (for GAP-004)

When `actor.role === 'CL_ADMIN'`, only these settings keys are writable:
- `logoUrl`, `primaryColor`
- `notificationFromName`, `notificationFromEmail`, `smsFromName`
- `emailTemplates.*`

CL_ADMIN CANNOT write: `billingPeriod`, `billingDayOfWeek`, `billingDayOfMonth`, `clUserPermissions`, `allowClient*` flags, `priorityOfferHours`, `inspectorOfferRadiusKm`, `timezone`, `customFields`.
