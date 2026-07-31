import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient, Prisma } from '@prisma/client';
import { runInTransaction, transactionalResult } from './unit-of-work';

/** A `$transaction` that records when its callback resolved, so ordering is assertable. */
function fakePrisma(log: string[], opts: { fail?: boolean } = {}) {
  const tx = { __tx: true } as unknown as Prisma.TransactionClient;
  return {
    prisma: {
      $transaction: vi.fn(async (cb: (t: Prisma.TransactionClient) => Promise<unknown>) => {
        const result = await cb(tx);
        if (opts.fail) throw new Error('rollback');
        log.push('commit');
        return result;
      }),
    } as unknown as PrismaClient,
    tx,
  };
}

describe('runInTransaction — unwrapped (no prisma, no parent)', () => {
  it('runs the callback and flushes deferred effects', async () => {
    const log: string[] = [];

    const out = await runInTransaction(undefined, async ({ tx, defer }) => {
      expect(tx).toBeUndefined();
      log.push('body');
      defer(async () => { log.push('effect'); });
      return 'result';
    });

    expect(out).toBe('result');
    expect(log).toEqual(['body', 'effect']);
  });

  it('does not flush when the callback throws', async () => {
    const effect = vi.fn();

    await expect(
      runInTransaction(undefined, async ({ defer }) => {
        defer(async () => { effect(); });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(effect).not.toHaveBeenCalled();
  });
});

describe('runInTransaction — owning the transaction', () => {
  it('opens exactly one transaction and hands its client to the callback', async () => {
    const log: string[] = [];
    const { prisma, tx } = fakePrisma(log);

    await runInTransaction(prisma, async (ctx) => {
      expect(ctx.tx).toBe(tx);
    });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('flushes deferred effects only AFTER the transaction commits', async () => {
    // The whole point: an effect that runs inside the transaction can deadlock
    // against the locks that transaction holds, and cannot be undone if it
    // later rolls back.
    const log: string[] = [];
    const { prisma } = fakePrisma(log);

    await runInTransaction(prisma, async ({ defer }) => {
      log.push('body');
      defer(async () => { log.push('effect'); });
    });

    expect(log).toEqual(['body', 'commit', 'effect']);
  });

  it('does not flush when the transaction rolls back', async () => {
    const log: string[] = [];
    const { prisma } = fakePrisma(log, { fail: true });
    const effect = vi.fn();

    await expect(
      runInTransaction(prisma, async ({ defer }) => { defer(async () => { effect(); }); }),
    ).rejects.toThrow('rollback');

    expect(effect).not.toHaveBeenCalled();
  });

  it('runs effects in the order they were deferred', async () => {
    const log: string[] = [];
    const { prisma } = fakePrisma(log);

    await runInTransaction(prisma, async ({ defer }) => {
      defer(async () => { log.push('first'); });
      defer(async () => { log.push('second'); });
    });

    expect(log).toEqual(['commit', 'first', 'second']);
  });
});

describe('runInTransaction — joining a caller transaction', () => {
  it('opens no second transaction and defers to the outer flush', async () => {
    // Nesting a real transaction would be a different transaction on a different
    // connection — it would not see the outer's uncommitted writes and would not
    // roll back with it.
    const log: string[] = [];
    const { prisma, tx } = fakePrisma(log);

    await runInTransaction(prisma, async (outer) => {
      await runInTransaction(prisma, async (inner) => {
        expect(inner.tx).toBe(tx);
        log.push('inner-body');
        inner.defer(async () => { log.push('inner-effect'); });
      }, outer);
      log.push('outer-body');
    });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(log).toEqual(['inner-body', 'outer-body', 'commit', 'inner-effect']);
  });

  it('drops the inner effects when the OUTER transaction rolls back', async () => {
    const log: string[] = [];
    const { prisma } = fakePrisma(log, { fail: true });
    const innerEffect = vi.fn();

    await expect(
      runInTransaction(prisma, async (outer) => {
        await runInTransaction(prisma, async (inner) => {
          inner.defer(async () => { innerEffect(); });
        }, outer);
      }),
    ).rejects.toThrow('rollback');

    expect(innerEffect).not.toHaveBeenCalled();
  });
});

describe('transactionalResult', () => {
  it('carries the output and runs the effects on demand', async () => {
    const log: string[] = [];
    const result = transactionalResult('out', [
      async () => { log.push('a'); },
      async () => { log.push('b'); },
    ]);

    expect(result.output).toBe('out');
    expect(log).toEqual([]);

    await result.runAfterCommit();
    expect(log).toEqual(['a', 'b']);
  });

  it('is safe to call twice — effects never run again', async () => {
    // A double flush would mean a duplicate notification or a duplicate event.
    const effect = vi.fn();
    const result = transactionalResult(null, [async () => { effect(); }]);

    await result.runAfterCommit();
    await result.runAfterCommit();

    expect(effect).toHaveBeenCalledOnce();
  });

  it('survives being passed around detached from its object', async () => {
    // join-group defers `result.runAfterCommit` as a bare callback.
    const effect = vi.fn();
    const { runAfterCommit } = transactionalResult(null, [async () => { effect(); }]);

    await runAfterCommit();

    expect(effect).toHaveBeenCalledOnce();
  });
});
