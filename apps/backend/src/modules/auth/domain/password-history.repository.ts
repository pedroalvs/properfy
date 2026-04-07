export interface IPasswordHistoryRepository {
  findRecentByUserId(userId: string, limit: number): Promise<{ passwordHash: string }[]>;
  save(userId: string, passwordHash: string): Promise<void>;
  pruneOldEntries(userId: string, keepCount: number): Promise<void>;
}
