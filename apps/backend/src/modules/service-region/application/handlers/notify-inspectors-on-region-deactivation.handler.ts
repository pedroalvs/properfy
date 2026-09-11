import type { DomainEvent } from '../../../../shared/application/events/domain-event-bus';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import type { CreateNotificationUseCase } from '../../../notification/application/use-cases/create-notification.use-case';

export class NotifyInspectorsOnRegionDeactivationHandler {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly createNotification: CreateNotificationUseCase,
    private readonly logger?: Logger,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const { regionId, tenantId, regionName } = event.payload as {
      regionId: string;
      tenantId: string;
      regionName: string;
    };

    const inspectors = await this.inspectorRepo.findByRegionId(regionId);
    if (inspectors.length === 0) return;

    // Each createNotification.execute persists a Notification row and enqueues a
    // durable pg-boss send job, so a delivery hiccup already retries. What was
    // being swallowed here is the failure to even create/enqueue (e.g. a DB
    // error): allSettled kept the region deactivation from failing but left
    // those inspectors silently un-notified. Log every rejection with enough
    // context to reconcile them (#611).
    const results = await Promise.allSettled(
      inspectors.map((inspector) =>
        this.createNotification.execute({
          tenantId,
          recipient: inspector.email,
          channel: 'EMAIL',
          templateCode: 'REGION_DEACTIVATED',
          payloadJson: {
            inspectorName: inspector.name,
            regionName,
          },
        }),
      ),
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const inspector = inspectors[index]!;
        this.logger?.error(
          {
            event: event.type,
            regionId,
            tenantId,
            inspectorId: inspector.id,
            recipient: inspector.email,
            err: result.reason,
          },
          'Failed to enqueue region-deactivation notification for inspector',
        );
      }
    });
  }
}
