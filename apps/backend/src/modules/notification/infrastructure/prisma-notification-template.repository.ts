import type { PrismaClient } from '@prisma/client';
import type { NotificationChannel, WhatsAppApprovalStatus } from '@properfy/shared';
import { NotificationTemplateEntity } from '../domain/notification-template.entity';
import type {
  INotificationTemplateRepository,
  NotificationTemplateFilters,
} from '../domain/notification-template.repository';

function mapToEntity(row: any): NotificationTemplateEntity {
  return new NotificationTemplateEntity({
    id: row.id,
    tenantId: row.tenant_id,
    templateCode: row.template_code,
    channel: row.channel as NotificationChannel,
    subject: row.subject,
    bodyHtml: row.body_html,
    bodyText: row.body_text,
    variablesJson: row.variables_json as string[],
    isActive: row.is_active,
    whatsappApprovalStatus: (row.whatsapp_approval_status ?? 'PENDING') as WhatsAppApprovalStatus,
    whatsappApprovalReference: row.whatsapp_approval_reference ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class PrismaNotificationTemplateRepository implements INotificationTemplateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByTenantCodeChannel(
    tenantId: string | null,
    templateCode: string,
    channel: NotificationChannel,
  ): Promise<NotificationTemplateEntity | null> {
    const row = await this.prisma.notificationTemplate.findFirst({
      where: {
        tenant_id: tenantId,
        template_code: templateCode,
        channel,
      },
    });
    return row ? mapToEntity(row) : null;
  }

  async findAll(filters: NotificationTemplateFilters): Promise<NotificationTemplateEntity[]> {
    const where: Record<string, unknown> = {};

    if (filters.tenantId !== undefined) {
      if (filters.includeDefaults) {
        where.OR = [
          { tenant_id: filters.tenantId },
          { tenant_id: null },
        ];
      } else {
        where.tenant_id = filters.tenantId;
      }
    }

    if (filters.templateCode) where.template_code = filters.templateCode;
    if (filters.channel) where.channel = filters.channel;

    const rows = await this.prisma.notificationTemplate.findMany({ where });
    return rows.map(mapToEntity);
  }

  async upsert(template: NotificationTemplateEntity): Promise<void> {
    const existing = await this.prisma.notificationTemplate.findFirst({
      where: {
        tenant_id: template.tenantId,
        template_code: template.templateCode,
        channel: template.channel,
      },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.notificationTemplate.update({
        where: { id: existing.id },
        data: {
          subject: template.subject,
          body_html: template.bodyHtml,
          body_text: template.bodyText,
          variables_json: template.variablesJson,
          is_active: template.active,
          whatsapp_approval_status: template.whatsappApprovalStatus,
          whatsapp_approval_reference: template.whatsappApprovalReference,
        },
      });
      return;
    }

    await this.prisma.notificationTemplate.create({
      data: {
        id: template.id,
        tenant_id: template.tenantId,
        template_code: template.templateCode,
        channel: template.channel,
        subject: template.subject,
        body_html: template.bodyHtml,
        body_text: template.bodyText,
        variables_json: template.variablesJson,
        is_active: template.active,
        whatsapp_approval_status: template.whatsappApprovalStatus,
        whatsapp_approval_reference: template.whatsappApprovalReference,
      },
    });
  }
}
