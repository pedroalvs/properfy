import type { PrismaClient } from '@prisma/client';
import { SessionEntity } from '../domain/session.entity';
import type { ISessionRepository } from '../domain/session.repository';

function mapToEntity(row: {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  ip_address: string | null;
  user_agent: string | null;
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
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  });
}

export class PrismaSessionRepository implements ISessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

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

  async updateRefreshToken(sessionId: string, newHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.session.update({
      where: {
        id: sessionId,
        revoked_at: null,
      },
      data: {
        refresh_token_hash: newHash,
        expires_at: expiresAt,
      },
    });
  }

  async revoke(sessionId: string, revokedAt: Date): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revoked_at: revokedAt },
    });
  }

  async revokeAllForUser(userId: string, revokedAt: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        user_id: userId,
        revoked_at: null,
      },
      data: { revoked_at: revokedAt },
    });
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
