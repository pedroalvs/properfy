import type { PrismaClient } from '@prisma/client';
import type { Logger } from './logger';

interface DlqMonitorOptions {
  threshold: number;
  /** pg-boss schema to inspect — must match the schema the queue runs on. */
  schema?: string;
}

interface QueueFailureCount {
  queue: string;
  count: number;
}

const SAFE_SCHEMA_RE = /^[a-z_][a-z0-9_]*$/;

export class DlqMonitor {
  private readonly threshold: number;
  private readonly schema: string;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
    options: DlqMonitorOptions = { threshold: 10 },
  ) {
    this.threshold = options.threshold;
    const schema = options.schema ?? 'pgboss';
    if (!SAFE_SCHEMA_RE.test(schema)) {
      throw new Error(`Invalid pg-boss schema for DlqMonitor: "${schema}"`);
    }
    this.schema = schema;
  }

  async execute(): Promise<{ alertedQueues: number }> {
    // schema is validated against SAFE_SCHEMA_RE in the constructor, so this
    // interpolation is injection-safe.
    const results = await this.prisma.$queryRawUnsafe<QueueFailureCount[]>(
      `SELECT name AS queue, count(*)::int AS count FROM ${this.schema}.job WHERE state = 'failed' GROUP BY name`,
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
