import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationTemplateEntity } from '../../../src/modules/notification/domain/notification-template.entity';
import { PrismaNotificationTemplateRepository } from '../../../src/modules/notification/infrastructure/prisma-notification-template.repository';

function makeTemplate(overrides: Partial<ConstructorParameters<typeof NotificationTemplateEntity>[0]> = {}) {
  return new NotificationTemplateEntity({
    id: 'template-1',
    tenantId: null,
    templateCode: 'INSPECTION_NOTICE',
    channel: 'EMAIL',
    subject: 'Subject',
    bodyHtml: '<p>Hello</p>',
    bodyText: 'Hello',
    variablesJson: ['tenantName'],
    isActive: true,
    notificationClass: 'OPERATIONAL',
    createdAt: new Date('2026-03-24T00:00:00.000Z'),
    updatedAt: new Date('2026-03-24T00:00:00.000Z'),
    ...overrides,
  });
}

describe('PrismaNotificationTemplateRepository', () => {
  const prisma = {
    notificationTemplate: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  };

  let repository: PrismaNotificationTemplateRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new PrismaNotificationTemplateRepository(prisma as never);
  });

  it('updates an existing global template using tenant_id = null lookup', async () => {
    prisma.notificationTemplate.findFirst.mockResolvedValue({ id: 'existing-template' });

    await repository.upsert(makeTemplate());

    expect(prisma.notificationTemplate.findFirst).toHaveBeenCalledWith({
      where: {
        tenant_id: null,
        template_code: 'INSPECTION_NOTICE',
        channel: 'EMAIL',
      },
      select: { id: true },
    });
    expect(prisma.notificationTemplate.update).toHaveBeenCalledWith({
      where: { id: 'existing-template' },
      data: {
        subject: 'Subject',
        body_html: '<p>Hello</p>',
        body_text: 'Hello',
        variables_json: ['tenantName'],
        is_active: true,
        notification_class: 'OPERATIONAL',
      },
    });
    expect(prisma.notificationTemplate.create).not.toHaveBeenCalled();
  });

  it('creates a new global template when none exists', async () => {
    prisma.notificationTemplate.findFirst.mockResolvedValue(null);

    await repository.upsert(makeTemplate());

    expect(prisma.notificationTemplate.create).toHaveBeenCalledWith({
      data: {
        id: 'template-1',
        tenant_id: null,
        template_code: 'INSPECTION_NOTICE',
        channel: 'EMAIL',
        subject: 'Subject',
        body_html: '<p>Hello</p>',
        body_text: 'Hello',
        variables_json: ['tenantName'],
        is_active: true,
        notification_class: 'OPERATIONAL',
      },
    });
    expect(prisma.notificationTemplate.update).not.toHaveBeenCalled();
  });

  it('keeps tenant-scoped upsert behavior for agency overrides', async () => {
    prisma.notificationTemplate.findFirst.mockResolvedValue({ id: 'tenant-template' });

    await repository.upsert(makeTemplate({ tenantId: 'tenant-1' }));

    expect(prisma.notificationTemplate.findFirst).toHaveBeenCalledWith({
      where: {
        tenant_id: 'tenant-1',
        template_code: 'INSPECTION_NOTICE',
        channel: 'EMAIL',
      },
      select: { id: true },
    });
    expect(prisma.notificationTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tenant-template' },
      }),
    );
  });
});
