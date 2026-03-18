import type { ITenantRepository } from '../../modules/tenant/domain/tenant.repository';
import { ForbiddenError } from './errors';

export async function assertClUserPermission(
  tenantRepo: ITenantRepository,
  tenantId: string,
  permission: string,
): Promise<void> {
  const tenant = await tenantRepo.findById(tenantId);
  const permissions =
    (tenant?.settingsJson?.clUserPermissions as string[] | undefined) ?? [];
  if (!permissions.includes(permission)) {
    throw new ForbiddenError(
      'FORBIDDEN',
      `CL_USER does not have ${permission} permission`,
    );
  }
}
