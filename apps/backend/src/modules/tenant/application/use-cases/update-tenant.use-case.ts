import { z } from 'zod';
import type { AuthContext } from '@properfy/shared';
import { appointmentCodePrefixSchema } from '@properfy/shared';
import { ForbiddenError, ValidationError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { ITenantRepository } from '../../domain/tenant.repository';
import {
  TenantNotFoundError,
  TenantLegalNameConflictError,
  TenantAppointmentCodePrefixConflictError,
} from '../../domain/tenant.errors';
import { deepMerge } from '../../../../shared/domain/utils';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { TENANT_EVENTS } from '../../../../shared/application/events/domain-event-bus';

/**
 * CL_ADMIN and OP can only update branding, notification sender, and email template keys.
 * All other settings keys (billing, feature flags, permissions, inspector config) are AM-only.
 */
const CL_ADMIN_SETTINGS_ALLOW_LIST = new Set([
  'primaryColor',
  'notificationFromName',
  'notificationFromEmail',
  'smsFromName',
  'emailTemplates',
  'contactPhone',
]);

// These keys must only be set via the dedicated logo upload flow (presign → PUT → confirm).
const IMMUTABLE_SETTINGS_KEYS = ['logoUrl', 'logoStorageKey'] as const;

// H8: Zod schema for CL_ADMIN-writable settings fields that require validation.
// Note: `appointmentCodePrefix` is no longer a settings key — it is a top-level
// scalar column validated by the shared updateTenantSchema and handled below.
const clAdminSettingsSchema = z.object({
  contactPhone: z.string().min(8).max(20).optional(),
}).passthrough();

function filterClAdminSettings(
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const key of Object.keys(settings)) {
    if (CL_ADMIN_SETTINGS_ALLOW_LIST.has(key)) {
      filtered[key] = settings[key];
    }
  }
  return filtered;
}

export interface UpdateTenantInput {
  tenantId: string;
  data: {
    name?: string;
    legalName?: string;
    currency?: string;
    appointmentCodePrefix?: string;
    settings?: Record<string, unknown>;
  };
  actor: AuthContext;
}

export interface UpdateTenantOutput {
  id: string;
  name: string;
  legalName: string;
  status: string;
  timezone: string;
  currency: string;
  appointmentCodePrefix: string | null;
  settingsJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class UpdateTenantUseCase {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly auditService: AuditService,
    private readonly eventBus?: DomainEventBus,
  ) {}

  async execute(input: UpdateTenantInput): Promise<UpdateTenantOutput> {
    const { tenantId, actor } = input;
    let { data } = input;

    // RBAC: AM can update all fields; OP/CL_ADMIN own tenant, limited to name and settings
    if (actor.role === 'AM') {
      // Full access
    } else if (
      (actor.role === 'CL_ADMIN' || actor.role === 'OP') &&
      actor.tenantId === tenantId
    ) {
      // Strip top-level fields and filter settings keys
      const filteredSettings = data.settings ? filterClAdminSettings(data.settings) : undefined;
      if (filteredSettings) {
        const parsed = clAdminSettingsSchema.safeParse(filteredSettings);
        if (!parsed.success) {
          const fields = parsed.error.issues.map((i) => ({
            field: `settings.${i.path.join('.')}`,
            message: i.message,
          }));
          throw new ValidationError('Invalid settings value', fields);
        }
      }
      // Keep the top-level appointmentCodePrefix (CL_ADMIN/OP may set it); other
      // top-level fields (legalName, currency) remain AM-only; timezone is frozen platform-wide.
      data = {
        name: data.name,
        appointmentCodePrefix: data.appointmentCodePrefix,
        settings: filteredSettings,
      };
    } else {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    // Block logo keys for all roles — must use the dedicated upload flow
    if (data.settings) {
      for (const key of IMMUTABLE_SETTINGS_KEYS) {
        if (key in data.settings) {
          throw new ValidationError(
            `settings.${key} cannot be set via this endpoint. Use the logo upload flow.`,
          );
        }
      }
    }

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant || tenant.isDeleted()) {
      throw new TenantNotFoundError();
    }

    // Check legalName uniqueness if changing
    if (data.legalName && data.legalName !== tenant.legalName) {
      const existing = await this.tenantRepo.findByLegalName(data.legalName);
      if (existing) {
        throw new TenantLegalNameConflictError();
      }
    }

    // Validate AND normalize before the uniqueness lookup and the update payload,
    // so non-route callers get a deterministic validation error and can't store a
    // mixed-case/invalid value that bypasses the case-insensitive uniqueness contract.
    let normalizedAppointmentCodePrefix: string | undefined;
    if (data.appointmentCodePrefix !== undefined) {
      const prefixResult = appointmentCodePrefixSchema.safeParse(data.appointmentCodePrefix);
      if (!prefixResult.success) {
        throw new ValidationError('Invalid appointment code prefix', [
          { field: 'appointmentCodePrefix', message: 'Prefix must be 3–4 letters or numbers' },
        ]);
      }
      normalizedAppointmentCodePrefix = prefixResult.data;
    }

    // Check appointmentCodePrefix uniqueness if changing (excluding this tenant)
    if (
      normalizedAppointmentCodePrefix !== undefined &&
      normalizedAppointmentCodePrefix !== tenant.appointmentCodePrefix
    ) {
      const prefixOwner = await this.tenantRepo.findByAppointmentCodePrefix(
        normalizedAppointmentCodePrefix,
      );
      if (prefixOwner && prefixOwner.id !== tenantId) {
        throw new TenantAppointmentCodePrefixConflictError();
      }
    }

    const before = {
      name: tenant.name,
      legalName: tenant.legalName,
      timezone: tenant.timezone,
      currency: tenant.currency,
      appointmentCodePrefix: tenant.appointmentCodePrefix,
      settingsJson: tenant.settingsJson,
    };

    // Build update payload
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.legalName !== undefined) updateData.legalName = data.legalName;
    // timezone is frozen to the platform timezone (Sydney-only); updates are ignored.
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (normalizedAppointmentCodePrefix !== undefined)
      updateData.appointmentCodePrefix = normalizedAppointmentCodePrefix;
    if (data.settings !== undefined) {
      updateData.settingsJson = deepMerge(tenant.settingsJson, data.settings);
    }

    await this.tenantRepo.update(tenantId, updateData);

    const after = {
      name: (updateData.name as string) ?? tenant.name,
      legalName: (updateData.legalName as string) ?? tenant.legalName,
      timezone: (updateData.timezone as string) ?? tenant.timezone,
      currency: (updateData.currency as string) ?? tenant.currency,
      appointmentCodePrefix:
        (updateData.appointmentCodePrefix as string | undefined) ??
        tenant.appointmentCodePrefix,
      settingsJson:
        (updateData.settingsJson as Record<string, unknown>) ??
        tenant.settingsJson,
    };

    this.auditService.log({
      action: 'tenant.updated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Tenant',
      entityId: tenantId,
      tenantId,
      before,
      after,
    });

    this.eventBus?.emit({
      type: TENANT_EVENTS.UPDATED,
      payload: { tenantId, changedFields: Object.keys(updateData) },
      occurredAt: new Date(),
    });

    return {
      id: tenant.id,
      name: after.name,
      legalName: after.legalName,
      status: tenant.status,
      timezone: after.timezone,
      currency: after.currency,
      appointmentCodePrefix: after.appointmentCodePrefix,
      settingsJson: after.settingsJson,
      createdAt: tenant.createdAt,
      updatedAt: new Date(),
    };
  }
}
