import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateAppCredentialUseCase } from '../../../src/modules/app-credential/application/use-cases/create-app-credential.use-case';
import { UpdateAppCredentialUseCase } from '../../../src/modules/app-credential/application/use-cases/update-app-credential.use-case';
import { GetAppCredentialUseCase } from '../../../src/modules/app-credential/application/use-cases/get-app-credential.use-case';
import { ListAppCredentialsUseCase } from '../../../src/modules/app-credential/application/use-cases/list-app-credentials.use-case';
import { AppCredentialEntity } from '../../../src/modules/app-credential/domain/app-credential.entity';
import { AppCredentialNotFoundError } from '../../../src/modules/app-credential/domain/app-credential.errors';

const repo = {
  findById: vi.fn(),
  findAll: vi.fn(),
  count: vi.fn(),
  search: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  findByIds: vi.fn(),
  findByAppointmentId: vi.fn(),
  replaceAppointmentLinks: vi.fn(),
};
const auditService = { log: vi.fn() };

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const ACTOR_ID = 'user-1';

function makeEntity(overrides: Partial<ConstructorParameters<typeof AppCredentialEntity>[0]> = {}) {
  return new AppCredentialEntity({
    id: 'cred-1',
    tenantId: TENANT_ID,
    name: 'Airbnb',
    username: 'host',
    password: 'secret',
    isActive: true,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
    ...overrides,
  });
}

beforeEach(() => vi.clearAllMocks());

describe('CreateAppCredentialUseCase', () => {
  it('saves the credential with plaintext password and audits without leaking it', async () => {
    const sut = new CreateAppCredentialUseCase(repo as any, auditService as any);
    const result = await sut.execute({
      tenantId: TENANT_ID, name: 'Airbnb', username: 'host', password: 'secret',
      actorId: ACTOR_ID, actorTenantId: null,
    });

    expect(repo.save).toHaveBeenCalledTimes(1);
    const saved = repo.save.mock.calls[0][0] as AppCredentialEntity;
    expect(saved.password).toBe('secret');
    expect(saved.tenantId).toBe(TENANT_ID);
    expect(result.isActive).toBe(true);

    expect(auditService.log).toHaveBeenCalledTimes(1);
    const audit = auditService.log.mock.calls[0][0];
    expect(audit.action).toBe('app_credential.created');
    expect(JSON.stringify(audit)).not.toContain('secret');
  });
});

describe('UpdateAppCredentialUseCase', () => {
  it('throws when the credential does not exist', async () => {
    repo.findById.mockResolvedValueOnce(null);
    const sut = new UpdateAppCredentialUseCase(repo as any, auditService as any);
    await expect(
      sut.execute({ id: 'missing', actorId: ACTOR_ID, data: { name: 'x' } }),
    ).rejects.toBeInstanceOf(AppCredentialNotFoundError);
  });

  it('records app_credential.deactivated when isActive flips to false', async () => {
    repo.findById
      .mockResolvedValueOnce(makeEntity({ isActive: true }))
      .mockResolvedValueOnce(makeEntity({ isActive: false }));
    const sut = new UpdateAppCredentialUseCase(repo as any, auditService as any);
    await sut.execute({ id: 'cred-1', actorId: ACTOR_ID, data: { isActive: false } });
    expect(auditService.log.mock.calls[0][0].action).toBe('app_credential.deactivated');
  });

  it('flags passwordChanged without logging the password value', async () => {
    repo.findById
      .mockResolvedValueOnce(makeEntity())
      .mockResolvedValueOnce(makeEntity({ password: 'newpass' }));
    const sut = new UpdateAppCredentialUseCase(repo as any, auditService as any);
    await sut.execute({ id: 'cred-1', actorId: ACTOR_ID, data: { password: 'newpass' } });
    const audit = auditService.log.mock.calls[0][0];
    expect(audit.action).toBe('app_credential.updated');
    expect(audit.after.passwordChanged).toBe(true);
    expect(JSON.stringify(audit)).not.toContain('newpass');
  });
});

describe('GetAppCredentialUseCase', () => {
  it('returns the credential', async () => {
    repo.findById.mockResolvedValueOnce(makeEntity());
    const sut = new GetAppCredentialUseCase(repo as any);
    const result = await sut.execute('cred-1');
    expect(result.name).toBe('Airbnb');
  });

  it('throws when not found', async () => {
    repo.findById.mockResolvedValueOnce(null);
    const sut = new GetAppCredentialUseCase(repo as any);
    await expect(sut.execute('missing')).rejects.toBeInstanceOf(AppCredentialNotFoundError);
  });
});

describe('ListAppCredentialsUseCase', () => {
  it('passes filters through and returns total', async () => {
    repo.findAll.mockResolvedValueOnce([{ credential: makeEntity(), tenantName: 'Agency A' }]);
    repo.count.mockResolvedValueOnce(1);
    const sut = new ListAppCredentialsUseCase(repo as any);
    const result = await sut.execute({
      tenantId: TENANT_ID, search: 'air', page: 1, pageSize: 20, sortBy: 'name', sortOrder: 'asc',
    });
    expect(result.total).toBe(1);
    expect(result.data[0]!.tenantName).toBe('Agency A');
    expect(repo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID, search: 'air' }),
      expect.objectContaining({ page: 1, pageSize: 20 }),
    );
  });
});
