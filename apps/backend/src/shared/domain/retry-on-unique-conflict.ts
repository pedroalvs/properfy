/**
 * Re-runs a unit of work that lost a race on a unique column.
 *
 * Only for values the caller can regenerate — a randomly minted token, say —
 * where a fresh attempt is genuinely expected to succeed. The retry is narrowed
 * to a single column on purpose: a blanket `P2002` catch would also swallow an
 * id collision or a duplicated foreign key and quietly paper over a real bug.
 *
 * The work function must own its transaction. Postgres aborts the whole
 * transaction on a constraint violation, so retrying *inside* someone else's
 * open transaction only earns a `25P02 current transaction is aborted` — wrap
 * the `$transaction` call itself, never a statement within it.
 *
 * Detection is duck-typed (`code === 'P2002'`, `meta.target`) rather than using
 * `Prisma.PrismaClientKnownRequestError`, so this file stays free of framework
 * imports. `ConfirmationCycleService` duck-types the same error but only checks
 * the code — the column narrowing here is stricter, not established precedent.
 */
export async function retryOnUniqueConflict<T>(
  column: string,
  work: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      if (attempt >= attempts || !isUniqueConflictOn(error, column)) {
        throw error;
      }
    }
  }
}

function isUniqueConflictOn(error: unknown, column: string): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  if ((error as { code: unknown }).code !== 'P2002') {
    return false;
  }

  // On Postgres, Prisma reports `meta.target` as an array of column names even
  // for a single-column index — that is the shape this code actually sees. The
  // string branch covers connectors that report a bare constraint name.
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (typeof target === 'string') {
    return target === column;
  }
  return Array.isArray(target) && target.includes(column);
}
