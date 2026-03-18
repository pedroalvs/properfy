import type { PrismaClient } from '@prisma/client';
import type { Logger } from './logger';

interface DlqMonitorOptions {
  threshold: number;
}

interface QueueFailureCount {
  queue: string;
  count: number;
}

export class DlqMonitor {
  private readonly threshold: number;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
    options: DlqMonitorOptions = { threshold: 10 },
  ) {
    this.threshold = options.threshold;
  }

  async execute(): Promise<{ alertedQueues: number }> {
    const results = await this.prisma.$queryRawUnsafe<QueueFailureCount[]>(
      `SELECT name AS queue, count(*)::int AS count FROM pgboss.job WHERE state = 'failed' GROUP BY name`,
    );

    let alertedQueues = 0;

    for (const row of results) {
      if (row.count >= this.threshold) {
        this.logger.error(
          { queue: row.queue, failedCount: row.count, threshold: this.threshold },
          `DLQ alert: queue "${row.queue}" has ${row.count} failed jobs (threshold: ${this.threshold})`,
        );
        alertedQueues++;
      } else if (row.count > 0) {
        this.logger.warn(
          { queue: row.queue, failedCount: row.count },
          `DLQ: queue "${row.queue}" has ${row.count} failed jobs`,
        );
      }
    }

    if (alertedQueues === 0) {
      this.logger.info('DLQ monitor: no queues above alert threshold');
    }

    return { alertedQueues };
  }
}
