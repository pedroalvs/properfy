import type { RentalTenantPortalActivityEntity } from './rental-tenant-portal-activity.entity';

export interface FindActivitiesResult {
  activities: RentalTenantPortalActivityEntity[];
  total: number;
}

export interface IRentalTenantPortalActivityRepository {
  save(activity: RentalTenantPortalActivityEntity): Promise<void>;
  findLatestByTokenAndAction(tokenId: string, action: string): Promise<RentalTenantPortalActivityEntity | null>;
  findByAppointmentId(appointmentId: string, page: number, pageSize: number): Promise<FindActivitiesResult>;
}
