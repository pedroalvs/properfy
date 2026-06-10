import { getQueue } from '../shared/infrastructure/queue';
import { metrics } from '../shared/infrastructure/metrics';
import { runWithRequestContext } from '../shared/infrastructure/request-context';
import type { ProcessReportJobUseCase } from '../modules/report/application/use-cases/process-report-job.use-case';
import type { SendNotificationUseCase } from '../modules/notification/application/use-cases/send-notification.use-case';
import type { PollRetryableNotificationsUseCase } from '../modules/notification/application/use-cases/poll-retryable-notifications.use-case';
import type { DispatchRemindersUseCase } from '../modules/notification/application/use-cases/dispatch-reminders.use-case';
import type { DispatchEscalationsUseCase } from '../modules/notification/application/use-cases/dispatch-escalations.use-case';
import type { CleanupSessionsWorker } from '../modules/auth/infrastructure/workers/cleanup-sessions.worker';
import type { KeyExpiryCheckWorker } from '../modules/auth/infrastructure/workers/key-expiry-check.worker';
import type { ExpireFilesWorker } from '../modules/report/infrastructure/workers/expire-files.worker';
import type { ProcessSchedulesWorker } from '../modules/report/infrastructure/workers/process-schedules.worker';
import type { GeocodeWorker } from '../modules/property/infrastructure/workers/geocode.worker';
import type { GeocodeRetryWorker } from '../modules/property/infrastructure/workers/geocode-retry.worker';
import type { ImportPropertyWorker } from '../modules/property/infrastructure/workers/import-property.worker';
import type { AppointmentImportWorker } from '../modules/appointment/infrastructure/workers/import.worker';
import type { GenerateInvoiceFileWorker } from '../modules/billing/infrastructure/workers/generate-invoice-file.worker';
import type { ExpireTokensWorker } from '../modules/tenant-portal/infrastructure/workers/expire-tokens.worker';
import type { ExpireAssetsWorker } from '../modules/inspector-execution/infrastructure/workers/expire-assets.worker';
import type { NotifyStuckInspectionsWorker } from '../modules/inspector-execution/infrastructure/workers/notify-stuck.worker';
import type { ExpirePriorityWorker } from '../modules/service-group/infrastructure/workers/expire-priority.worker';
import type { AuditRetentionWorker } from '../modules/audit/infrastructure/workers/audit-retention.worker';
import type { RejectUnconfirmedWorker } from '../modules/appointment/infrastructure/workers/reject-unconfirmed.worker';
import type { Logger } from '../shared/infrastructure/logger';
import { DlqMonitor } from '../shared/infrastructure/dlq-monitor';
import { prisma } from '../shared/infrastructure/prisma';

function withJobMetrics<T extends { id: string; data: Record<string, unknown> }>(
  queue: string,
  handler: (job: T) => Promise<void>,
): (job: T) => Promise<void> {
  return async (job: T) => {
    const requestId = (job.data?._requestId as string | undefined) ?? crypto.randomUUID();
    const start = performance.now();
    await runWithRequestContext({ requestId }, async () => {
      try {
        await handler(job);
        metrics.jobExecuted(queue, 'success', performance.now() - start);
      } catch (err) {
        metrics.jobExecuted(queue, 'failure', performance.now() - start);
        throw err;
      }
    });
  };
}

export async function registerWorkers(
  processReportJobUseCase: ProcessReportJobUseCase,
  sendNotificationUseCase: SendNotificationUseCase,
  pollRetryableNotificationsUseCase: PollRetryableNotificationsUseCase,
  dispatchRemindersUseCase: DispatchRemindersUseCase,
  dispatchEscalationsUseCase: DispatchEscalationsUseCase,
  cleanupSessionsWorker: CleanupSessionsWorker,
  keyExpiryCheckWorker: KeyExpiryCheckWorker,
  expireFilesWorker: ExpireFilesWorker,
  processSchedulesWorker: ProcessSchedulesWorker,
  geocodeWorker: GeocodeWorker,
  geocodeRetryWorker: GeocodeRetryWorker,
  propertyImportWorker: ImportPropertyWorker,
  appointmentImportWorker: AppointmentImportWorker,
  generateInvoiceFileWorker: GenerateInvoiceFileWorker,
  expireTokensWorker: ExpireTokensWorker,
  expireAssetsWorker: ExpireAssetsWorker,
  notifyStuckInspectionsWorker: NotifyStuckInspectionsWorker,
  expirePriorityWorker: ExpirePriorityWorker,
  auditRetentionWorker: AuditRetentionWorker,
  rejectUnconfirmedWorker: RejectUnconfirmedWorker,
  logger: Logger,
): Promise<void> {
  const boss = await getQueue();

  await boss.work('report.generate', withJobMetrics('report.generate', async (job) => {
    const { reportId } = job.data as { reportId: string };
    logger.info({ reportId, jobId: job.id }, 'Processing report.generate job');
    await processReportJobUseCase.execute(reportId);
  }));

  await boss.work('notification.send', withJobMetrics('notification.send', async (job) => {
    const { notificationId } = job.data as { notificationId: string };
    logger.info({ notificationId, jobId: job.id }, 'Processing notification.send job');
    await sendNotificationUseCase.execute({ notificationId });
  }));
  logger.info({}, 'worker.notification_send.registered');

  // notification.retry-poll is the SOLE retry motor for failed/pending notifications.
  // SendNotificationUseCase sets notification.nextRetryAt in the DB on transient failure;
  // this cron (every 5 min) polls for due rows and re-enqueues them as notification.send jobs.
  // There is NO competing self-reschedule mechanism — this cron is authoritative.
  await boss.schedule('notification.retry-poll', '*/5 * * * *', {});
  await boss.work('notification.retry-poll', withJobMetrics('notification.retry-poll', async (job) => {
    logger.info({ jobId: job.id }, 'Processing notification.retry-poll job');
    const result = await pollRetryableNotificationsUseCase.execute();
    logger.info(
      {
        jobId: job.id,
        enqueuedCount: result.enqueuedCount,
        stuckReenqueuedCount: result.stuckReenqueuedCount,
        stuckFailedCount: result.stuckFailedCount,
      },
      'Retry poll completed',
    );
  }));

  await boss.schedule('notification.dispatch-reminders', '0 8 * * *', {});
  await boss.work('notification.dispatch-reminders', withJobMetrics('notification.dispatch-reminders', async (job) => {
    logger.info({ jobId: job.id }, 'Processing notification.dispatch-reminders job');
    const result = await dispatchRemindersUseCase.execute(new Date());
    logger.info({ jobId: job.id, dispatched: result.dispatched, skipped: result.skipped }, 'Dispatch reminders completed');
  }));

  await boss.schedule('notification.dispatch-escalations', '0 8 * * *', {});
  await boss.work('notification.dispatch-escalations', withJobMetrics('notification.dispatch-escalations', async (job) => {
    logger.info({ jobId: job.id }, 'Processing notification.dispatch-escalations job');
    const result = await dispatchEscalationsUseCase.execute(new Date());
    logger.info({ jobId: job.id, pmEscalations: result.pmEscalations, smsAlerts: result.smsAlerts, skipped: result.skipped }, 'Dispatch escalations completed');
  }));

  await boss.schedule('auth.cleanup-sessions', '0 2 * * *', {});
  await boss.work('auth.cleanup-sessions', withJobMetrics('auth.cleanup-sessions', async (job) => {
    logger.info({ jobId: job.id }, 'Processing auth.cleanup-sessions job');
    const result = await cleanupSessionsWorker.execute();
    logger.info({ jobId: job.id, deletedCount: result.deletedCount }, 'Session cleanup completed');
  }));

  await boss.schedule('auth.check-key-expiry', '0 3 * * *', {});
  await boss.work('auth.check-key-expiry', withJobMetrics('auth.check-key-expiry', async (job) => {
    logger.info({ jobId: job.id }, 'Processing auth.check-key-expiry job');
    const result = keyExpiryCheckWorker.execute();
    logger.info({ jobId: job.id, daysRemaining: result.daysRemaining, level: result.level }, 'Key expiry check completed');
  }));

  await boss.schedule('report.expire-files', '0 3 * * *', {});
  await boss.work('report.expire-files', withJobMetrics('report.expire-files', async (job) => {
    logger.info({ jobId: job.id }, 'Processing report.expire-files job');
    const result = await expireFilesWorker.execute();
    logger.info({ jobId: job.id, expiredCount: result.expiredCount }, 'Report file expiry completed');
  }));

  await boss.schedule('report.process-schedules', '*/15 * * * *', {});
  await boss.work('report.process-schedules', withJobMetrics('report.process-schedules', async (job) => {
    logger.info({ jobId: job.id }, 'Processing report.process-schedules job');
    const result = await processSchedulesWorker.execute();
    logger.info({ jobId: job.id, processedCount: result.processedCount, failedCount: result.failedCount }, 'Scheduled report processing completed');
  }));

  await boss.work('property.geocode', withJobMetrics('property.geocode', async (job) => {
    const { propertyId } = job.data as { propertyId: string };
    logger.info({ propertyId, jobId: job.id }, 'Processing property.geocode job');
    await geocodeWorker.execute({ propertyId });
  }));

  // Every 15 min: re-enqueues FAILED (24h cool-off) AND self-heals stale PENDING properties
  // whose enqueue was lost. The frequent cadence keeps a lost-enqueue property's wait bounded.
  await boss.schedule('property.geocode-retry', '*/15 * * * *', {});
  await boss.work('property.geocode-retry', withJobMetrics('property.geocode-retry', async (job) => {
    logger.info({ jobId: job.id }, 'Processing property.geocode-retry job');
    const result = await geocodeRetryWorker.execute();
    logger.info({ jobId: job.id, reenqueuedCount: result.reenqueuedCount, pendingReenqueuedCount: result.pendingReenqueuedCount, failedGeocodingCount: result.failedGeocodingCount }, 'Geocode retry sweep completed');
  }));

  await boss.work('appointment.import', withJobMetrics('appointment.import', async (job) => {
    const { importId } = job.data as { importId: string };
    logger.info({ importId, jobId: job.id }, 'Processing appointment.import job');
    await appointmentImportWorker.execute({ importId });
  }));

  await boss.work('property.import', withJobMetrics('property.import', async (job) => {
    const { importId } = job.data as { importId: string };
    logger.info({ importId, jobId: job.id }, 'Processing property.import job');
    await propertyImportWorker.execute({ importId });
  }));

  await boss.work('billing.generate-invoice-file', withJobMetrics('billing.generate-invoice-file', async (job) => {
    const { invoiceId } = job.data as { invoiceId: string };
    logger.info({ invoiceId, jobId: job.id }, 'Processing billing.generate-invoice-file job');
    await generateInvoiceFileWorker.execute({ invoiceId });
  }));

  await boss.schedule('tenant-portal.expire-tokens', '*/15 * * * *', {});
  await boss.work('tenant-portal.expire-tokens', withJobMetrics('tenant-portal.expire-tokens', async (job) => {
    logger.info({ jobId: job.id }, 'Processing tenant-portal.expire-tokens job');
    const result = await expireTokensWorker.execute();
    logger.info({ jobId: job.id, expiredCount: result.expiredCount }, 'Token expiry completed');
  }));

  await boss.schedule('inspection-execution.mark-assets-expired', '*/5 * * * *', {});
  await boss.work('inspection-execution.mark-assets-expired', withJobMetrics('inspection-execution.mark-assets-expired', async (job) => {
    logger.info({ jobId: job.id }, 'Processing inspection-execution.mark-assets-expired job');
    const result = await expireAssetsWorker.execute();
    logger.info({ jobId: job.id, expiredCount: result.expiredCount }, 'Asset expiry completed');
  }));

  await boss.schedule('inspection-execution.notify-not-started', '0 * * * *', {});
  await boss.work('inspection-execution.notify-not-started', withJobMetrics('inspection-execution.notify-not-started', async (job) => {
    logger.info({ jobId: job.id }, 'Processing inspection-execution.notify-not-started job');
    const result = await notifyStuckInspectionsWorker.execute();
    logger.info({ jobId: job.id, notifiedCount: result.notifiedCount }, 'Stuck inspection alerts completed');
  }));

  await boss.schedule('service_group.expire-priority', '0 * * * *', {});
  await boss.work('service_group.expire-priority', withJobMetrics('service_group.expire-priority', async (job) => {
    logger.info({ jobId: job.id }, 'Processing service_group.expire-priority job');
    const result = await expirePriorityWorker.execute();
    logger.info({ jobId: job.id, expiredCount: result.expiredCount }, 'Priority expiry sweep completed');
  }));

  // Audit log retention — daily at 03:30 UTC (off-peak)
  await boss.schedule('audit.retention', '30 3 * * *', {});
  await boss.work('audit.retention', withJobMetrics('audit.retention', async (job) => {
    logger.info({ jobId: job.id }, 'Processing audit.retention job');
    const result = await auditRetentionWorker.execute();
    logger.info(
      {
        jobId: job.id,
        movedCount: result.movedCount,
        preservedCount: result.preservedCount,
        hardDeletedCount: result.hardDeletedCount,
        skippedInProgressCount: result.skippedInProgressCount,
        tenantPortalMovedCount: result.tenantPortalMovedCount,
        erroredCount: result.erroredCount,
      },
      'Audit retention sweep completed',
    );
  }));

  // Reject unconfirmed appointments — daily at 09:00 UTC (19:00 AEST)
  await boss.schedule('appointment.reject-unconfirmed', '0 9 * * *', {});
  await boss.work('appointment.reject-unconfirmed', withJobMetrics('appointment.reject-unconfirmed', async (job) => {
    logger.info({ jobId: job.id }, 'Processing appointment.reject-unconfirmed job');
    const result = await rejectUnconfirmedWorker.execute();
    logger.info(
      {
        jobId: job.id,
        rejectedCount: result.rejectedCount,
        groupsClosedCount: result.groupsClosedCount,
        groupsUpdatedCount: result.groupsUpdatedCount,
      },
      'Unconfirmed appointment rejection completed',
    );
  }));

  // DLQ monitor — alert on accumulated failed jobs
  const dlqMonitor = new DlqMonitor(prisma, logger, { threshold: 10 });
  await boss.schedule('system.dlq-monitor', '*/5 * * * *', {});
  await boss.work('system.dlq-monitor', withJobMetrics('system.dlq-monitor', async (job) => {
    logger.info({ jobId: job.id }, 'Processing system.dlq-monitor job');
    const result = await dlqMonitor.execute();
    logger.info({ jobId: job.id, alertedQueues: result.alertedQueues }, 'DLQ monitor completed');
  }));

  logger.info('pg-boss workers registered: report.generate, report.expire-files, report.process-schedules, notification.send, notification.retry-poll, notification.dispatch-reminders, notification.dispatch-escalations, auth.cleanup-sessions, auth.check-key-expiry, property.geocode, property.geocode-retry, appointment.import, property.import, billing.generate-invoice-file, tenant-portal.expire-tokens, inspection-execution.mark-assets-expired, inspection-execution.notify-not-started, service_group.expire-priority, audit.retention, appointment.reject-unconfirmed, system.dlq-monitor');

  // On startup: re-enqueue geocoding for all PENDING/FAILED properties that have no coordinates
  const pendingProperties = await prisma.property.findMany({
    where: {
      geocoding_status: { in: ['PENDING', 'FAILED'] },
      lat: null,
      deleted_at: null,
    },
    select: { id: true },
  });
  if (pendingProperties.length > 0) {
    let enqueued = 0;
    for (const p of pendingProperties) {
      try {
        await boss.send('property.geocode', { propertyId: p.id }, { retryLimit: 3, retryBackoff: true });
        enqueued++;
      } catch {
        // Skip if already enqueued
      }
    }
    logger.info({ total: pendingProperties.length, enqueued }, 'Re-enqueued geocoding for properties with pending/failed status');
  }
}
