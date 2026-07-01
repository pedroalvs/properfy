import type { PrismaClient } from '@prisma/client';
import type { RentalTenantPortalAction as PrismaRentalTenantPortalAction, Prisma } from '@prisma/client';
import { RentalTenantPortalActivityEntity } from '../domain/rental-tenant-portal-activity.entity';
import type { IRentalTenantPortalActivityRepository } from '../domain/rental-tenant-portal-activity.repository';
import type { RentalTenantPortalAction } from '@properfy/shared';

function mapToEntity(row: any): RentalTenantPortalActivityEntity {
  return new RentalTenantPortalActivityEntity({
    id: row.id,
    appointmentId: row.appointment_id,
    rentalTenantPortalTokenId: row.rental_tenant_portal_token_id,
    action: row.action as RentalTenantPortalAction,
    previousValuesJson: row.previous_values_json as Record<string, unknown> | null,
    newValuesJson: row.new_values_json as Record<string, unknown> | null,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  });
}

export class PrismaRentalTenantPortalActivityRepository implements IRentalTenantPortalActivityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(activity: RentalTenantPortalActivityEntity): Promise<void> {
    await this.prisma.rentalTenantPortalActivity.create({
      data: {
        id: activity.id,
        appointment_id: activity.appointmentId,
        rental_tenant_portal_token_id: activity.rentalTenantPortalTokenId,
        action: activity.action as PrismaRentalTenantPortalAction,
        previous_values_json: (activity.previousValuesJson as Prisma.InputJsonValue) ?? undefined,
        new_values_json: (activity.newValuesJson as Prisma.InputJsonValue) ?? undefined,
        ip_address: activity.ipAddress,
        user_agent: activity.userAgent,
      },
    });
  }

  async findLatestByTokenAndAction(tokenId: string, action: string): Promise<RentalTenantPortalActivityEntity | null> {
    const row = await this.prisma.rentalTenantPortalActivity.findFirst({
      where: { rental_tenant_portal_token_id: tokenId, action: action as any },
      orderBy: { created_at: 'desc' },
    });
    return row ? mapToEntity(row) : null;
  }

  async findByAppointmentId(appointmentId: string, page: number, pageSize: number): Promise<{ activities: RentalTenantPortalActivityEntity[]; total: number }> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.rentalTenantPortalActivity.findMany({
        where: { appointment_id: appointmentId },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.rentalTenantPortalActivity.count({
        where: { appointment_id: appointmentId },
      }),
    ]);
    return { activities: rows.map(mapToEntity), total };
  }
}
