import { getQueue } from '../shared/infrastructure/queue';
import type { ProcessReportJobUseCase } from '../modules/report/application/use-cases/process-report-job.use-case';
import type { Logger } from '../shared/infrastructure/logger';

export async function registerWorkers(
  processReportJobUseCase: ProcessReportJobUseCase,
  logger: Logger,
): Promise<void> {
  const boss = await getQueue();

  await boss.work('report.generate', async (job) => {
    const { reportId } = job.data as { reportId: string };
    logger.info({ reportId, jobId: job.id }, 'Processing report.generate job');
    await processReportJobUseCase.execute(reportId);
  });

  logger.info('pg-boss workers registered: report.generate');
}
