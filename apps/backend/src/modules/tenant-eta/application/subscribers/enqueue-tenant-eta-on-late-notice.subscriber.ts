import {
  type DomainEvent,
  type DomainEventBus,
  INSPECTOR_FIELD_EVENTS,
} from '../../../../shared/application/events/domain-event-bus';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { Logger } from '../../../../shared/infrastructure/logger';

/**
 * On an inspector `LATE_NOTICE` field event enqueues the durable
 * `tenant-eta.evaluate` job that re-checks the whole plan for projected delays.
 * Only enqueues; never rethrows.
 */
export class EnqueueTenantEtaOnLateNoticeSubscriber {
  constructor(
    private readonly jobQueue: IJobQueue,
    private readonly logger: Logger,
  ) {}

  register(bus: DomainEventBus): void {
    bus.subscribe(INSPECTOR_FIELD_EVENTS.RECORDED, (event) => this.handle(event));
  }

  async handle(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      type: string;
      appointmentId: string;
      tenantId: string;
      eventId: string;
    };
    if (payload.type !== 'LATE_NOTICE') return;

    try {
      await this.jobQueue.enqueue(
        'tenant-eta.evaluate',
        {
          trigger: 'LATE_NOTICE',
          appointmentId: payload.appointmentId,
          tenantId: payload.tenantId,
          eventId: payload.eventId,
          attempt: 1,
        },
        {
          singletonKey: `tenant-eta:LATE_NOTICE:${payload.eventId}`,
          retryLimit: 2,
          retryBackoff: true,
          expireInMinutes: 5,
        },
      );
    } catch (err) {
      this.logger.warn({ appointmentId: payload.appointmentId, err }, 'tenant_eta.enqueue_failed');
    }
  }
}
