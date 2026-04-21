import type { PrismaClient } from '@prisma/client';
import { AppointmentTimeSlotEntity } from '../domain/appointment-time-slot.entity';
import type {
  IAppointmentTimeSlotRepository,
  AppointmentTimeSlotFilters,
} from '../domain/appointment-time-slot.repository';

interface AppointmentTimeSlotRow {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  label: string;
  start_time: string;
  end_time: string;
  sort_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

function mapToEntity(row: AppointmentTimeSlotRow): AppointmentTimeSlotEntity {
  return new AppointmentTimeSlotEntity({
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    label: row.label,
    startTime: row.start_time,
    endTime: row.end_time,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

export class PrismaAppointmentTimeSlotRepository implements IAppointmentTimeSlotRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(entity: AppointmentTimeSlotEntity): Promise<void> {
    await this.prisma.appointmentTimeSlot.create({
      data: {
        id: entity.id,
        tenant_id: entity.tenantId,
        branch_id: entity.branchId,
        label: entity.label,
        start_time: entity.startTime,
        end_time: entity.endTime,
        sort_order: entity.sortOrder,
        is_active: entity.isActive,
      },
    });
  }

  async update(entity: AppointmentTimeSlotEntity): Promise<void> {
    await this.prisma.appointmentTimeSlot.update({
      where: { id: entity.id },
      data: {
        label: entity.label,
        start_time: entity.startTime,
        end_time: entity.endTime,
        sort_order: entity.sortOrder,
        is_active: entity.isActive,
        updated_at: new Date(),
      },
    });
  }

  async findById(id: string): Promise<AppointmentTimeSlotEntity | null> {
    const row = await this.prisma.appointmentTimeSlot.findFirst({
      where: { id, deleted_at: null },
    });
    return row ? mapToEntity(row) : null;
  }

  async findAll(filters: AppointmentTimeSlotFilters): Promise<AppointmentTimeSlotEntity[]> {
    const where: Record<string, unknown> = {
      tenant_id: filters.tenantId,
      deleted_at: null,
    };

    if (filters.branchId !== undefined) {
      where['branch_id'] = filters.branchId;
    }

    if (!filters.includeInactive) {
      where['is_active'] = true;
    }

    const rows = await this.prisma.appointmentTimeSlot.findMany({
      where,
      orderBy: { sort_order: 'asc' },
    });

    return rows.map(mapToEntity);
  }

  async findEffective(tenantId: string, branchId: string): Promise<AppointmentTimeSlotEntity[]> {
    // Step 1: Try branch-specific slots
    const branchSlots = await this.prisma.appointmentTimeSlot.findMany({
      where: {
        tenant_id: tenantId,
        branch_id: branchId,
        is_active: true,
        deleted_at: null,
      },
      orderBy: { sort_order: 'asc' },
    });

    if (branchSlots.length > 0) {
      return branchSlots.map(mapToEntity);
    }

    // Step 2: Fallback to tenant-wide defaults
    const tenantSlots = await this.prisma.appointmentTimeSlot.findMany({
      where: {
        tenant_id: tenantId,
        branch_id: null,
        is_active: true,
        deleted_at: null,
      },
      orderBy: { sort_order: 'asc' },
    });

    return tenantSlots.map(mapToEntity);
  }

  async findActiveInScope(tenantId: string, branchId: string | null): Promise<AppointmentTimeSlotEntity[]> {
    const rows = await this.prisma.appointmentTimeSlot.findMany({
      where: {
        tenant_id: tenantId,
        branch_id: branchId,
        is_active: true,
        deleted_at: null,
      },
      orderBy: { sort_order: 'asc' },
    });
    return rows.map(mapToEntity);
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.appointmentTimeSlot.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }
}
