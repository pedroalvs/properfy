import type { FyWebhookEvent } from '@properfy/shared';
import { IntegrationProvider } from '@properfy/shared';

import type { DomainEvent, DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import {
  APPOINTMENT_EVENTS,
  SERVICE_GROUP_EVENTS,
} from '../../../../shared/application/events/domain-event-bus';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { IntegrationConfigResolver } from '../../../integration/infrastructure/integration-config-resolver';
import { formatAppointmentCode, type IFyRepository } from '../../domain/fy.repository';

export const FY_WEBHOOK_JOB = 'fy.webhook.deliver';

interface Logger {
  warn(obj: unknown, msg?: string): void;
}

/**
 * Bridges in-process domain events to the Fy outbound webhook queue. The
 * subscriber only enqueues (fast, fire-and-forget from the emitters'
 * perspective); actual HTTP delivery happens in the pg-boss worker with
 * retry/backoff. No-op while the FY_WEBHOOK integration is unconfigured.
 */
export class FyWebhookSubscriber {
  constructor(
    private readonly configResolver: IntegrationConfigResolver,
    private readonly fyRepo: IFyRepository,
    private readonly jobQueue: IJobQueue,
    private readonly logger?: Logger,
  ) {}

  register(eventBus: DomainEventBus): void {
    eventBus.subscribe(SERVICE_GROUP_EVENTS.ACCEPTED, (event) => this.onGroupAccepted(event));
    eventBus.subscribe(APPOINTMENT_EVENTS.STATUS_TRANSITION, (event) =>
      this.onStatusTransition(event),
    );
  }

  private async isConfigured(): Promise<boolean> {
    return (await this.configResolver.getConfig(IntegrationProvider.FY_WEBHOOK)) !== null;
  }

  /** One `inspector.accepted` webhook per appointment in the accepted group. */
  private async onGroupAccepted(event: DomainEvent): Promise<void> {
    try {
      if (!(await this.isConfigured())) return;
      const { groupId } = event.payload as { groupId: string };

      const rows = await this.fyRepo.findGroupAcceptanceInfo(groupId);
      for (const row of rows) {
        const payload: FyWebhookEvent = {
          event: 'inspector.accepted',
          timestamp: event.occurredAt.toISOString(),
          data: {
            appointmentId: row.appointmentId,
            appointmentCode: formatAppointmentCode(
              row.appointmentCodePrefix,
              row.appointmentNumber,
            ),
            inspector: { id: row.inspectorId, name: row.inspectorName },
          },
        };
        await this.enqueue(payload, `fy-accepted:${groupId}:${row.appointmentId}`);
      }
    } catch (err) {
      this.logger?.warn({ err }, 'Failed to enqueue fy inspector.accepted webhooks');
    }
  }

  private async onStatusTransition(event: DomainEvent): Promise<void> {
    try {
      if (!(await this.isConfigured())) return;
      const { appointmentId, fromStatus, toStatus } = event.payload as {
        appointmentId: string;
        fromStatus: string;
        toStatus: string;
      };

      const payload = {
        event: 'appointment.status_changed',
        timestamp: event.occurredAt.toISOString(),
        data: { appointmentId, fromStatus, toStatus },
      } as FyWebhookEvent;
      await this.enqueue(
        payload,
        `fy-status:${appointmentId}:${fromStatus}->${toStatus}:${event.occurredAt.getTime()}`,
      );
    } catch (err) {
      this.logger?.warn({ err }, 'Failed to enqueue fy status_changed webhook');
    }
  }

  private async enqueue(payload: FyWebhookEvent, singletonKey: string): Promise<void> {
    await this.jobQueue.enqueue(FY_WEBHOOK_JOB, payload as unknown as Record<string, unknown>, {
      retryLimit: 5,
      retryBackoff: true,
      singletonKey,
    });
  }
}
