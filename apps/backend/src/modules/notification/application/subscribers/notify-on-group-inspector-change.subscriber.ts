import { formatCivilDate, formatWallTimeWindow } from '@properfy/shared';
import type {
  DomainEvent,
  DomainEventBus,
} from '../../../../shared/application/events/domain-event-bus';
import { SERVICE_GROUP_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import type { IServiceGroupRepository } from '../../../service-group/domain/service-group.repository';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import type { CreateNotificationUseCase } from '../use-cases/create-notification.use-case';

interface Logger {
  warn(obj: unknown, msg?: string): void;
}

/**
 * Keeps inspectors informed when an operator moves a group under them.
 *
 * Both flows write member appointments in bulk, bypassing
 * ExecuteStatusTransitionUseCase, so nothing else would tell either inspector
 * that their schedule changed — the outgoing one would simply watch the jobs
 * vanish from the app.
 */
export class NotifyOnGroupInspectorChangeSubscriber {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly inspectorRepo: IInspectorRepository,
    private readonly createNotification: CreateNotificationUseCase,
    private readonly logger?: Logger,
  ) {}

  register(eventBus: DomainEventBus): void {
    eventBus.subscribe(SERVICE_GROUP_EVENTS.INSPECTOR_CHANGED, (event) =>
      this.onInspectorChanged(event),
    );
    eventBus.subscribe(SERVICE_GROUP_EVENTS.SCHEDULE_CHANGED, (event) =>
      this.onScheduleChanged(event),
    );
  }

  private async onInspectorChanged(event: DomainEvent): Promise<void> {
    try {
      const { groupId, inspectorId, previousInspectorId } = event.payload as {
        groupId: string;
        inspectorId: string;
        previousInspectorId: string | null;
      };

      const context = await this.loadContext(groupId);
      if (!context) return;

      await this.notify(context, inspectorId, 'INSPECTOR_GROUP_ASSIGNED', groupId);
      if (previousInspectorId && previousInspectorId !== inspectorId) {
        await this.notify(context, previousInspectorId, 'INSPECTOR_GROUP_UNASSIGNED', groupId);
      }
    } catch (err) {
      this.logger?.warn({ err, eventType: event.type }, 'Group inspector-change notification failed');
    }
  }

  private async onScheduleChanged(event: DomainEvent): Promise<void> {
    try {
      const { groupId, inspectorId, previousScheduledDate, previousTimeWindow } = event.payload as {
        groupId: string;
        inspectorId: string | null;
        previousScheduledDate?: string;
        previousTimeWindow?: string;
      };

      // Nobody has committed to an unassigned group, so there is nobody to warn.
      if (!inspectorId) return;

      const context = await this.loadContext(groupId);
      if (!context) return;

      await this.notify(context, inspectorId, 'INSPECTOR_GROUP_RESCHEDULED', groupId, {
        previousScheduledDate: previousScheduledDate ?? '',
        previousTimeWindow: previousTimeWindow ?? '',
      });
    } catch (err) {
      this.logger?.warn({ err, eventType: event.type }, 'Group reschedule notification failed');
    }
  }

  /**
   * Re-queries post-commit state and resolves the agency the notification is
   * billed to. Groups are tenant-agnostic, so a cross-agency group has no
   * `primaryTenantId` — fall back to any member's agency, because
   * `CreateNotificationUseCase` rejects a blank tenant outright.
   */
  private async loadContext(groupId: string) {
    const result = await this.serviceGroupRepo.findById(groupId, null);
    if (!result) return null;

    const tenantId = result.primaryTenantId ?? result.tenantIds[0];
    if (!tenantId) {
      this.logger?.warn({ groupId }, 'Skipping inspector notification: group has no member agency');
      return null;
    }

    return {
      tenantId,
      groupCode: String(result.group.groupNumber),
      // Rendered straight into the inspector's email/SMS body, so these carry the
      // same display format the rental tenant sees rather than raw ISO.
      scheduledDate: formatCivilDate(result.group.scheduledDate),
      timeWindow: formatWallTimeWindow(result.group.timeWindow),
      jobCount: String(result.appointments.length),
    };
  }

  private async notify(
    context: { tenantId: string; groupCode: string; scheduledDate: string; timeWindow: string; jobCount: string },
    inspectorId: string,
    templateCode: string,
    groupId: string,
    extraPayload: Record<string, string> = {},
  ): Promise<void> {
    // Per-recipient isolation: failing to reach one inspector must not stop the
    // other from learning their schedule changed.
    try {
      const inspector = await this.inspectorRepo.findById(inspectorId);
      if (!inspector?.email) return;

      await this.createNotification.execute({
        tenantId: context.tenantId,
        recipient: inspector.email,
        channel: 'EMAIL',
        templateCode,
        payloadJson: {
          inspectorName: inspector.name,
          groupCode: context.groupCode,
          scheduledDate: context.scheduledDate,
          timeWindow: context.timeWindow,
          jobCount: context.jobCount,
          ...extraPayload,
        },
      });
    } catch (err) {
      this.logger?.warn({ err, inspectorId, groupId, templateCode }, 'Failed to notify inspector');
    }
  }
}
