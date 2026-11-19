import { z } from 'zod';
import type { AuthContext } from '@properfy/shared';
import {
  appointmentCodePrefixSchema,
  ianaTimezoneSchema,
  normalizeRentalTenantNotificationSettings,
  tenantSettingsSchema,
} from '@properfy/shared';
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

/**
 * F00 — the only settings key OP may write. OP is cross-tenant (its JWT never carries a
 * tenantId), so it writes this key on ANY agency; every other field/key stays AM-only for OP.
 */
const OP_EXTRA_SETTINGS_KEYS = new Set(['mapWindowDays']);

// Legacy branding keys from the removed logo-upload flow. Kept blocked so the
// generic settings endpoint can never resurrect them.
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
    /** Agency IANA timezone. Editable by AM, and by CL_ADMIN on their own tenant. */
    timezone?: string;
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

    // RBAC:
    // - AM: full access, any agency, any field.
    // - OP: cross-tenant, may write ONLY settings.mapWindowDays on any agency (F00). OP's JWT never
    //   carries a tenantId, so it is NOT the old `(CL_ADMIN || OP) && actor.tenantId === tenantId`
    //   branch (that branch was dead for OP); it gets its own path here.
    // - CL_ADMIN (own tenant): name + appointmentCodePrefix + timezone + allow-listed settings.
    if (actor.role === 'AM') {
      // Full access
    } else if (actor.role === 'OP') {
      const hasTopLevelField =
        data.name !== undefined ||
        data.legalName !== undefined ||
        data.currency !== undefined ||
        data.appointmentCodePrefix !== undefined ||
        data.timezone !== undefined;
      const settingsKeys = data.settings ? Object.keys(data.settings) : [];
      const onlyExtraSettings =
        settingsKeys.length > 0 && settingsKeys.every((key) => OP_EXTRA_SETTINGS_KEYS.has(key));
      // Any top-level field, an absent/empty settings object, or any key outside the OP allow-list
      // rejects the whole request — no silent discard.
      if (hasTopLevelField || !onlyExtraSettings) {
        throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
      }
      data = { settings: data.settings };
    } else if (actor.role === 'CL_ADMIN' && actor.tenantId === tenantId) {
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
      // Keep the top-level appointmentCodePrefix and timezone (CL_ADMIN may set
      // both on their own tenant — the agency timezone is inherited by all its
      // users); other top-level fields (legalName, currency) remain AM-only.
      data = {
        name: data.name,
        appointmentCodePrefix: data.appointmentCodePrefix,
        timezone: data.timezone,
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
            `settings.${key} is not supported.`,
          );
        }
      }
    }

    // Revalidate mapWindowDays for non-route callers (the Fastify route already validates the
    // body; a direct use-case caller could pass an out-of-range value). F00.
    if (data.settings && 'mapWindowDays' in data.settings) {
      const result = tenantSettingsSchema.shape.mapWindowDays.safeParse(data.settings.mapWindowDays);
      if (!result.success) {
        throw new ValidationError('Invalid map window days', [
          { field: 'settings.mapWindowDays', message: 'Must be an integer between 1 and 90' },
        ]);
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

    // Validate before the update payload so non-route callers cannot store an
    // invalid IANA identifier.
    if (data.timezone !== undefined && !ianaTimezoneSchema.safeParse(data.timezone).success) {
      throw new ValidationError('Invalid timezone', [
        { field: 'timezone', message: 'Must be a valid IANA timezone identifier' },
      ]);
    }

    // Build update payload
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.legalName !== undefined) updateData.legalName = data.legalName;
    if (data.timezone !== undefined) updateData.timezone = data.timezone;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (normalizedAppointmentCodePrefix !== undefined)
      updateData.appointmentCodePrefix = normalizedAppointmentCodePrefix;
    // Only merge settings when something survived the permission filter: a settings object
    // reduced to {} (e.g. CL_ADMIN sending only mapWindowDays) must not count as a change.
    if (data.settings !== undefined && Object.keys(data.settings).length > 0) {
      updateData.settingsJson = deepMerge(
        tenant.settingsJson,
        normalizeRentalTenantNotificationSettings(data.settings),
      );
    }

    // Empty-PATCH guard (F00, approved 2026-10-27): if nothing remains after permission
    // filtering, skip the write, the audit and the event, and return the current tenant. Runs
    // after findById so a missing target still 404s. Narrow by design — equal values on an
    // allowed key still write and audit.
    if (Object.keys(updateData).length === 0) {
      return {
        id: tenant.id,
        name: tenant.name,
        legalName: tenant.legalName,
        status: tenant.status,
        timezone: tenant.timezone,
        currency: tenant.currency,
        appointmentCodePrefix: tenant.appointmentCodePrefix,
        settingsJson: tenant.settingsJson,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
      };
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
