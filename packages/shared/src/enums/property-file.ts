/**
 * Property files & issues enums (F10). `PropertyFile` and `PropertyIssue` are
 * tenant-scoped entities (they carry `tenant_id`) — not platform-scoped.
 */

/** The four kinds of property file. Only `ISSUE` files are issue photos. */
export const PropertyFileType = {
  /** A photo attached to a `PropertyIssue`. */
  ISSUE: 'ISSUE',
  DOCUMENT: 'DOCUMENT',
  REPORT: 'REPORT',
  OTHER: 'OTHER',
} as const;
export type PropertyFileType = (typeof PropertyFileType)[keyof typeof PropertyFileType];

/** Upload lifecycle. `PENDING` at presign; `READY` once confirmed (or, for issue
 *  photos, once their issue is created — see F10 D20). */
export const PropertyFileStatus = {
  PENDING: 'PENDING',
  READY: 'READY',
} as const;
export type PropertyFileStatus = (typeof PropertyFileStatus)[keyof typeof PropertyFileStatus];

/** Who raised a `PropertyIssue`. Server-derived from the actor's role — never
 *  client-supplied. */
export const PropertyIssueSource = {
  /** Inspector, via the PWA. */
  INSPECTOR: 'INSPECTOR',
  /** Operations/agency staff (AM/OP/CL_ADMIN), via the web. */
  STAFF: 'STAFF',
  /** Rental tenant, via the portal token (TASK-F10-4). */
  RENTAL_TENANT_PORTAL: 'RENTAL_TENANT_PORTAL',
} as const;
export type PropertyIssueSource = (typeof PropertyIssueSource)[keyof typeof PropertyIssueSource];
