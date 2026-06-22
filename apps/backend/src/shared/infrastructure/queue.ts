import PgBoss from 'pg-boss';
import { getRequestId } from './request-context';

let bossPromise: Promise<PgBoss> | null = null;

const DEFAULT_PGBOSS_SCHEMA = 'pgboss';
// Postgres identifier-safe (also interpolated into the DLQ monitor's raw SQL).
const SAFE_SCHEMA_RE = /^[a-z_][a-z0-9_]*$/;

/**
 * The Postgres schema pg-boss owns. **Per-environment isolation:** dev and
 * staging share one Supabase database, and pg-boss queues are NOT namespaced per
 * environment — every process on the same schema is a peer consumer of all
 * queues, so a dev laptop can dequeue (and silently no-op) staging's jobs.
 *
 * To make isolation safe-by-default, the schema is derived from NODE_ENV when
 * `PGBOSS_SCHEMA` is not set: dev → `pgboss_dev`, staging → `pgboss_staging`,
 * test → `pgboss_test`, production → `pgboss` (legacy name, so no prod migration).
 * An explicit `PGBOSS_SCHEMA` always wins.
 */
export function resolvePgBossSchema(
  env: Record<string, string | undefined> = process.env,
): string {
  const explicit = env['PGBOSS_SCHEMA'];
  if (explicit) {
    if (!SAFE_SCHEMA_RE.test(explicit)) {
      throw new Error(
        `Invalid PGBOSS_SCHEMA "${explicit}": must match ${SAFE_SCHEMA_RE} (lowercase letters, digits, underscore)`,
      );
    }
    return explicit;
  }
  switch (env['NODE_ENV']) {
    case 'development':
      return 'pgboss_dev';
    case 'staging':
      return 'pgboss_staging';
    case 'test':
      return 'pgboss_test';
    case 'production':
      return DEFAULT_PGBOSS_SCHEMA;
    default:
      return DEFAULT_PGBOSS_SCHEMA;
  }
}

/**
 * Whether two Postgres connection strings point to the same database (same host
 * + same database name), ignoring port — a pooled (:6543) and direct (:5432)
 * URL to the same Supabase project must compare equal. Returns `true` when a URL
 * is missing or unparseable (cannot assert a mismatch → no false alarm).
 */
export function databasesMatch(
  urlA: string | undefined,
  urlB: string | undefined,
): boolean {
  if (!urlA || !urlB) return true;
  let a: URL;
  let b: URL;
  try {
    a = new URL(urlA);
    b = new URL(urlB);
  } catch {
    return true;
  }
  return (
    a.hostname.toLowerCase() === b.hostname.toLowerCase() &&
    a.pathname === b.pathname
  );
}

/**
 * Warn loudly when the queue database (PG_BOSS_URL) and the application database
 * (DATABASE_URL) are different. That mismatch is the exact misconfiguration that
 * makes a worker dequeue jobs but look up their entities in the wrong database —
 * silently no-op'ing them. Most common on a developer laptop pointed at the
 * shared queue but a local app DB.
 */
export function assertQueueDbConsistency(logger?: {
  warn: (obj: unknown, msg?: string) => void;
}): void {
  const pgBossUrl = process.env['PG_BOSS_URL'];
  const databaseUrl = process.env['DATABASE_URL'];
  if (!pgBossUrl) return; // falls back to DATABASE_URL — same DB by construction
  if (!databasesMatch(pgBossUrl, databaseUrl)) {
    const msg =
      'PG_BOSS_URL and DATABASE_URL point to DIFFERENT databases. This worker will ' +
      'dequeue jobs from one database but look up entities in another, silently ' +
      'no-op-ing them. Point both at the same database (or use PGBOSS_SCHEMA to isolate envs).';
    if (logger) logger.warn({ event: 'queue.db_mismatch' }, msg);
    // eslint-disable-next-line no-console -- last-resort when called before a logger exists
    else console.warn(`[queue] ${msg}`);
  }
}

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
        // Per-environment queue isolation (see resolvePgBossSchema).
        schema: resolvePgBossSchema(),
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
