import type { IInspectionExecutionRepository } from '../../domain/inspection-execution.repository';
import type { INotificationRepository } from '../../../notification/domain/notification.repository';
import type { CreateNotificationUseCase } from '../../../notification/application/use-cases/create-notification.use-case';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { Logger } from '../../../../shared/infrastructure/logger';

const STUCK_THRESHOLD_HOURS = 6;

/** One alert per execution per cool-off window — the cron runs hourly, alerting hourly is noise. */
const ALERT_COOLOFF_HOURS = 24;

/** Executions stuck longer than this stop alerting entirely (zombie rows, e.g. stale demo data). */
const ALERT_MAX_AGE_DAYS = 7;

/**
 * Payload contract for the INSPECTION_STUCK_ALERT template. The platform seed
 * template may only use these variables (asserted by
 * platform-notification-templates.test.ts); the payload literal below is typed
 * against this list so adding/removing a key here is a compile-time error.
 */
export const STUCK_ALERT_PAYLOAD_KEYS = [
  'appointmentId',
  'inspectorId',
  'startedAt',
  'hoursStuck',
] as const;

type StuckAlertPayload = Record<(typeof STUCK_ALERT_PAYLOAD_KEYS)[number], string>;

export class NotifyStuckInspectionsWorker {
  constructor(
    private readonly executionRepo: IInspectionExecutionRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly notificationRepo: INotificationRepository,
    private readonly createNotificationUseCase: CreateNotificationUseCase,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<{ notifiedCount: number }> {
    const stuckExecutions = await this.executionRepo.findStuckExecutions(STUCK_THRESHOLD_HOURS);

    if (stuckExecutions.length === 0) {
      return { notifiedCount: 0 };
    }

    const now = Date.now();
    const maxAgeCutoff = new Date(now - ALERT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
    const coolOffStart = new Date(now - ALERT_COOLOFF_HOURS * 60 * 60 * 1000);

    let notifiedCount = 0;
    let skippedTooOld = 0;
    let skippedNotScheduled = 0;
    let skippedCoolOff = 0;

    for (const execution of stuckExecutions) {
      try {
        if (execution.startedAt < maxAgeCutoff) {
          skippedTooOld++;
          continue;
        }

        const appointmentResult = await this.appointmentRepo.findById(execution.appointmentId, null);
        if (!appointmentResult) {
          this.logger.error(
            { appointmentId: execution.appointmentId },
            'Skipping stuck inspection alert because appointment was not found',
          );
          continue;
        }
        if (appointmentResult.appointment.status !== 'SCHEDULED') {
          skippedNotScheduled++;
          continue;
        }

        const recentAlerts = await this.notificationRepo.count({
          appointmentId: execution.appointmentId,
          templateCode: 'INSPECTION_STUCK_ALERT',
          fromDate: coolOffStart.toISOString(),
        });
        if (recentAlerts > 0) {
          skippedCoolOff++;
          continue;
        }

        const payloadJson: StuckAlertPayload = {
          appointmentId: execution.appointmentId,
          inspectorId: execution.inspectorId,
          startedAt: execution.startedAt.toISOString(),
          hoursStuck: String(STUCK_THRESHOLD_HOURS),
        };
        await this.createNotificationUseCase.execute({
          tenantId: appointmentResult.appointment.tenantId,
          appointmentId: execution.appointmentId,
          recipient: 'ops@properfy.com.au',
          channel: 'EMAIL',
          templateCode: 'INSPECTION_STUCK_ALERT',
          payloadJson,
        });
        notifiedCount++;
      } catch (err) {
        this.logger.error(
          { appointmentId: execution.appointmentId, error: err },
          'Failed to send stuck inspection alert',
        );
      }
    }

    this.logger.info(
      {
        stuckCount: stuckExecutions.length,
        notifiedCount,
        skippedTooOld,
        skippedNotScheduled,
        skippedCoolOff,
      },
      'Stuck inspection alerts sent',
    );
    return { notifiedCount };
  }
}
