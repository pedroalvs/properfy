import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateMyTimezoneUseCase } from '../../../src/modules/auth/application/use-cases/update-my-timezone.use-case';
import type { IUserRepository } from '../../../src/modules/auth/domain/user.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import { ForbiddenError, UnauthorizedError, ValidationError } from '../../../src/shared/domain/errors';

function makeUser(
  overrides: Partial<ConstructorParameters<typeof UserEntity>[0]> = {},
): UserEntity {
  return new UserEntity({
    id: 'user-1',
    tenantId: null,
    branchId: null,
    role: 'AM',
    name: 'Test User',
    email: 'test@example.com',
    phone: null,
    status: 'ACTIVE',
    passwordHash: '$2a$12$dummy',
    totpSecret: null,
    totpEnabled: false,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
    ...overrides,
  });
}

describe('UpdateMyTimezoneUseCase', () => {
  let userRepo: IUserRepository;
  let auditService: AuditService;
  let useCase: UpdateMyTimezoneUseCase;

  beforeEach(() => {
    userRepo = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      save: vi.fn(),
      updateLoginSuccess: vi.fn(),
      updateFailedLogin: vi.fn(),
      updatePassword: vi.fn(),
      updateTimezone: vi.fn(),
      updateTotpSecret: vi.fn(),
      updateTotpEnabled: vi.fn(),
      activateUser: vi.fn(),
    } as unknown as IUserRepository;
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new UpdateMyTimezoneUseCase(userRepo, auditService);
  });

  it.each(['AM', 'OP', 'INSP'] as const)('updates the timezone for %s', async (role) => {
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser({ role, timezone: null }));

    await useCase.execute({ userId: 'user-1', timezone: 'Pacific/Auckland' });

    expect(userRepo.updateTimezone).toHaveBeenCalledWith('user-1', 'Pacific/Auckland');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.timezone_updated',
        entityId: 'user-1',
        before: expect.objectContaining({ timezone: null }),
        after: expect.objectContaining({ timezone: 'Pacific/Auckland' }),
      }),
    );
  });

  it.each(['CL_ADMIN', 'CL_USER'] as const)(
    'rejects %s — agency users inherit the agency timezone',
    async (role) => {
      vi.mocked(userRepo.findById).mockResolvedValue(makeUser({ role, tenantId: 'tenant-1' }));

      await expect(
        useCase.execute({ userId: 'user-1', timezone: 'Pacific/Auckland' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(userRepo.updateTimezone).not.toHaveBeenCalled();
    },
  );

  it('clears the personal timezone with null', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser({ role: 'OP', timezone: 'Pacific/Auckland' }));

    await useCase.execute({ userId: 'user-1', timezone: null });

    expect(userRepo.updateTimezone).toHaveBeenCalledWith('user-1', null);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        before: expect.objectContaining({ timezone: 'Pacific/Auckland' }),
        after: expect.objectContaining({ timezone: null }),
      }),
    );
  });

  it('rejects an invalid IANA identifier', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser());

    await expect(
      useCase.execute({ userId: 'user-1', timezone: 'Sydney' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(userRepo.updateTimezone).not.toHaveBeenCalled();
  });

  it('rejects unknown or inactive users', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({ userId: 'ghost', timezone: 'UTC' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
