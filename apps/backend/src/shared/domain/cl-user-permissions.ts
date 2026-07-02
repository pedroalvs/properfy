import type { ITenantRepository } from '../../modules/tenant/domain/tenant.repository';
import { ForbiddenError } from './errors';

/**
 * Normalize the untyped `settingsJson.clUserPermissions` value into a string[].
 * `settingsJson` is free-form JSON, so guard against non-array / non-string data
 * before it flows into permission checks. Single source of truth for every
 * call site that reads CL_USER flags from tenant settings.
 */
export function normalizeClUserPermissions(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((p): p is string => typeof p === 'string') : [];
}

export async function assertClUserPermission(
  tenantRepo: ITenantRepository,
  tenantId: string,
  permission: string,
): Promise<void> {
  const tenant = await tenantRepo.findById(tenantId);
  const permissions = normalizeClUserPermissions(tenant?.settingsJson?.clUserPermissions);
  if (!permissions.includes(permission)) {
    throw new ForbiddenError(
      'FORBIDDEN',
      `CL_USER does not have ${permission} permission`,
    );
  }
}
