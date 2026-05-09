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
  'appointment.reschedule': {
    roles: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'],
    condition: 'cl_user_flag',
    conditionKey: 'reschedule_appointments',
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

  // ── Configuration ────────────────────────────────────────────────────
  'config.time_slots': {
    roles: ['AM', 'OP', 'CL_ADMIN'],
  },
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
  'report.export': {
    roles: ['AM', 'OP', 'CL_USER'],
    condition: 'cl_user_flag',
    conditionKey: 'export_reports',
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
