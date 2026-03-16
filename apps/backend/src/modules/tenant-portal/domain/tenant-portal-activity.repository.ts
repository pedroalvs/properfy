import type { TenantPortalActivityEntity } from './tenant-portal-activity.entity';

export interface ITenantPortalActivityRepository {
  save(activity: TenantPortalActivityEntity): Promise<void>;
  findLatestByTokenAndAction(tokenId: string, action: string): Promise<TenantPortalActivityEntity | null>;
}
