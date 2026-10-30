export interface PlatformSettingRow {
  key: string;
  valueJson: unknown;
  updatedAt: Date;
  updatedBy: { id: string; name: string } | null;
}

export interface IPlatformSettingRepository {
  findByKey(key: string): Promise<PlatformSettingRow | null>;
  findAll(): Promise<PlatformSettingRow[]>;
  /** Insert or update the value for `key`, recording the acting user. */
  upsert(key: string, valueJson: unknown, updatedById: string): Promise<PlatformSettingRow>;
}
