import { z } from 'zod';

// App credentials are a per-agency (tenant) registry of third-party app/account
// logins (name + username + password) that an inspector needs on site. Unlike
// contacts there is no role, no snapshot and no cross-tenant nullability:
// every credential belongs to exactly one tenant and is managed by AM/OP only.
// A credential may optionally be scoped to a single branch (branchId null =
// agency-wide, visible for every branch). Secrets (password, authCode,
// instructionsPassword) are shown in plaintext in the UI but encrypted at rest
// (the backend repository handles encrypt-on-save / decrypt-on-read).

const secretSchema = z.string().min(1).max(500);
const urlSchema = z.string().trim().url().max(1000);

// --- App credential (create) ---

export const appCredentialCreateSchema = z
  .object({
    // AM/OP are cross-tenant, so the owning tenant must be provided explicitly.
    tenantId: z.string().uuid(),
    branchId: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(1).max(200),
    username: z.string().trim().min(1).max(200),
    password: secretSchema,
    needsAuthCode: z.boolean().default(false),
    authCode: secretSchema.nullable().optional(),
    appUrl: urlSchema.nullable().optional(),
    instructionsUrl: urlSchema.nullable().optional(),
    instructionsPassword: secretSchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.needsAuthCode && !value.authCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['authCode'],
        message: 'authCode is required when needsAuthCode is true',
      });
    }
  });
export type AppCredentialCreateInput = z.infer<typeof appCredentialCreateSchema>;

// --- App credential (update / patch) ---
// The needsAuthCode/authCode invariant cannot be validated on a partial patch;
// the backend update use case enforces it against the merged entity state.

export const appCredentialUpdateSchema = z.object({
  branchId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  username: z.string().trim().min(1).max(200).optional(),
  password: secretSchema.optional(),
  needsAuthCode: z.boolean().optional(),
  authCode: secretSchema.nullable().optional(),
  appUrl: urlSchema.nullable().optional(),
  instructionsUrl: urlSchema.nullable().optional(),
  instructionsPassword: secretSchema.nullable().optional(),
  isActive: z.boolean().optional(),
});
export type AppCredentialUpdateInput = z.infer<typeof appCredentialUpdateSchema>;

// --- Response shapes ---

/** Canonical detail/payload shape (GET :id, POST, PATCH, deactivate). */
export const appCredentialResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid().nullable(),
  name: z.string(),
  username: z.string(),
  password: z.string(),
  needsAuthCode: z.boolean(),
  authCode: z.string().nullable(),
  appUrl: z.string().nullable(),
  instructionsUrl: z.string().nullable(),
  instructionsPassword: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AppCredentialResponse = z.infer<typeof appCredentialResponseSchema>;

/** List-row variant — adds owning agency and branch names for display. */
export const appCredentialListItemSchema = appCredentialResponseSchema.extend({
  tenantName: z.string().nullable(),
  branchName: z.string().nullable(),
});
export type AppCredentialListItem = z.infer<typeof appCredentialListItemSchema>;

/**
 * Shape embedded under an appointment's `apps` array (web map detail panel and
 * inspector PWA detail). Live reference — values reflect the current registry
 * row, not a snapshot at link time.
 */
export const appointmentAppSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  username: z.string(),
  password: z.string(),
  needsAuthCode: z.boolean(),
  authCode: z.string().nullable(),
  appUrl: z.string().nullable(),
  instructionsUrl: z.string().nullable(),
  instructionsPassword: z.string().nullable(),
});
export type AppointmentApp = z.infer<typeof appointmentAppSchema>;
