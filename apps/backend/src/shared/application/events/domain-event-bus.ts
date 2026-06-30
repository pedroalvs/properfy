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
} as const;

export const SERVICE_GROUP_EVENTS = {
  PUBLISHED: 'service_group.published.v1',
  ACCEPTED: 'service_group.accepted.v1',
  CANCELLED: 'service_group.cancelled.v1',
  REJECTED: 'service_group.rejected.v1',
  MANUALLY_ASSIGNED: 'service_group.manually_assigned.v1',
} as const;

export const TENANT_PORTAL_EVENTS = {
  CONFIRMED: 'rental_tenant_portal.confirmed.v1',
  RESCHEDULED: 'rental_tenant_portal.rescheduled.v1',
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
