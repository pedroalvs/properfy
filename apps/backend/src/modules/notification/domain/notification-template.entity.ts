import { BaseEntity } from '../../../shared/domain/entity';
import type { NotificationChannel, NotificationClass } from '@properfy/shared';

export interface NotificationTemplateProps {
  id: string;
  tenantId: string | null;
  templateCode: string;
  channel: NotificationChannel;
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string;
  variablesJson: string[];
  isActive: boolean;
  notificationClass: NotificationClass;
  /**
   * Fingerprint of the platform-seed content this row was written with, mirroring
   * `notification_templates.seeded_content_hash`. Non-null only on a platform
   * default (`tenant_id IS NULL`) whose content still equals the shipped catalog,
   * which is what lets `syncPlatformTemplates` tell a seeded row from an
   * operator-edited one. Null for agency overrides and for hand-edited defaults.
   */
  seededContentHash?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class NotificationTemplateEntity extends BaseEntity {
  readonly tenantId: string | null;
  readonly templateCode: string;
  readonly channel: NotificationChannel;
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string;
  readonly variablesJson: string[];
  active: boolean;
  notificationClass: NotificationClass;
  seededContentHash: string | null;

  constructor(props: NotificationTemplateProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.tenantId = props.tenantId;
    this.templateCode = props.templateCode;
    this.channel = props.channel;
    this.subject = props.subject;
    this.bodyHtml = props.bodyHtml;
    this.bodyText = props.bodyText;
    this.variablesJson = props.variablesJson;
    this.active = props.isActive;
    this.notificationClass = props.notificationClass;
    this.seededContentHash = props.seededContentHash ?? null;
  }

  isActive(): boolean {
    return this.active;
  }

  isPlatformDefault(): boolean {
    return this.tenantId === null;
  }
}
