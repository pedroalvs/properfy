import PgBoss from 'pg-boss';
import { getRequestId } from './request-context';

let bossPromise: Promise<PgBoss> | null = null;

export async function getQueue(): Promise<PgBoss> {
  if (!bossPromise) {
    bossPromise = (async () => {
      const connectionString = process.env['DATABASE_URL'];
      if (!connectionString) {
        throw new Error('DATABASE_URL environment variable is required');
      }
      const b = new PgBoss({
        connectionString,
        retryLimit: 6,
        retryBackoff: true,
        deleteAfterDays: 30,
      });
      await b.start();
      return b;
    })();
  }
  return bossPromise;
}

export async function stopQueue(): Promise<void> {
  if (bossPromise) {
    const b = await bossPromise;
    await b.stop();
    bossPromise = null;
  }
}

export async function sendJob<T extends object>(
  name: string,
  data: T,
  options?: PgBoss.SendOptions,
): Promise<string | null> {
  const q = await getQueue();
  const requestId = getRequestId();
  const enrichedData = requestId ? { ...data, _requestId: requestId } : data;
  if (options) {
    return q.send(name, enrichedData, options);
  }
  return q.send(name, enrichedData);
}

export async function scheduleJob(
  name: string,
  cron: string,
  data?: object,
): Promise<void> {
  const q = await getQueue();
  await q.schedule(name, cron, data ?? {});
}
