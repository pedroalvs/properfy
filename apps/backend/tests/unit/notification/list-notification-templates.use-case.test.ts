import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListNotificationTemplatesUseCase } from '../../../src/modules/notification/application/use-cases/list-notification-templates.use-case';
import { NotificationTemplateEntity } from '../../../src/modules/notification/domain/notification-template.entity';
import type { INotificationTemplateRepository, NotificationTemplateListItem } from '../../../src/modules/notification/domain/notification-template.repository';
import type { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuthContext } from '@properfy/shared';

function makeActor(role = 'AM'): AuthContext {
  return { userId: 'user-1', role: role as any, tenantId: null, branchId: null, inspectorId: null };
}

function makeTemplate(id: string, code: string) {
  return new NotificationTemplateEntity({
    id,
    tenantId: null,
    templateCode: code,
    channel: 'EMAIL',
    subject: 'Test Subject',
    bodyHtml: '<p>Hello</p>',
    bodyText: 'Hello',
    variablesJson: [],
    isActive: true,
    notificationClass: 'OPERATIONAL',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  });
}

function makeListItem(
  template: NotificationTemplateEntity,
  tenantName: string | null = null,
): NotificationTemplateListItem {
  return { template, tenantName };
}

describe('ListNotificationTemplatesUseCase', () => {
  let templateRepo: INotificationTemplateRepository;
  let authorizationService: AuthorizationService;

  beforeEach(() => {
    templateRepo = {
      findAll: vi.fn(),
      findByTenantCodeChannel: vi.fn(),
      findById: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    };
    authorizationService = {
      assertRoles: vi.fn(),
      can: vi.fn(),
      assertTenantScope: vi.fn(),
    } as unknown as AuthorizationService;
  });

  it('should map template fields to the output item', async () => {
    const template = makeTemplate('tpl-1', 'APPOINTMENT_REMINDER');
    vi.mocked(templateRepo.findAll).mockResolvedValue({ items: [makeListItem(template)], total: 1 });

    const useCase = new ListNotificationTemplatesUseCase(templateRepo, authorizationService);
    const result = await useCase.execute({ actor: makeActor('AM') });

    expect(result.data[0]).toMatchObject({
      id: 'tpl-1',
      templateCode: 'APPOINTMENT_REMINDER',
      channel: 'EMAIL',
      subject: 'Test Subject',
      bodyHtml: '<p>Hello</p>',
      bodyText: 'Hello',
      isActive: true,
    });
  });

  it('should expose the owning agency name (tenantName) per template', async () => {
    const override = makeTemplate('tpl-5', 'INSPECTION_NOTICE');
    const platformDefault = makeTemplate('tpl-6', 'INSPECTION_NOTICE');

    vi.mocked(templateRepo.findAll).mockResolvedValue({
      items: [makeListItem(override, 'Acme Realty'), makeListItem(platformDefault, null)],
      total: 2,
    });

    const useCase = new ListNotificationTemplatesUseCase(templateRepo, authorizationService);
    const result = await useCase.execute({ actor: makeActor('AM') });

    expect(result.data[0]!.tenantName).toBe('Acme Realty');
    expect(result.data[1]!.tenantName).toBeNull();
  });

  it('should expose the notificationClass per row (not defaulted client-side)', async () => {
    const transactional = new NotificationTemplateEntity({
      id: 'tpl-tx',
      tenantId: null,
      templateCode: 'INSPECTION_CANCELLED',
      channel: 'EMAIL',
      subject: 'x',
      bodyHtml: '<p>x</p>',
      bodyText: 'x',
      variablesJson: [],
      isActive: true,
      notificationClass: 'TRANSACTIONAL',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    });
    vi.mocked(templateRepo.findAll).mockResolvedValue({ items: [makeListItem(transactional)], total: 1 });

    const useCase = new ListNotificationTemplatesUseCase(templateRepo, authorizationService);
    const result = await useCase.execute({ actor: makeActor('AM') });

    expect(result.data[0]!.notificationClass).toBe('TRANSACTIONAL');
  });

  it('resolves a search term to matching codes and passes it to the repository', async () => {
    vi.mocked(templateRepo.findAll).mockResolvedValue({ items: [], total: 0 });

    const useCase = new ListNotificationTemplatesUseCase(templateRepo, authorizationService);
    // Search on the friendly NAME, which never appears in the raw code.
    await useCase.execute({ actor: makeActor('AM'), search: 'inspection notice' });

    const filters = vi.mocked(templateRepo.findAll).mock.calls[0]![0];
    expect(filters.search).toBe('inspection notice');
    expect(filters.searchCodes).toContain('INSPECTION_NOTICE');
    // The legacy exact filter must not be set when searching.
    expect(filters.templateCode).toBeUndefined();
  });

  it('falls back to the legacy templateCode filter when no search term is given', async () => {
    vi.mocked(templateRepo.findAll).mockResolvedValue({ items: [], total: 0 });

    const useCase = new ListNotificationTemplatesUseCase(templateRepo, authorizationService);
    await useCase.execute({ actor: makeActor('AM'), templateCode: 'INSPECTION_NOTICE' });

    const filters = vi.mocked(templateRepo.findAll).mock.calls[0]![0];
    expect(filters.templateCode).toBe('INSPECTION_NOTICE');
    expect(filters.search).toBeUndefined();
  });

  it('paginates: page 2 of a 3-page set returns the correct slice and the true total', async () => {
    const all = Array.from({ length: 5 }, (_, i) => makeListItem(makeTemplate(`tpl-${i}`, `CODE_${i}`)));
    // Fake the repo's skip/take so the slice — not just the metadata — is asserted.
    vi.mocked(templateRepo.findAll).mockImplementation(async (filters) => {
      const skip = filters.skip ?? 0;
      const take = filters.take ?? all.length;
      return { items: all.slice(skip, skip + take), total: all.length };
    });

    const useCase = new ListNotificationTemplatesUseCase(templateRepo, authorizationService);
    const result = await useCase.execute({ actor: makeActor('AM'), page: 2, pageSize: 2 });

    // page 2 @ pageSize 2 → skip 2, take 2
    const filters = vi.mocked(templateRepo.findAll).mock.calls[0]![0];
    expect(filters.skip).toBe(2);
    expect(filters.take).toBe(2);
    // True total is the full set, never the returned slice length.
    expect(result.total).toBe(5);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(2);
    expect(result.data.map((d) => d.id)).toEqual(['tpl-2', 'tpl-3']);
  });

  it('defaults to page 1 / pageSize 20 when pagination is omitted', async () => {
    vi.mocked(templateRepo.findAll).mockResolvedValue({ items: [], total: 0 });

    const useCase = new ListNotificationTemplatesUseCase(templateRepo, authorizationService);
    const result = await useCase.execute({ actor: makeActor('AM') });

    const filters = vi.mocked(templateRepo.findAll).mock.calls[0]![0];
    expect(filters.skip).toBe(0);
    expect(filters.take).toBe(20);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });
});
