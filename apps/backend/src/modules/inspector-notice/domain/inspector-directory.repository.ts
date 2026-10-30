/**
 * Read port over inspectors and regions, used to resolve a notice audience to active
 * recipients. Kept inside the inspector-notice module (behind this port) so the use case
 * stays testable with a fake, and so the Prisma impl can query the platform-scoped
 * inspectors/regions directly without coupling to the inspector module's repository.
 */

export interface NoticeRegion {
  id: string;
  name: string;
  status: string; // RegionStatus; 'ACTIVE' is the only valid audience target
}

export interface IInspectorDirectoryRepository {
  /** ids of every ACTIVE, non-deleted inspector. */
  findAllActiveInspectorIds(): Promise<string[]>;
  /** subset of `ids` that are ACTIVE and non-deleted (order not significant). */
  findActiveInspectorIdsByIds(ids: string[]): Promise<string[]>;
  /** ids of ACTIVE, non-deleted inspectors linked to the region. */
  findActiveInspectorIdsByRegion(regionId: string): Promise<string[]>;
  /** the region, or null when it does not exist. */
  findRegion(regionId: string): Promise<NoticeRegion | null>;
  /** display name of a user (the notice author), or null when unknown. */
  findUserName(userId: string): Promise<string | null>;
}
