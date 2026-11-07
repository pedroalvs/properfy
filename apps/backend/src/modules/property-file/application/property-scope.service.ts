import type { AuthContext } from '@properfy/shared';
import { assertTenantScope } from '../../../shared/domain/require-tenant-scope';
import type { IInspectorAppointmentVisibility } from '../domain/inspector-appointment-visibility';
import {
  PropertyFileNotFoundError,
  PropertyIssueNotFoundError,
  PropertyFileForbiddenError,
} from '../domain/property-file.errors';

/** The tenant-owned subject a file or issue belongs to (for scope checks). */
export interface ScopedEntity {
  tenantId: string;
  appointmentId: string | null;
}

export interface ReadListScope {
  /** Tenant predicate for the list query; undefined = cross-tenant (AM/OP). */
  tenantId?: string;
}

/**
 * Centralizes the read-access decisions for property files & issues:
 * - AM/OP: cross-tenant.
 * - CL_ADMIN/CL_USER: pinned to their own tenant; anything else is 404 (C.A2).
 * - INSP: only files/issues of an assigned, T-1-visible appointment (D28); 404 otherwise.
 * - TNT/SYS: no access on these authenticated routes.
 */
export class PropertyScopeService {
  constructor(private readonly visibility: IInspectorAppointmentVisibility) {}

  private async canAccess(actor: AuthContext, entity: ScopedEntity): Promise<boolean> {
    switch (actor.role) {
      case 'AM':
      case 'OP':
        return true;
      case 'CL_ADMIN':
      case 'CL_USER':
        return actor.tenantId != null && entity.tenantId === actor.tenantId;
      case 'INSP': {
        if (!actor.inspectorId || !entity.appointmentId) return false;
        const vis = await this.visibility.resolveForInspector(entity.appointmentId, actor.inspectorId);
        return vis != null && vis.tenantId === entity.tenantId;
      }
      default:
        return false;
    }
  }

  async assertCanReadFile(actor: AuthContext, file: ScopedEntity): Promise<void> {
    if (!(await this.canAccess(actor, file))) throw new PropertyFileNotFoundError();
  }

  async assertCanReadIssue(actor: AuthContext, issue: ScopedEntity): Promise<void> {
    if (!(await this.canAccess(actor, issue))) throw new PropertyIssueNotFoundError();
  }

  /**
   * Resolve the tenant predicate for a list query. INSP MUST query by a visible
   * appointment (never by property); a property-only INSP query is forbidden.
   */
  async resolveReadListScope(
    actor: AuthContext,
    query: { propertyId?: string; appointmentId?: string },
  ): Promise<ReadListScope> {
    switch (actor.role) {
      case 'AM':
      case 'OP':
        return {};
      case 'CL_ADMIN':
      case 'CL_USER':
        return { tenantId: assertTenantScope(actor, 'property_file.read') };
      case 'INSP': {
        if (!actor.inspectorId) throw new PropertyFileForbiddenError();
        if (!query.appointmentId) {
          throw new PropertyFileForbiddenError('Inspectors can only list files by appointment.');
        }
        const vis = await this.visibility.resolveForInspector(query.appointmentId, actor.inspectorId);
        if (!vis) throw new PropertyFileNotFoundError();
        return { tenantId: vis.tenantId };
      }
      default:
        throw new PropertyFileForbiddenError();
    }
  }
}
