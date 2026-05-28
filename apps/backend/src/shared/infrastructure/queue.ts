import PgBoss from 'pg-boss';
import { getRequestId } from './request-context';

let bossPromise: Promise<PgBoss> | null = null;

export async function getQueue(): Promise<PgBoss> {
  if (!bossPromise) {
    bossPromise = (async () => {
      // pg-boss requires a direct (non-pooled) connection: it uses advisory locks
      // and LISTEN/NOTIFY which are incompatible with PgBouncer transaction mode.
      // PG_BOSS_URL should point to the direct Supabase connection (port 5432).
      const connectionString = process.env['PG_BOSS_URL'] ?? process.env['DATABASE_URL'];
      if (!connectionString) {
        throw new Error('PG_BOSS_URL or DATABASE_URL environment variable is required');
      }
      const b = new PgBoss({
        connectionString,
        retryLimit: 6,
        retryBackoff: true,
        deleteAfterDays: 30,
        // Supabase session-mode pooler caps at 15 total connections across all instances.
        max: 2,
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
