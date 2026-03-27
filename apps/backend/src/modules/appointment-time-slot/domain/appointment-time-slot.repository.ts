import type { AppointmentTimeSlotEntity } from './appointment-time-slot.entity';

export interface AppointmentTimeSlotFilters {
  tenantId: string;
  branchId?: string | null; // null = tenant-wide only, undefined = all
  includeInactive?: boolean;
}

export interface IAppointmentTimeSlotRepository {
  create(entity: AppointmentTimeSlotEntity): Promise<void>;
  update(entity: AppointmentTimeSlotEntity): Promise<void>;
  findById(id: string): Promise<AppointmentTimeSlotEntity | null>;
  findAll(filters: AppointmentTimeSlotFilters): Promise<AppointmentTimeSlotEntity[]>;
  /** Returns branch-specific slots if any exist, otherwise tenant-wide defaults */
  findEffective(tenantId: string, branchId: string): Promise<AppointmentTimeSlotEntity[]>;
  softDelete(id: string): Promise<void>;
}
