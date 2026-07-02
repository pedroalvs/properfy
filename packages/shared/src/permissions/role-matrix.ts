import type { UserRole } from '../enums/user';

/**
 * Condition types for conditional permission entries.
 * - cl_user_flag: CL_USER must have the specified permission flag in tenant settings
 * - tenant_setting: Tenant must have the specified setting enabled
 */
export type PermissionCondition = 'cl_user_flag' | 'tenant_setting';

export interface RoleMatrixEntry {
  /** Roles permitted to perform this action (unconditionally or subject to condition) */
  roles: UserRole[];
  /** Optional condition that must also be satisfied */
  condition?: PermissionCondition;
  /** The specific flag or setting key for the condition */
  conditionKey?: string;
}

/**
 * Canonical role×action permission matrix.
 * Single source of truth consumed by both backend (enforcement) and frontend (UI visibility).
 *
 * Action keys follow the pattern: `domain.verb` (e.g., `user.create_internal`).
 */
export const ROLE_ACTION_MATRIX: Record<string, RoleMatrixEntry> = {
  // ── User Management ──────────────────────────────────────────────────
  'user.create_internal': {
    roles: ['AM'],
  },
  'user.create_tenant': {
    roles: ['AM', 'OP', 'CL_ADMIN'],
    condition: 'tenant_setting',
    conditionKey: 'allowClientUserManagement',
  },
  'user.list': {
    roles: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'],
  },
  'user.update': {
    roles: ['AM', 'OP', 'CL_ADMIN'],
  },
  'user.deactivate': {
    roles: ['AM', 'OP'],
  },
  'user.reset_password': {
    roles: ['AM', 'OP'],
  },

  // ── Tenant Management ────────────────────────────────────────────────
  'tenant.create': {
    roles: ['AM', 'OP'],
  },
  'tenant.update': {
    roles: ['AM', 'OP'],
  },
  'tenant.deactivate': {
    roles: ['AM', 'OP'],
  },

  // ── Property Management ──────────────────────────────────────────────
  'property.create': {
    roles: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'],
    condition: 'cl_user_flag',
    conditionKey: 'create_properties',
  },
  'property.update': {
    roles: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'],
    condition: 'cl_user_flag',
    conditionKey: 'create_properties',
  },
  'property.list': {
    roles: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'],
  },
  'property.import': {
    roles: ['AM', 'OP'],
  },

  // ── Appointment Lifecycle ────────────────────────────────────────────
  // Frontend-gating only: the backend enforces roles directly via
  // `assertRoles(actor, ['AM','OP','CL_ADMIN'], ...)` in the import use
  // cases, not via this matrix. This entry exists so `usePermissions()
  // .canPerform('appointment.import')` can gate the UI consistently.
  'appointment.import': {
    roles: ['AM', 'OP', 'CL_ADMIN'],
  },
  'appointment.create': {
    roles: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'],
    condition: 'cl_user_flag',
    conditionKey: 'create_appointments',
  },
  'appointment.cancel': {
    roles: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'],
    condition: 'cl_user_flag',
    conditionKey: 'cancel_appointments',
  },
  'appointment.reject': {
    roles: ['AM', 'OP', 'CL_USER'],
    condition: 'cl_user_flag',
    conditionKey: 'reject_appointments',
  },
  'appointment.release': {
    roles: ['AM', 'OP'],
  },
  'appointment.mark_done': {
    roles: ['OP', 'INSP'],
  },
  'appointment.reopen_done': {
    roles: ['AM'],
  },
  'appointment.force_confirmation': {
    roles: ['AM', 'OP', 'CL_USER'],
    condition: 'cl_user_flag',
    conditionKey: 'force_confirmation',
  },
  'appointment.cross_check': {
    roles: ['AM', 'OP'],
  },
  'appointment.bulk_resend_reminder': {
    roles: ['AM', 'OP'],
  },
  'appointment.reschedule': {
    roles: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'],
    condition: 'cl_user_flag',
    conditionKey: 'reschedule_appointments',
  },
  // 025 §FR-411 — bulk cancel from map flow; CL_USER gated by cancel_appointments flag
  'appointment.bulk_cancel': {
    roles: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'],
    condition: 'cl_user_flag',
    conditionKey: 'cancel_appointments',
  },
  // 025 §FR-421 — bulk reschedule from map flow; CL_USER gated by reschedule_appointments flag
  'appointment.bulk_reschedule': {
    roles: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'],
    condition: 'cl_user_flag',
    conditionKey: 'reschedule_appointments',
  },
  // 025 §FR-431 — bulk status transition (release / reject / reopen); OP-team only
  'appointment.bulk_status_transition': {
    roles: ['AM', 'OP'],
  },
  // 025 §FR-441 — bulk inspector assignment; OP-team only
  'appointment.bulk_assign_inspector': {
    roles: ['AM', 'OP'],
  },
  // 026 §FR-510 — add appointments to existing service group; OP-team only
  // (mirrors `service_group.manage` because both write to the group surface
  // and the group's lifecycle is operator-driven per Regras matrix).
  'appointment.add_to_group': {
    roles: ['AM', 'OP'],
  },
  // 026 §FR-540 — bulk reopen for reschedule; matriz 2.2 grants the
  // reschedule write surface to CL_ADMIN in addition to the OP-team.
  // BulkReopenForRescheduleUseCase enforces the 30-day window for client
  // roles (AM/OP are exempt);
  // the route layer enforces this RBAC base; CL_USER is not allowed even
  // with the `reschedule_appointments` flag because bulk reschedule is
  // operator coordination (single-item reschedule via the standard
  // patch endpoint remains available to CL_USER per spec 006).
  'appointment.bulk_reopen_for_reschedule': {
    roles: ['AM', 'OP', 'CL_ADMIN'],
  },

  // ── Inspector Management ─────────────────────────────────────────────
  'inspector.create': {
    roles: ['AM', 'OP'],
  },
  'inspector.update': {
    roles: ['AM', 'OP'],
  },
  'inspector.deactivate': {
    roles: ['AM', 'OP'],
  },
  'inspector.view_own': {
    roles: ['INSP'],
  },
  'inspector.view_eligible': {
    roles: ['CL_ADMIN', 'CL_USER'],
  },

  // ── Service Groups & Marketplace ─────────────────────────────────────
  'service_group.create': {
    roles: ['AM', 'OP'],
  },
  'service_group.manage': {
    roles: ['AM', 'OP'],
  },
  'service_group.publish': {
    roles: ['AM', 'OP'],
  },
  'marketplace.view_offers': {
    roles: ['INSP'],
  },
  'marketplace.accept_offer': {
    roles: ['INSP'],
  },

  // ── Service Regions ──────────────────────────────────────────────────
  'service_region.create': {
    roles: ['AM', 'OP'],
  },
  'service_region.update': {
    roles: ['AM', 'OP'],
  },
  'service_region.delete': {
    roles: ['AM', 'OP'],
  },
  'service_region.list': {
    roles: ['AM', 'OP', 'INSP'],
  },
  'service_region.resolve': {
    roles: ['AM', 'OP'],
  },

  // ── Financial Operations ─────────────────────────────────────────────
  // Backoffice (platform) financial operations — AM/OP only.
  'financial.view': {
    roles: ['AM', 'OP'],
  },
  'financial.approve': {
    roles: ['AM', 'OP'],
  },
  'financial.manual_adjustment': {
    roles: ['AM', 'OP'],
  },
  'financial.refund': {
    roles: ['AM', 'OP'],
  },
  // 031 §Financial scope alignment — Agency read surfaces (extrato / services
  // rendered / summary). AM/OP (platform) and CL_ADMIN (own agency) see them
  // unconditionally; CL_USER is gated by the `view_financials` tenant flag.
  'financial.agency_view': {
    roles: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'],
    condition: 'cl_user_flag',
    conditionKey: 'view_financials',
  },
  // 031 — Own-tenant financial statement XLSX export; same gating as agency_view.
  'financial.agency_export': {
    roles: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'],
    condition: 'cl_user_flag',
    conditionKey: 'view_financials',
  },

  // ── Configuration ────────────────────────────────────────────────────
  'config.service_types': {
    roles: ['AM', 'OP'],
  },
  'config.pricing_rules': {
    roles: ['AM', 'OP'],
  },
  'config.notification_templates': {
    roles: ['AM', 'OP', 'CL_ADMIN'],
  },

  // ── Contact Registry ─────────────────────────────────────────────────
  'contact.list': {
    roles: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'],
  },
  'contact.create': {
    roles: ['AM', 'OP', 'CL_ADMIN'],
  },
  'contact.update': {
    roles: ['AM', 'OP', 'CL_ADMIN'],
  },
  'contact.deactivate': {
    roles: ['AM', 'OP', 'CL_ADMIN'],
  },

  // ── Reports & Audit ──────────────────────────────────────────────────
  'report.view': {
    roles: ['AM', 'OP'],
  },
  'audit.view': {
    roles: ['AM', 'OP', 'CL_ADMIN'],
  },
} as const;

/** All action keys in the matrix */
export type RoleAction = keyof typeof ROLE_ACTION_MATRIX;

/**
 * Check whether a role is permitted to perform an action.
 * NOTE: This only checks the base role permission — conditional checks
 * (CL_USER flags, tenant settings) must be enforced separately at runtime.
 */
export function can(role: UserRole, action: string): boolean {
  const entry = ROLE_ACTION_MATRIX[action];
  if (!entry) return false;
  return entry.roles.includes(role);
}

/**
 * Get the matrix entry for an action, or undefined if the action is not in the matrix.
 */
export function getMatrixEntry(action: string): RoleMatrixEntry | undefined {
  return ROLE_ACTION_MATRIX[action];
}
