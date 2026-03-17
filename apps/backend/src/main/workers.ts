import { getQueue } from '../shared/infrastructure/queue';
import type { ProcessReportJobUseCase } from '../modules/report/application/use-cases/process-report-job.use-case';
import type { SendNotificationUseCase } from '../modules/notification/application/use-cases/send-notification.use-case';
import type { PollRetryableNotificationsUseCase } from '../modules/notification/application/use-cases/poll-retryable-notifications.use-case';
import type { DispatchRemindersUseCase } from '../modules/notification/application/use-cases/dispatch-reminders.use-case';
import type { DispatchEscalationsUseCase } from '../modules/notification/application/use-cases/dispatch-escalations.use-case';
import type { Logger } from '../shared/infrastructure/logger';

export async function registerWorkers(
  processReportJobUseCase: ProcessReportJobUseCase,
  sendNotificationUseCase: SendNotificationUseCase,
  pollRetryableNotificationsUseCase: PollRetryableNotificationsUseCase,
  dispatchRemindersUseCase: DispatchRemindersUseCase,
  dispatchEscalationsUseCase: DispatchEscalationsUseCase,
  logger: Logger,
): Promise<void> {
  const boss = await getQueue();

  await boss.work('report.generate', async (job) => {
    const { reportId } = job.data as { reportId: string };
    logger.info({ reportId, jobId: job.id }, 'Processing report.generate job');
    await processReportJobUseCase.execute(reportId);
  });

  await boss.work('notification.send', async (job) => {
    const { notificationId } = job.data as { notificationId: string };
    logger.info({ notificationId, jobId: job.id }, 'Processing notification.send job');
    await sendNotificationUseCase.execute({ notificationId });
  });

  await boss.schedule('notification.retry-poll', '*/5 * * * *', {});
  await boss.work('notification.retry-poll', async (job) => {
    logger.info({ jobId: job.id }, 'Processing notification.retry-poll job');
    const result = await pollRetryableNotificationsUseCase.execute();
    logger.info({ jobId: job.id, enqueuedCount: result.enqueuedCount }, 'Retry poll completed');
  });

  await boss.schedule('notification.dispatch-reminders', '0 8 * * *', {});
  await boss.work('notification.dispatch-reminders', async (job) => {
    logger.info({ jobId: job.id }, 'Processing notification.dispatch-reminders job');
    const result = await dispatchRemindersUseCase.execute(new Date());
    logger.info({ jobId: job.id, dispatched: result.dispatched, skipped: result.skipped }, 'Dispatch reminders completed');
  });

  await boss.schedule('notification.dispatch-escalations', '0 8 * * *', {});
  await boss.work('notification.dispatch-escalations', async (job) => {
    logger.info({ jobId: job.id }, 'Processing notification.dispatch-escalations job');
    const result = await dispatchEscalationsUseCase.execute(new Date());
    logger.info({ jobId: job.id, pmEscalations: result.pmEscalations, smsAlerts: result.smsAlerts, skipped: result.skipped }, 'Dispatch escalations completed');
  });

  logger.info('pg-boss workers registered: report.generate, notification.send, notification.retry-poll, notification.dispatch-reminders, notification.dispatch-escalations');
}
