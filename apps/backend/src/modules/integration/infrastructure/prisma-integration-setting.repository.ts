import type { PrismaClient } from '@prisma/client';
import { integrationProviderSchema, type IntegrationProvider } from '@properfy/shared';

import type { Aes256GcmService } from '../../../shared/infrastructure/crypto/aes-256-gcm.service';
import type {
  IIntegrationSettingRepository,
  IntegrationConfig,
  IntegrationSetting,
} from '../domain/integration-setting';

interface IntegrationSettingRow {
  provider: string;
  encrypted_config: string;
  enabled: boolean;
  updated_by_id: string | null;
  updated_at: Date;
}

export class PrismaIntegrationSettingRepository implements IIntegrationSettingRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly aes: Aes256GcmService,
  ) {}

  private mapRow(row: IntegrationSettingRow): IntegrationSetting {
    return {
      provider: integrationProviderSchema.parse(row.provider),
      config: JSON.parse(this.aes.decrypt(row.encrypted_config)) as IntegrationConfig,
      enabled: row.enabled,
      updatedById: row.updated_by_id,
      updatedAt: row.updated_at,
    };
  }

  async get(provider: IntegrationProvider): Promise<IntegrationSetting | null> {
    const row = await this.prisma.integrationSetting.findUnique({ where: { provider } });
    return row ? this.mapRow(row) : null;
  }

  async list(): Promise<IntegrationSetting[]> {
    const rows = await this.prisma.integrationSetting.findMany({ orderBy: { provider: 'asc' } });
    // One corrupted row (decrypt/JSON failure) must not take the whole hub
    // screen down — skip it and let the resolver report that provider as
    // unconfigured. get() failures are already isolated by the resolver.
    const settings: IntegrationSetting[] = [];
    for (const row of rows) {
      try {
        settings.push(this.mapRow(row));
      } catch {
        // skip unreadable row
      }
    }
    return settings;
  }

  async upsert(
    provider: IntegrationProvider,
    config: IntegrationConfig,
    enabled: boolean,
    updatedById: string,
  ): Promise<IntegrationSetting> {
    const encrypted = this.aes.encrypt(JSON.stringify(config));
    const row = await this.prisma.integrationSetting.upsert({
      where: { provider },
      create: { provider, encrypted_config: encrypted, enabled, updated_by_id: updatedById },
      update: { encrypted_config: encrypted, enabled, updated_by_id: updatedById },
    });
    return this.mapRow(row);
  }

  async delete(provider: IntegrationProvider): Promise<void> {
    // deleteMany on purpose: idempotent delete (no P2025 when the row is gone).
    await this.prisma.integrationSetting.deleteMany({ where: { provider } });
  }
}
