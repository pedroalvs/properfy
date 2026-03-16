import type { PrismaClient } from '@prisma/client';
import type { IIdempotencyService } from '../domain/idempotency.service';

export class PrismaIdempotencyService implements IIdempotencyService {
  constructor(private readonly prisma: PrismaClient) {}

  async get<T = unknown>(key: string, scope: string): Promise<T | null> {
    const row = await this.prisma.idempotencyKey.findUnique({
      where: { key },
    });
    if (!row) return null;
    if (row.scope !== scope) return null;
    if (row.expires_at < new Date()) return null;
    return row.response as T;
  }

  async set<T = unknown>(key: string, scope: string, response: T, ttlHours: number): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    await this.prisma.idempotencyKey.upsert({
      where: { key },
      update: { response: response as any, expires_at: expiresAt },
      create: {
        key,
        scope,
        response: response as any,
        expires_at: expiresAt,
      },
    });
  }
}
