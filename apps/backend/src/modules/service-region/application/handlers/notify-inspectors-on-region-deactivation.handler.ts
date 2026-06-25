import type { DomainEvent } from '../../../../shared/application/events/domain-event-bus';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import type { CreateNotificationUseCase } from '../../../notification/application/use-cases/create-notification.use-case';

export class NotifyInspectorsOnRegionDeactivationHandler {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly createNotification: CreateNotificationUseCase,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const { regionId, tenantId, regionName } = event.payload as {
      regionId: string;
      tenantId: string;
      regionName: string;
    };

    const inspectors = await this.inspectorRepo.findByRegionId(regionId);
    if (inspectors.length === 0) return;

    await Promise.allSettled(
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
  }
}
