import type { Prisma } from '@prisma/client';

export interface IdempotencyRecord<T = unknown> {
  response: T;
  payloadHash: string | null;
}

export interface IIdempotencyService {
  get<T = unknown>(key: string, scope: string, tx?: Prisma.TransactionClient): Promise<T | null>;
  getWithHash<T = unknown>(
    key: string,
    scope: string,
    tx?: Prisma.TransactionClient,
  ): Promise<IdempotencyRecord<T> | null>;
  /**
   * `tx` matters for correctness here, not just connection hygiene: a key written
   * outside the caller's transaction survives that transaction rolling back, and
   * the retry then reads a cached "success" for work that never happened.
   */
  set<T = unknown>(
    key: string,
    scope: string,
    response: T,
    ttlHours: number,
    payloadHash?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
}
