import { randomUUID } from 'node:crypto';
import type { PrismaClient, Prisma } from '@prisma/client';
import type {
  IIdempotencyService,
  IdempotencyAcquireResult,
  IdempotencyRecord,
} from '../../../shared/domain/idempotency.service';

function isInProgress(response: unknown): boolean {
  return (
    typeof response === 'object'
    && response !== null
    && '__idempotencyState' in response
    && response.__idempotencyState === 'IN_PROGRESS'
  );
}

/** Same idiom as prisma-confirmation-cycle.repository.ts — the tx client is a narrowed PrismaClient. */
type DbClient = PrismaClient | Prisma.TransactionClient;

export class PrismaIdempotencyService implements IIdempotencyService {
  constructor(private readonly prisma: PrismaClient) {}

  private db(tx?: Prisma.TransactionClient): DbClient {
    return tx ?? this.prisma;
  }

  async get<T = unknown>(key: string, scope: string, tx?: Prisma.TransactionClient): Promise<T | null> {
    const record = await this.getWithHash<T>(key, scope, tx);
    return record ? record.response : null;
  }

  async getWithHash<T = unknown>(
    key: string,
    scope: string,
    tx?: Prisma.TransactionClient,
  ): Promise<IdempotencyRecord<T> | null> {
    const row = await this.db(tx).idempotencyKey.findUnique({
      where: { key },
    });
    if (!row) return null;
    if (row.scope !== scope) return null;
    if (row.expires_at < new Date()) return null;
    return {
      response: row.response as T,
      payloadHash: row.payload_hash,
    };
  }

  async tryAcquire<T = unknown>(
    key: string,
    scope: string,
    payloadHash: string,
    ttlHours: number,
  ): Promise<IdempotencyAcquireResult<T>> {
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
      const ownerToken = randomUUID();
      const inserted = await this.prisma.idempotencyKey.createMany({
        data: [{
          key,
          scope,
          response: { __idempotencyState: 'IN_PROGRESS', ownerToken },
          payload_hash: payloadHash,
          expires_at: expiresAt,
        }],
        skipDuplicates: true,
      });
      if (inserted.count === 1) return { status: 'acquired', ownerToken };

      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { key },
      });
      if (!existing) continue;
      if (existing.expires_at < now) {
        await this.prisma.idempotencyKey.deleteMany({
          where: { id: existing.id, expires_at: { lt: now } },
        });
        continue;
      }
      if (existing.scope !== scope) {
        return { status: 'in_progress', payloadHash: existing.payload_hash };
      }
      if (isInProgress(existing.response)) {
        return { status: 'in_progress', payloadHash: existing.payload_hash };
      }
      return {
        status: 'completed',
        response: existing.response as T,
        payloadHash: existing.payload_hash,
      };
    }

    return { status: 'in_progress', payloadHash };
  }

  async complete<T = unknown>(
    key: string,
    scope: string,
    ownerToken: string,
    response: T,
    ttlHours: number,
    payloadHash: string,
  ): Promise<boolean> {
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    const updated = await this.prisma.idempotencyKey.updateMany({
      where: {
        key,
        scope,
        payload_hash: payloadHash,
        response: { path: ['ownerToken'], equals: ownerToken },
      },
      data: {
        response: response as any,
        expires_at: expiresAt,
        payload_hash: payloadHash,
      },
    });
    return updated.count === 1;
  }

  async renew(
    key: string,
    scope: string,
    payloadHash: string,
    ownerToken: string,
    ttlHours: number,
  ): Promise<boolean> {
    const renewed = await this.prisma.idempotencyKey.updateMany({
      where: {
        key,
        scope,
        payload_hash: payloadHash,
        response: { path: ['ownerToken'], equals: ownerToken },
      },
      data: {
        expires_at: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
      },
    });
    return renewed.count === 1;
  }

  async release(key: string, scope: string, payloadHash: string, ownerToken: string): Promise<void> {
    await this.prisma.idempotencyKey.deleteMany({
      where: {
        key,
        scope,
        payload_hash: payloadHash,
        response: { path: ['ownerToken'], equals: ownerToken },
      },
    });
  }

  async set<T = unknown>(
    key: string,
    scope: string,
    response: T,
    ttlHours: number,
    payloadHash?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    await this.db(tx).idempotencyKey.upsert({
      where: { key },
      update: { response: response as any, expires_at: expiresAt, payload_hash: payloadHash ?? null },
      create: {
        key,
        scope,
        response: response as any,
        payload_hash: payloadHash ?? null,
        expires_at: expiresAt,
      },
    });
  }
}
