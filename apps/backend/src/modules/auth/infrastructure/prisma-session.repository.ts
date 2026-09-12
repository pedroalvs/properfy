import type { PrismaClient, Prisma } from '@prisma/client';
import { SessionEntity } from '../domain/session.entity';
import type { ISessionRepository } from '../domain/session.repository';

type DbClient = PrismaClient | Prisma.TransactionClient;

function mapToEntity(row: {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  ip_address: string | null;
  user_agent: string | null;
  country_code: string | null;
  device_fingerprint: string | null;
  auth_stage: string | null;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}): SessionEntity {
  return new SessionEntity({
    id: row.id,
    userId: row.user_id,
    refreshTokenHash: row.refresh_token_hash,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    countryCode: row.country_code,
    deviceFingerprint: row.device_fingerprint,
    authStage: row.auth_stage,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  });
}

export class PrismaSessionRepository implements ISessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private db(tx?: Prisma.TransactionClient): DbClient {
    return tx ?? this.prisma;
  }

  async create(
    session: Omit<SessionEntity, 'isValid' | 'isRevoked' | 'isExpired' | 'updatedAt'>,
  ): Promise<SessionEntity> {
    const row = await this.prisma.session.create({
      data: {
        id: session.id,
        user_id: session.userId,
        refresh_token_hash: session.refreshTokenHash,
        ip_address: session.ipAddress,
        user_agent: session.userAgent,
        country_code: session.countryCode,
        device_fingerprint: session.deviceFingerprint,
        auth_stage: session.authStage,
        expires_at: session.expiresAt,
        revoked_at: session.revokedAt,
      },
    });
    return mapToEntity(row);
  }

  async findByRefreshTokenHash(hash: string): Promise<SessionEntity | null> {
    const row = await this.prisma.session.findFirst({
      where: { refresh_token_hash: hash },
    });
    return row ? mapToEntity(row) : null;
  }

  async findById(id: string): Promise<SessionEntity | null> {
    const row = await this.prisma.session.findFirst({
      where: { id },
    });
    return row ? mapToEntity(row) : null;
  }

  async findActiveByUserId(userId: string): Promise<SessionEntity[]> {
    const rows = await this.prisma.session.findMany({
      where: {
        user_id: userId,
        revoked_at: null,
        expires_at: { gt: new Date() },
      },
    });
    return rows.map(mapToEntity);
  }

  async rotateRefreshToken(
    sessionId: string,
    expectedHash: string,
    newHash: string,
    expiresAt: Date,
  ): Promise<boolean> {
    // Compare-and-swap: only the row that still holds `expectedHash` and is not
    // revoked is updated. `updateMany` returns the affected-row count, so two
    // concurrent refreshes of the same token produce exactly one count === 1
    // (the winner) and one count === 0 (reuse to be detected by the caller).
    const result = await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        refresh_token_hash: expectedHash,
        revoked_at: null,
      },
      data: {
        refresh_token_hash: newHash,
        expires_at: expiresAt,
      },
    });
    return result.count === 1;
  }

  async revoke(sessionId: string, revokedAt: Date): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revoked_at: revokedAt },
    });
  }

  async revokeAllForUser(userId: string, revokedAt: Date, tx?: Prisma.TransactionClient): Promise<void> {
    await this.db(tx).session.updateMany({
      where: {
        user_id: userId,
        revoked_at: null,
      },
      data: { revoked_at: revokedAt },
    });
  }

  async findRecentByUserId(userId: string, days: number): Promise<SessionEntity[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const rows = await this.prisma.session.findMany({
      where: {
        user_id: userId,
        created_at: { gte: since },
      },
      orderBy: { created_at: 'desc' },
    });
    return rows.map(mapToEntity);
  }

  async deleteExpiredBefore(date: Date): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: {
        expires_at: { lt: date },
      },
    });
    return result.count;
  }
}
