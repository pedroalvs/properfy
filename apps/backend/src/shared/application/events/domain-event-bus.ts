export interface DomainEvent {
  type: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

export type DomainEventHandler = (event: DomainEvent) => void | Promise<void>;

export class DomainEventBus {
  private handlers = new Map<string, DomainEventHandler[]>();

  subscribe(eventType: string, handler: DomainEventHandler): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  async emit(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? [];
    await Promise.allSettled(
      handlers.map((h) => {
        try {
          return Promise.resolve(h(event));
        } catch (err) {
          return Promise.reject(err);
        }
      }),
    );
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const TENANT_EVENTS = {
  CREATED: 'tenant.created.v1',
  UPDATED: 'tenant.updated.v1',
  ACTIVATED: 'tenant.activated.v1',
  DEACTIVATED: 'tenant.deactivated.v1',
} as const;

export const BRANCH_EVENTS = {
  CREATED: 'branch.created.v1',
  UPDATED: 'branch.updated.v1',
  ACTIVATED: 'branch.activated.v1',
  DEACTIVATED: 'branch.deactivated.v1',
} as const;

export const SERVICE_REGION_EVENTS = {
  DEACTIVATED: 'service_region.deactivated.v1',
  REACTIVATED: 'service_region.reactivated.v1',
} as const;

export const SERVICE_GROUP_EVENTS = {
  PUBLISHED: 'service_group.published.v1',
  ACCEPTED: 'service_group.accepted.v1',
  CANCELLED: 'service_group.cancelled.v1',
  REJECTED: 'service_group.rejected.v1',
  MANUALLY_ASSIGNED: 'service_group.manually_assigned.v1',
  /** The group changed hands. Carries `previousInspectorId` so both parties can be told. */
  INSPECTOR_CHANGED: 'service_group.inspector_changed.v1',
  /** The group's date and/or time window moved; members were cascaded to match. */
  SCHEDULE_CHANGED: 'service_group.schedule_changed.v1',
  /**
   * New appointments were added to an already-ACCEPTED group and scheduled under its
   * committed inspector. Carries `inspectorId` and `addedCount` so the inspector can
   * be told their schedule grew. Distinct from ACCEPTED/MANUALLY_ASSIGNED, which
   * re-notify the whole group; this one concerns only the newly added members.
   */
  MEMBERS_ADDED: 'service_group.members_added.v1',
} as const;

export const TENANT_PORTAL_EVENTS = {
  CONFIRMED: 'rental_tenant_portal.confirmed.v1',
  CONTACT_UPDATED: 'rental_tenant_portal.contact_updated.v1',
  UNAVAILABLE: 'rental_tenant_portal.unavailable.v1',
} as const;

export const APPOINTMENT_EVENTS = {
  STATUS_TRANSITION: 'appointment.status_transition.v1',
  DONE_REJECTED: 'appointment.done_rejected.v1',
  CREATED: 'appointment.created.v1',
  UPDATED: 'appointment.updated.v1',
  DELETED: 'appointment.deleted.v1',
} as const;

/**
 * Emitted after a platform setting is written (F03, L-F03-10). Features that must
 * react to a setting change (e.g. F07 recomputing a snapshot, F04 route weights)
 * SUBSCRIBE to this instead of editing UpdatePlatformSettingUseCase. The payload's
 * `before`/`after` are the effective values (defaults when there was no row).
 */
export const PLATFORM_SETTING_EVENTS = {
  UPDATED: 'platform_setting.updated.v1',
} as const;

export interface PlatformSettingUpdatedPayload extends Record<string, unknown> {
  key: string;
  before: unknown;
  after: unknown;
  actorId: string;
  occurredAt: string;
}
