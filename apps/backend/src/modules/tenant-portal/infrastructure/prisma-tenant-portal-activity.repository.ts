import type { PrismaClient } from '@prisma/client';
import { TenantPortalAction as PrismaTenantPortalAction, Prisma } from '@prisma/client';
import { TenantPortalActivityEntity } from '../domain/tenant-portal-activity.entity';
import type { ITenantPortalActivityRepository } from '../domain/tenant-portal-activity.repository';
import type { TenantPortalAction } from '@properfy/shared';

function mapToEntity(row: any): TenantPortalActivityEntity {
  return new TenantPortalActivityEntity({
    id: row.id,
    appointmentId: row.appointment_id,
    tenantPortalTokenId: row.tenant_portal_token_id,
    action: row.action as TenantPortalAction,
    previousValuesJson: row.previous_values_json as Record<string, unknown> | null,
    newValuesJson: row.new_values_json as Record<string, unknown> | null,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  });
}

export class PrismaTenantPortalActivityRepository implements ITenantPortalActivityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(activity: TenantPortalActivityEntity): Promise<void> {
    await this.prisma.tenantPortalActivity.create({
      data: {
        id: activity.id,
        appointment_id: activity.appointmentId,
        tenant_portal_token_id: activity.tenantPortalTokenId,
        action: activity.action as PrismaTenantPortalAction,
        previous_values_json: (activity.previousValuesJson as Prisma.InputJsonValue) ?? undefined,
        new_values_json: (activity.newValuesJson as Prisma.InputJsonValue) ?? undefined,
        ip_address: activity.ipAddress,
        user_agent: activity.userAgent,
      },
    });
  }

  async findLatestByTokenAndAction(tokenId: string, action: string): Promise<TenantPortalActivityEntity | null> {
    const row = await this.prisma.tenantPortalActivity.findFirst({
      where: { tenant_portal_token_id: tokenId, action: action as any },
      orderBy: { created_at: 'desc' },
    });
    return row ? mapToEntity(row) : null;
  }

  async findByAppointmentId(appointmentId: string, page: number, pageSize: number): Promise<{ activities: TenantPortalActivityEntity[]; total: number }> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.tenantPortalActivity.findMany({
        where: { appointment_id: appointmentId },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.tenantPortalActivity.count({
        where: { appointment_id: appointmentId },
      }),
    ]);
    return { activities: rows.map(mapToEntity), total };
  }
}
