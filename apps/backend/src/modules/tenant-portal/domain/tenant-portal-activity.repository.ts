import type { TenantPortalActivityEntity } from './tenant-portal-activity.entity';

export interface FindActivitiesResult {
  activities: TenantPortalActivityEntity[];
  total: number;
}

export interface ITenantPortalActivityRepository {
  save(activity: TenantPortalActivityEntity): Promise<void>;
  findLatestByTokenAndAction(tokenId: string, action: string): Promise<TenantPortalActivityEntity | null>;
  findByAppointmentId(appointmentId: string, page: number, pageSize: number): Promise<FindActivitiesResult>;
}
