import { z } from 'zod';

// App credentials are a per-agency (tenant) registry of third-party app/account
// logins (name + username + password) that an inspector needs on site. Unlike
// contacts there is no role, no snapshot and no cross-tenant nullability:
// every credential belongs to exactly one tenant and is managed by AM/OP only.
// The password is shown in plaintext in the UI but encrypted at rest (the
// backend repository handles encrypt-on-save / decrypt-on-read).

// --- App credential (create) ---

export const appCredentialCreateSchema = z.object({
  // AM/OP are cross-tenant, so the owning tenant must be provided explicitly.
  tenantId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  username: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(500),
});
export type AppCredentialCreateInput = z.infer<typeof appCredentialCreateSchema>;

// --- App credential (update / patch) ---

export const appCredentialUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  username: z.string().trim().min(1).max(200).optional(),
  password: z.string().min(1).max(500).optional(),
  isActive: z.boolean().optional(),
});
export type AppCredentialUpdateInput = z.infer<typeof appCredentialUpdateSchema>;

// --- Response shapes ---

/** Canonical detail/payload shape (GET :id, POST, PATCH, deactivate). */
export const appCredentialResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  username: z.string(),
  password: z.string(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AppCredentialResponse = z.infer<typeof appCredentialResponseSchema>;

/** List-row variant — adds the owning agency name for display. */
export const appCredentialListItemSchema = appCredentialResponseSchema.extend({
  tenantName: z.string().nullable(),
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
});
export type AppointmentApp = z.infer<typeof appointmentAppSchema>;
