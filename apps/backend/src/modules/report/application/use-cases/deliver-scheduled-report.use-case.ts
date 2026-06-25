import type { IScheduledReportRepository } from '../../domain/scheduled-report.repository';
import type { IScheduledReportRunRepository } from '../../domain/scheduled-report-run.repository';
import type { IReportRepository } from '../../domain/report.repository';
import type { IScheduleRecipientResolver } from '../../domain/schedule-recipient-resolver';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { DeliveryOutcome } from '../../domain/scheduled-report-run.entity';
import {
  ScheduleRunNotFoundError,
  ScheduledReportNotFoundError,
} from '../../domain/report.errors';
import { ReportNotFoundError } from '../../domain/report.errors';

export interface NotificationSender {
  execute(input: {
    tenantId: string;
    recipient: string;
    channel: 'EMAIL' | 'SMS';
    templateCode: string;
    payloadJson: Record<string, string>;
  }): Promise<{ notificationId: string }>;
}

export interface DeliverScheduledReportInput {
  runId: string;
}

/**
 * Feature 019 US3: delivery fan-out.
 *
 * Invoked from `ProcessReportJobUseCase` after a scheduled report is marked
 * READY. Resolves the recipient list per the schedule's delivery mode, applies
 * the skip-when-empty toggle, dispatches one `REPORT_READY` notification per
 * valid recipient via `CreateNotificationUseCase`, and records the per-recipient
 * outcome in `delivery_status_json` on the run.
 *
 * Audit: one entry per run (not per recipient) — per-recipient outcome lives in
 * `delivery_status_json`.
 */
export class DeliverScheduledReportUseCase {
  constructor(
    private readonly scheduleRepo: IScheduledReportRepository,
    private readonly runRepo: IScheduledReportRunRepository,
    private readonly reportRepo: IReportRepository,
    private readonly recipientResolver: IScheduleRecipientResolver,
    private readonly notificationSender: NotificationSender,
    private readonly auditService: AuditService,
    private readonly logger: Logger,
  ) {}

  async execute(input: DeliverScheduledReportInput): Promise<void> {
    const run = await this.runRepo.findById(input.runId);
    if (!run) {
      throw new ScheduleRunNotFoundError();
    }
    if (!run.reportId) {
      throw new ReportNotFoundError();
    }

    const report = await this.reportRepo.findById(run.reportId);
    if (!report) {
      throw new ReportNotFoundError();
    }

    const schedule = await this.scheduleRepo.findByIdIncludingDeleted(run.scheduleId);
    if (!schedule) {
      throw new ScheduledReportNotFoundError();
    }

    // Skip-delivery-when-empty toggle
    if (schedule.skipDeliveryWhenEmpty && (report.rowCount ?? 0) === 0) {
      run.markSkippedEmpty(new Date());
      await this.runRepo.update(run);
      this.auditService.log({
        tenantId: schedule.tenantId,
        actorType: 'SYSTEM',
        entityType: 'ScheduledReportRun',
        entityId: run.id,
        action: 'scheduledReportRunSkippedEmpty',
        metadata: { scheduleId: schedule.id, reportId: report.id },
      });
      return;
    }

    // Resolve recipient list
    const recipients = await this.recipientResolver.resolve(schedule, report);

    // Dispatch one notification per valid recipient
    const outcomes: DeliveryOutcome[] = [];
    const downloadLink = `/reports/${report.id}`;

    for (const recipient of recipients) {
      if (!recipient.accessValid || !recipient.email) {
        outcomes.push({
          userId: recipient.userId,
          email: recipient.email ?? '',
          status: 'skipped',
          reason: recipient.skipReason,
        });
        continue;
      }

      try {
        const result = await this.notificationSender.execute({
          tenantId: schedule.tenantId,
          recipient: recipient.email,
          channel: 'EMAIL',
          templateCode: 'REPORT_READY',
          payloadJson: {
            userName: recipient.name ?? '',
            reportType: report.reportType,
            reportId: report.id,
            downloadLink,
          },
        });
        outcomes.push({
          userId: recipient.userId,
          email: recipient.email,
          status: 'delivered',
          notificationId: result.notificationId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        outcomes.push({
          userId: recipient.userId,
          email: recipient.email,
          status: 'failed',
          reason: message,
        });
        this.logger.error(
          { scheduleId: schedule.id, runId: run.id, userId: recipient.userId, error },
          'scheduled-report delivery failed for recipient',
        );
      }
    }

    const delivered = outcomes.filter((o) => o.status === 'delivered').length;
    const now = new Date();

    if (delivered > 0) {
      run.markCompleted(now, delivered, outcomes);
      this.auditService.log({
        tenantId: schedule.tenantId,
        actorType: 'SYSTEM',
        entityType: 'ScheduledReportRun',
        entityId: run.id,
        action: 'scheduledReportRunCompleted',
        metadata: {
          scheduleId: schedule.id,
          reportId: report.id,
          recipientCount: delivered,
          totalRecipients: outcomes.length,
        },
      });
    } else {
      run.markFailed(now, 'no recipients received the report', outcomes);
      this.auditService.log({
        tenantId: schedule.tenantId,
        actorType: 'SYSTEM',
        entityType: 'ScheduledReportRun',
        entityId: run.id,
        action: 'scheduledReportRunFailed',
        metadata: {
          scheduleId: schedule.id,
          reportId: report.id,
          reason: 'no recipients received the report',
          totalRecipients: outcomes.length,
        },
      });
    }

    await this.runRepo.update(run);
  }
}
