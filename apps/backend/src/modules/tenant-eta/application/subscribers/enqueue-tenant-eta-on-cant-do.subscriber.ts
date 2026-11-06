import { TRANSITION_SOURCE_INSPECTOR_CANT_DO } from '@properfy/shared';
import {
  type DomainEvent,
  type DomainEventBus,
  APPOINTMENT_EVENTS,
} from '../../../../shared/application/events/domain-event-bus';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { Logger } from '../../../../shared/infrastructure/logger';

/**
 * On a "can't do this job" (`STATUS_TRANSITION → REJECTED` with
 * `metadata.source === 'INSPECTOR_CANT_DO'`, D16) enqueues the durable
 * `tenant-eta.evaluate` job for the inspector's next stop. Listening to the
 * transition (not the field event) guarantees the appointment already left the
 * plan, so it is never used as the seed. Other rejection origins (OP/AM, tenant
 * declined/no-response, expired) do not trigger.
 */
export class EnqueueTenantEtaOnCantDoSubscriber {
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
    if (payload.toStatus !== 'REJECTED') return;
    if (payload.metadata?.['source'] !== TRANSITION_SOURCE_INSPECTOR_CANT_DO) return;

    const inspectorId = payload.metadata?.['initiatedByInspectorId'];
    if (typeof inspectorId !== 'string' || inspectorId.length === 0) {
      this.logger.info(
        { appointmentId: payload.appointmentId, reason: 'NO_INSPECTOR' },
        'tenant_eta.enqueue_skipped',
      );
      return;
    }

    try {
      await this.jobQueue.enqueue(
        'tenant-eta.evaluate',
        {
          trigger: 'CANT_DO',
          appointmentId: payload.appointmentId,
          tenantId: payload.tenantId,
          inspectorId,
          occurredAt: event.occurredAt.toISOString(),
          attempt: 1,
        },
        {
          singletonKey: `tenant-eta:CANT_DO:${payload.appointmentId}:${event.occurredAt.getTime()}`,
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
