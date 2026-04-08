import { describe, it, expect } from 'vitest';
import {
  NotificationTemplateEntity,
  type NotificationTemplateProps,
} from '../../../src/modules/notification/domain/notification-template.entity';

function makeTemplate(overrides: Partial<NotificationTemplateProps> = {}): NotificationTemplateEntity {
  const now = new Date();
  const defaults: NotificationTemplateProps = {
    id: 'tpl-1',
    tenantId: null,
    templateCode: 'INSPECTION_NOTICE',
    channel: 'EMAIL',
    subject: 'Your upcoming inspection',
    bodyHtml: '<p>Hello {{tenantName}}</p>',
    bodyText: 'Hello {{tenantName}}',
    variablesJson: ['tenantName'],
    isActive: true,
    whatsappApprovalStatus: 'PENDING',
    whatsappApprovalReference: null,
    createdAt: now,
    updatedAt: now,
  };
  return new NotificationTemplateEntity({ ...defaults, ...overrides });
}

describe('NotificationTemplateEntity', () => {
  it('should create an entity with all props', () => {
    const template = makeTemplate();

    expect(template.id).toBe('tpl-1');
    expect(template.tenantId).toBeNull();
    expect(template.templateCode).toBe('INSPECTION_NOTICE');
    expect(template.channel).toBe('EMAIL');
    expect(template.subject).toBe('Your upcoming inspection');
    expect(template.bodyHtml).toBe('<p>Hello {{tenantName}}</p>');
    expect(template.bodyText).toBe('Hello {{tenantName}}');
    expect(template.variablesJson).toEqual(['tenantName']);
    expect(template.active).toBe(true);
  });

  it('should allow tenant-specific template', () => {
    const template = makeTemplate({ tenantId: 'tenant-1' });
    expect(template.tenantId).toBe('tenant-1');
  });

  it('should allow null subject and bodyHtml', () => {
    const template = makeTemplate({ subject: null, bodyHtml: null, channel: 'SMS' });
    expect(template.subject).toBeNull();
    expect(template.bodyHtml).toBeNull();
  });

  describe('isActive()', () => {
    it('should return true when active is true', () => {
      const template = makeTemplate({ isActive: true });
      expect(template.isActive()).toBe(true);
    });

    it('should return false when active is false', () => {
      const template = makeTemplate({ isActive: false });
      expect(template.isActive()).toBe(false);
    });
  });

  describe('isPlatformDefault()', () => {
    it('should return true when tenantId is null', () => {
      const template = makeTemplate({ tenantId: null });
      expect(template.isPlatformDefault()).toBe(true);
    });

    it('should return false when tenantId is set', () => {
      const template = makeTemplate({ tenantId: 'tenant-1' });
      expect(template.isPlatformDefault()).toBe(false);
    });
  });

  describe('isWhatsAppApproved()', () => {
    it('should return true when whatsappApprovalStatus is APPROVED', () => {
      const template = makeTemplate({ whatsappApprovalStatus: 'APPROVED' });
      expect(template.isWhatsAppApproved()).toBe(true);
    });

    it('should return false when whatsappApprovalStatus is PENDING', () => {
      const template = makeTemplate({ whatsappApprovalStatus: 'PENDING' });
      expect(template.isWhatsAppApproved()).toBe(false);
    });

    it('should return false when whatsappApprovalStatus is REJECTED', () => {
      const template = makeTemplate({ whatsappApprovalStatus: 'REJECTED' });
      expect(template.isWhatsAppApproved()).toBe(false);
    });
  });

  describe('whatsapp approval fields', () => {
    it('should store whatsappApprovalReference', () => {
      const template = makeTemplate({
        whatsappApprovalStatus: 'APPROVED',
        whatsappApprovalReference: 'WA-REF-123',
      });
      expect(template.whatsappApprovalReference).toBe('WA-REF-123');
    });

    it('should allow null whatsappApprovalReference', () => {
      const template = makeTemplate({ whatsappApprovalReference: null });
      expect(template.whatsappApprovalReference).toBeNull();
    });
  });
});
