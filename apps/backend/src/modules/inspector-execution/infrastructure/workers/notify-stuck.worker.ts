import type { IInspectionExecutionRepository } from '../../domain/inspection-execution.repository';
import type { CreateNotificationUseCase } from '../../../notification/application/use-cases/create-notification.use-case';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { Logger } from '../../../../shared/infrastructure/logger';

const STUCK_THRESHOLD_HOURS = 6;

export class NotifyStuckInspectionsWorker {
  constructor(
    private readonly executionRepo: IInspectionExecutionRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly createNotificationUseCase: CreateNotificationUseCase,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<{ notifiedCount: number }> {
    const stuckExecutions = await this.executionRepo.findStuckExecutions(STUCK_THRESHOLD_HOURS);

    if (stuckExecutions.length === 0) {
      return { notifiedCount: 0 };
    }

    let notifiedCount = 0;
    for (const execution of stuckExecutions) {
      try {
        const appointmentResult = await this.appointmentRepo.findById(execution.appointmentId, null);
        if (!appointmentResult) {
          this.logger.error(
            { appointmentId: execution.appointmentId },
            'Skipping stuck inspection alert because appointment was not found',
          );
          continue;
        }

        await this.createNotificationUseCase.execute({
          tenantId: appointmentResult.appointment.tenantId,
          appointmentId: execution.appointmentId,
          recipient: 'ops@properfy.com.au',
          channel: 'EMAIL',
          templateCode: 'INSPECTION_STUCK_ALERT',
          payloadJson: {
            appointmentId: execution.appointmentId,
            inspectorId: execution.inspectorId,
            startedAt: execution.startedAt.toISOString(),
            hoursStuck: String(STUCK_THRESHOLD_HOURS),
          },
        });
        notifiedCount++;
      } catch (err) {
        this.logger.error(
          { appointmentId: execution.appointmentId, error: err },
          'Failed to send stuck inspection alert',
        );
      }
    }

    this.logger.info({ stuckCount: stuckExecutions.length, notifiedCount }, 'Stuck inspection alerts sent');
    return { notifiedCount };
  }
}
