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
