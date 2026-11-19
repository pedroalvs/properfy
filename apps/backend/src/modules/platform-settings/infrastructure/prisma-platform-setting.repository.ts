import { type PrismaClient, type Prisma } from '@prisma/client';
import type {
  IPlatformSettingRepository,
  PlatformSettingRow,
} from '../domain/platform-setting.repository';

function mapRow(row: {
  key: string;
  value_json: unknown;
  updated_at: Date;
  updated_by: { id: string; name: string } | null;
}): PlatformSettingRow {
  return {
    key: row.key,
    valueJson: row.value_json,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ? { id: row.updated_by.id, name: row.updated_by.name } : null,
  };
}

const INCLUDE_UPDATED_BY = { updated_by: { select: { id: true, name: true } } } as const;

export class PrismaPlatformSettingRepository implements IPlatformSettingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByKey(key: string): Promise<PlatformSettingRow | null> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key },
      include: INCLUDE_UPDATED_BY,
    });
    return row ? mapRow(row) : null;
  }

  async findAll(): Promise<PlatformSettingRow[]> {
    const rows = await this.prisma.platformSetting.findMany({ include: INCLUDE_UPDATED_BY });
    return rows.map(mapRow);
  }

  async upsert(key: string, valueJson: unknown, updatedById: string): Promise<PlatformSettingRow> {
    const value = valueJson as Prisma.InputJsonValue;
    const row = await this.prisma.platformSetting.upsert({
      where: { key },
      create: { key, value_json: value, updated_by_id: updatedById },
      update: { value_json: value, updated_by_id: updatedById },
      include: INCLUDE_UPDATED_BY,
    });
    return mapRow(row);
  }
}
