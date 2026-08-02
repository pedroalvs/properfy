import type { Prisma } from '@prisma/client';

export interface IdempotencyRecord<T = unknown> {
  response: T;
  payloadHash: string | null;
}

export type IdempotencyAcquireResult<T = unknown> =
  | { status: 'acquired'; ownerToken: string }
  | { status: 'in_progress'; payloadHash: string | null }
  | { status: 'completed'; response: T; payloadHash: string | null };

export interface IIdempotencyService {
  get<T = unknown>(key: string, scope: string, tx?: Prisma.TransactionClient): Promise<T | null>;
  getWithHash<T = unknown>(
    key: string,
    scope: string,
    tx?: Prisma.TransactionClient,
  ): Promise<IdempotencyRecord<T> | null>;
  tryAcquire<T = unknown>(
    key: string,
    scope: string,
    payloadHash: string,
    ttlHours: number,
  ): Promise<IdempotencyAcquireResult<T>>;
  complete<T = unknown>(
    key: string,
    scope: string,
    ownerToken: string,
    response: T,
    ttlHours: number,
    payloadHash: string,
  ): Promise<boolean>;
  renew(
    key: string,
    scope: string,
    payloadHash: string,
    ownerToken: string,
    ttlHours: number,
  ): Promise<boolean>;
  release(key: string, scope: string, payloadHash: string, ownerToken: string): Promise<void>;
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
