import type { PrismaClient, Prisma } from '@prisma/client';
import type { IIdempotencyService, IdempotencyRecord } from '../../../shared/domain/idempotency.service';

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
