import { TRANSITION_SOURCE_INSPECTOR_FINISH } from '@properfy/shared';
import {
  type DomainEvent,
  type DomainEventBus,
  APPOINTMENT_EVENTS,
} from '../../../../shared/application/events/domain-event-bus';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { Logger } from '../../../../shared/infrastructure/logger';

/**
 * On an inspector check-out (`STATUS_TRANSITION → DONE` with
 * `metadata.source === 'INSPECTOR_FINISH'`, L-F06-04) enqueues the durable
 * `tenant-eta.evaluate` job that sends the next tenant an "on the way" notice.
 * A manual OP/AM DONE (no source) is skipped — the inspector may be anywhere and
 * the sweep still covers delays. The subscriber only enqueues; it never rethrows
 * (the transition emit is fire-and-forget).
 */
export class EnqueueTenantEtaOnDoneSubscriber {
  constructor(
    private readonly jobQueue: IJobQueue,
    private readonly logger: Logger,
  ) {}

  register(bus: DomainEventBus): void {
    bus.subscribe(APPOINTMENT_EVENTS.STATUS_TRANSITION, (event) => this.handle(event));
  }

  async handle(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      appointmentId: string;
      tenantId: string;
      toStatus: string;
      metadata?: Record<string, unknown> | null;
    };
    if (payload.toStatus !== 'DONE') return;

    const source = payload.metadata?.['source'];
    if (source === TRANSITION_SOURCE_INSPECTOR_FINISH) {
      try {
        await this.jobQueue.enqueue(
          'tenant-eta.evaluate',
          {
            trigger: 'FINISH',
            appointmentId: payload.appointmentId,
            tenantId: payload.tenantId,
            occurredAt: event.occurredAt.toISOString(),
            attempt: 1,
          },
          {
            singletonKey: `tenant-eta:FINISH:${payload.appointmentId}:${event.occurredAt.getTime()}`,
            retryLimit: 2,
            retryBackoff: true,
            expireInMinutes: 5,
          },
        );
      } catch (err) {
        this.logger.warn({ appointmentId: payload.appointmentId, err }, 'tenant_eta.enqueue_failed');
      }
      return;
    }

    // A DONE with no source is a manual OP/AM close; any other source on DONE is
    // not a check-out. Neither triggers an "on the way".
    if (source === undefined || source === null) {
      this.logger.info(
        { appointmentId: payload.appointmentId, reason: 'MANUAL_DONE' },
        'tenant_eta.enqueue_skipped',
      );
    }
  }
}
