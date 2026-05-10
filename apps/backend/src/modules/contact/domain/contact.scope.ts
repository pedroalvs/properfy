/**
 * 024 §FR-303 — visibility scope for the Contact list/detail use cases.
 *
 * Resolved by the use case from the auth context (and an optional explicit
 * `tenantId` query param for AM/OP). Threaded down to the repository so
 * the visibility predicate is computed in a single place.
 *
 * Discriminated union:
 *   - `global`: AM/OP without an explicit tenant filter — see all rows.
 *   - `global` + `explicitTenantId`: AM/OP with an explicit tenant filter
 *     (Agency selector path) — same OR-of-EXISTS-and-legacy predicate as
 *     the CL roles, just driven by an input rather than the JWT.
 *   - `tenant_pinned`: CL_ADMIN / CL_USER — visibility derived from the
 *     operational junction (`appointment_contacts → appointments.tenant_id`).
 */
export type ContactScope =
  | { kind: 'global'; explicitTenantId?: string | null }
  | { kind: 'tenant_pinned'; tenantId: string };
