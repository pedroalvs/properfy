import { buildCompletionReminderDedupeKey, zonedWallTimeToUtc } from '@properfy/shared';
import { civilDateInTimezone, PLATFORM_TIMEZONE } from '../../../../shared/domain/timezone-date';
import type { ITenantTimezoneLookup } from '../../../../shared/application/tenant-timezone';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { ICompletionReminderReader } from '../../domain/completion-reminder.reader';
import type { PublishSystemInspectorNoticeUseCase } from '../../../inspector-notice/application/use-cases/publish-system-inspector-notice.use-case';

export interface SendCompletionRemindersSummary {
  candidates: number;
  sent: number;
  skippedAlreadySent: number;
  skippedBusy: number;
  failed: number;
}

/**
 * Completion reminder (F03, 03.16 / L-F03-03, D22). Run every 15 min: for each
 * SCHEDULED job whose window closed more than `completionReminderMinutesAfterWindowEnd`
 * ago today without a check-out, push an inspector notice (critical → SMS fallback
 * handled by F02). Idempotent per appointment+civil date+inspector via the F02
 * `dedupeKey`. The notice body is safe for the locked screen: service code and
 * property address only — never the tenant's name/phone, key/lockbox codes or the
 * access note.
 */
export class SendCompletionRemindersUseCase {
  constructor(
    private readonly reader: ICompletionReminderReader,
    private readonly platformSettings: IPlatformSettingsReader,
    private readonly tenantTimezoneLookup: ITenantTimezoneLookup,
    private readonly publishNotice: PublishSystemInspectorNoticeUseCase,
    private readonly auditService: AuditService,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<SendCompletionRemindersSummary> {
    const summary: SendCompletionRemindersSummary = {
      candidates: 0,
      sent: 0,
      skippedAlreadySent: 0,
      skippedBusy: 0,
      failed: 0,
    };

    const settings = await this.platformSettings.get('fieldEvents');
    if (!settings.completionReminderEnabled) {
      return summary;
    }
    const delayMinutes = settings.completionReminderMinutesAfterWindowEnd;

    const now = new Date();
    const candidates = await this.reader.findCandidates(now);

    // Narrow to jobs that are actually due today (agency tz) and past the window+delay,
    // and not already finished. Each kept candidate carries its window-end instant.
    const due: Array<{ candidate: (typeof candidates)[number]; windowEndAt: Date; civilDate: string }> = [];
    for (const candidate of candidates) {
      if (candidate.executionState === 'FINISHED') continue;
      const tz =
        (await this.tenantTimezoneLookup.getTenantTimezone(candidate.tenantId)) ?? PLATFORM_TIMEZONE;
      const civilDate = candidate.scheduledDate.toISOString().slice(0, 10);
      if (civilDateInTimezone(now, tz) !== civilDate) continue;
      const windowEndAt = zonedWallTimeToUtc(civilDate, candidate.timeSlotEnd, tz);
      if (now.getTime() < windowEndAt.getTime() + delayMinutes * 60_000) continue;
      due.push({ candidate, windowEndAt, civilDate });
    }
    summary.candidates = due.length;
    if (due.length === 0) {
      this.logSummary(summary);
      return summary;
    }

    // "Busy" suppression: an inspector mid-job elsewhere (another open check-in
    // started AFTER this window closed) should not be nagged about this one.
    const inspectorIds = [...new Set(due.map((d) => d.candidate.inspectorId))];
    const inProgress = await this.reader.findInProgressByInspectorIds(inspectorIds);

    for (const { candidate, windowEndAt, civilDate } of due) {
      const busyElsewhere = inProgress.some(
        (e) =>
          e.inspectorId === candidate.inspectorId &&
          e.appointmentId !== candidate.appointmentId &&
          e.startedAt.getTime() > windowEndAt.getTime(),
      );
      if (busyElsewhere) {
        summary.skippedBusy++;
        continue;
      }

      const variant = candidate.executionState === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'NOT_STARTED';
      const body =
        variant === 'IN_PROGRESS'
          ? `Did you finish ${candidate.appointmentCode} at ${candidate.propertyAddress}? Check out in the app so the job is marked done.`
          : `${candidate.appointmentCode} at ${candidate.propertyAddress} was due by ${candidate.timeSlotEnd}. Check in when you arrive, or tell operations if you can't do it.`;
      const dedupeKey = buildCompletionReminderDedupeKey({
        appointmentId: candidate.appointmentId,
        civilDate,
        inspectorId: candidate.inspectorId,
      });

      try {
        const result = await this.publishNotice.execute({
          type: 'COMPLETION_REMINDER',
          inspectorIds: [candidate.inspectorId],
          title: 'Finish your inspection',
          body,
          dedupeKey,
          targetPath: `/schedule/${candidate.appointmentId}`,
        });
        if (result.created) {
          summary.sent++;
          try {
            this.auditService.log({
              action: 'inspection.completion_reminder_sent',
              actorType: 'SYSTEM',
              entityType: 'Appointment',
              entityId: candidate.appointmentId,
              tenantId: candidate.tenantId,
              metadata: {
                inspectorId: candidate.inspectorId,
                scheduledDate: civilDate,
                minutesAfterWindowEnd: delayMinutes,
                dedupeKey,
                noticeId: result.noticeId,
                variant,
              },
            });
          } catch (error) {
            this.logger.error(
              { err: error, appointmentId: candidate.appointmentId },
              'Failed to audit completion reminder',
            );
          }
        } else {
          summary.skippedAlreadySent++;
        }
      } catch (error) {
        summary.failed++;
        this.logger.error(
          { err: error, appointmentId: candidate.appointmentId },
          'Failed to send completion reminder',
        );
      }
    }

    this.logSummary(summary);
    return summary;
  }

  private logSummary(summary: SendCompletionRemindersSummary): void {
    this.logger.info(summary, 'Completion reminders processed');
  }
}
