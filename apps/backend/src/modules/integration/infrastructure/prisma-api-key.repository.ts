import type { PrismaClient } from '@prisma/client';
import { apiKeyRoleSchema } from '@properfy/shared';

import type { ApiKey, CreateApiKeyData, IApiKeyRepository } from '../domain/api-key';

interface ApiKeyRow {
  id: string;
  name: string;
  key_hash: string;
  prefix: string;
  role: string;
  scopes: string[];
  expires_at: Date | null;
  revoked_at: Date | null;
  last_used_at: Date | null;
  created_by_id: string;
  created_at: Date;
}

function mapRow(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    name: row.name,
    keyHash: row.key_hash,
    prefix: row.prefix,
    role: apiKeyRoleSchema.parse(row.role),
    scopes: row.scopes,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    lastUsedAt: row.last_used_at,
    createdById: row.created_by_id,
    createdAt: row.created_at,
  };
}

export class PrismaApiKeyRepository implements IApiKeyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateApiKeyData): Promise<ApiKey> {
    const row = await this.prisma.apiKey.create({
      data: {
        name: data.name,
        key_hash: data.keyHash,
        prefix: data.prefix,
        role: data.role,
        scopes: data.scopes,
        expires_at: data.expiresAt,
        created_by_id: data.createdById,
      },
    });
    return mapRow(row);
  }

  async list(): Promise<ApiKey[]> {
    const rows = await this.prisma.apiKey.findMany({ orderBy: { created_at: 'desc' } });
    return rows.map(mapRow);
  }

  async findById(id: string): Promise<ApiKey | null> {
    const row = await this.prisma.apiKey.findUnique({ where: { id } });
    return row ? mapRow(row) : null;
  }

  async findByHash(keyHash: string): Promise<ApiKey | null> {
    const row = await this.prisma.apiKey.findUnique({ where: { key_hash: keyHash } });
    return row ? mapRow(row) : null;
  }

  async revoke(id: string): Promise<void> {
    await this.prisma.apiKey.update({ where: { id }, data: { revoked_at: new Date() } });
  }

  async touchLastUsed(id: string, at: Date): Promise<void> {
    await this.prisma.apiKey.update({ where: { id }, data: { last_used_at: at } });
  }
}
