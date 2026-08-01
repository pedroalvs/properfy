import type { PrismaClient, Prisma } from '@prisma/client';

/**
 * Work that must NOT run inside the transaction it belongs to.
 *
 * Three kinds qualify, and all three are represented in the status-transition
 * path: effects that cannot be undone (a sent email, an enqueued job, a revoked
 * portal token), effects that would deadlock against locks the transaction
 * itself holds (a domain-event subscriber writing to a row the transaction has
 * `FOR UPDATE`), and effects that borrow a second pooled connection while this
 * one is pinned — the classic exhaustion shape under PgBouncer transaction mode.
 */
export type AfterCommitEffect = () => Promise<void>;

/**
 * The result of a write phase whose non-transactional effects have not run yet.
 *
 * Exists because a use case cannot know when someone else's transaction commits:
 * it returns its output immediately and hands back the effects for the owner of
 * the transaction to flush at the right moment.
 */
export interface TransactionalResult<T> {
  readonly output: T;
  /** Run once, only after the owning transaction has committed. Repeat calls no-op. */
  runAfterCommit(): Promise<void>;
}

export interface TxContext {
  /** Absent when running unwrapped — callees should treat that as "use the global client". */
  readonly tx?: Prisma.TransactionClient;
  defer(effect: AfterCommitEffect): void;
}

export function transactionalResult<T>(
  output: T,
  effects: readonly AfterCommitEffect[],
): TransactionalResult<T> {
  let flushed = false;
  return {
    output,
    // An arrow rather than a method: callers pass this around detached
    // (`defer(result.runAfterCommit)`), which would lose `this` on a method.
    runAfterCommit: async () => {
      // A second flush would mean a duplicate notification or a duplicate event —
      // the exact class of bug deferring is meant to prevent.
      if (flushed) return;
      flushed = true;
      for (const effect of effects) {
        await effect();
      }
    },
  };
}

/**
 * Runs `fn` in a transaction, flushing deferred effects only once the
 * **outermost** transaction has committed.
 *
 * Three modes:
 * - `parent` given — joins it. No second transaction is opened and the effects
 *   go on the outer queue, so they flush with (and only with) the outer commit.
 *   Opening a nested `$transaction` would put the work on a different connection
 *   that cannot see the outer's uncommitted writes and would not roll back with it.
 * - `prisma` given — owns a fresh transaction and flushes after it commits.
 * - neither — runs unwrapped, flushing after `fn` resolves. This keeps the
 *   existing "optional prisma" idiom working, where a use case constructed
 *   without a client degrades to today's non-transactional behaviour.
 *
 * Effects never run when `fn` throws: there was no commit to be after.
 */
export async function runInTransaction<T>(
  prisma: PrismaClient | undefined,
  fn: (ctx: TxContext) => Promise<T>,
  parent?: TxContext,
): Promise<T> {
  if (parent) {
    return fn(parent);
  }

  const effects: AfterCommitEffect[] = [];
  const defer = (effect: AfterCommitEffect): void => {
    effects.push(effect);
  };

  const output = prisma
    ? await prisma.$transaction((tx) => fn({ tx, defer }))
    : await fn({ defer });

  // Past this line the transaction has committed (or there never was one), so
  // the effects are safe to run — and a throw here can no longer undo the write.
  for (const effect of effects) {
    await effect();
  }

  return output;
}
