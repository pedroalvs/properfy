import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListNotificationTemplatesUseCase } from '../../../src/modules/notification/application/use-cases/list-notification-templates.use-case';
import type { INotificationTemplateRepository } from '../../../src/modules/notification/domain/notification-template.repository';
import { NotificationTemplateEntity } from '../../../src/modules/notification/domain/notification-template.entity';
import type { AuthContext } from '@properfy/shared';
import { NotificationForbiddenError } from '../../../src/modules/notification/domain/notification.errors';

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

function makeTemplateEntity(
  overrides: Partial<ConstructorParameters<typeof NotificationTemplateEntity>[0]> = {},
): NotificationTemplateEntity {
  return new NotificationTemplateEntity({
    id: 'tpl-1',
    tenantId: null,
    templateCode: 'INSPECTION_NOTICE',
    channel: 'EMAIL',
    subject: 'Inspection Notice',
    bodyHtml: '<p>Hello {{tenantName}}</p>',
    bodyText: 'Hello {{tenantName}}',
    variablesJson: ['tenantName'],
    isActive: true,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    ...overrides,
  });
}

describe('ListNotificationTemplatesUseCase', () => {
  let templateRepo: INotificationTemplateRepository;
  let useCase: ListNotificationTemplatesUseCase;

  beforeEach(() => {
    templateRepo = {
      findByTenantCodeChannel: vi.fn(),
      findAll: vi.fn(),
      upsert: vi.fn(),
    };
    useCase = new ListNotificationTemplatesUseCase(templateRepo);
  });

  it('should throw NotificationForbiddenError for OP role', async () => {
    await expect(
      useCase.execute({ actor: makeActor({ role: 'OP' }) }),
    ).rejects.toThrow(NotificationForbiddenError);
  });

  it('should throw NotificationForbiddenError for INSP role', async () => {
    await expect(
      useCase.execute({ actor: makeActor({ role: 'INSP' }) }),
    ).rejects.toThrow(NotificationForbiddenError);
  });

  it('should allow AM to list all templates', async () => {
    vi.mocked(templateRepo.findAll).mockResolvedValue([makeTemplateEntity()]);

    const result = await useCase.execute({ actor: makeActor({ role: 'AM' }) });

    expect(result.data).toHaveLength(1);
    expect(templateRepo.findAll).toHaveBeenCalledWith({});
  });

  it('should allow CL_ADMIN to list own tenant templates', async () => {
    vi.mocked(templateRepo.findAll).mockResolvedValue([
      makeTemplateEntity({ tenantId: 'tenant-1' }),
    ]);

    const result = await useCase.execute({
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].tenantId).toBe('tenant-1');
  });

  it('should force tenantId for CL_ADMIN', async () => {
    vi.mocked(templateRepo.findAll).mockResolvedValue([]);

    await useCase.execute({
      tenantId: 'other-tenant',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(templateRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
    );
  });

  it('should pass includeDefaults for CL_ADMIN', async () => {
    vi.mocked(templateRepo.findAll).mockResolvedValue([]);

    await useCase.execute({
      includeDefaults: false,
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(templateRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ includeDefaults: false }),
    );
  });

  it('should default includeDefaults to true for CL_ADMIN', async () => {
    vi.mocked(templateRepo.findAll).mockResolvedValue([]);

    await useCase.execute({
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(templateRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ includeDefaults: true }),
    );
  });

  it('should pass templateCode and channel filters', async () => {
    vi.mocked(templateRepo.findAll).mockResolvedValue([]);

    await useCase.execute({
      templateCode: 'REMINDER_7_DAYS',
      channel: 'SMS',
      actor: makeActor({ role: 'AM' }),
    });

    expect(templateRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        templateCode: 'REMINDER_7_DAYS',
        channel: 'SMS',
      }),
    );
  });

  it('should pass tenantId filter for AM', async () => {
    vi.mocked(templateRepo.findAll).mockResolvedValue([]);

    await useCase.execute({
      tenantId: 'tenant-42',
      actor: makeActor({ role: 'AM' }),
    });

    expect(templateRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-42' }),
    );
  });

  it('should default includeDefaults to true for AM when tenantId is provided', async () => {
    vi.mocked(templateRepo.findAll).mockResolvedValue([]);

    await useCase.execute({
      tenantId: 'tenant-42',
      actor: makeActor({ role: 'AM' }),
    });

    expect(templateRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-42', includeDefaults: true }),
    );
  });

  it('should not set includeDefaults for AM when no tenantId is provided', async () => {
    vi.mocked(templateRepo.findAll).mockResolvedValue([]);

    await useCase.execute({
      actor: makeActor({ role: 'AM' }),
    });

    expect(templateRepo.findAll).toHaveBeenCalledWith({});
  });

  it('should return mapped template items with variables', async () => {
    vi.mocked(templateRepo.findAll).mockResolvedValue([
      makeTemplateEntity({
        id: 'tpl-1',
        variablesJson: ['tenantName', 'propertyAddress'],
      }),
    ]);

    const result = await useCase.execute({ actor: makeActor({ role: 'AM' }) });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual({
      id: 'tpl-1',
      tenantId: null,
      templateCode: 'INSPECTION_NOTICE',
      channel: 'EMAIL',
      subject: 'Inspection Notice',
      bodyText: 'Hello {{tenantName}}',
      isActive: true,
      variables: ['tenantName', 'propertyAddress'],
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
    });
  });

  it('should return empty data when no templates found', async () => {
    vi.mocked(templateRepo.findAll).mockResolvedValue([]);

    const result = await useCase.execute({ actor: makeActor({ role: 'AM' }) });

    expect(result.data).toEqual([]);
  });
});
