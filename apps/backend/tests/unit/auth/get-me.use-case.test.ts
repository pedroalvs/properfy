import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetMeUseCase } from '../../../src/modules/auth/application/use-cases/get-me.use-case';
import type { IUserRepository } from '../../../src/modules/auth/domain/user.repository';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import { UnauthorizedError } from '../../../src/shared/domain/errors';

function makeUser(
  overrides: Partial<ConstructorParameters<typeof UserEntity>[0]> = {},
): UserEntity {
  return new UserEntity({
    id: 'user-1',
    tenantId: 'tenant-1',
    branchId: null,
    role: 'CL_ADMIN',
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

describe('GetMeUseCase', () => {
  let userRepo: IUserRepository;
  let useCase: GetMeUseCase;

  beforeEach(() => {
    userRepo = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      save: vi.fn(),
      updateLoginSuccess: vi.fn(),
      updateFailedLogin: vi.fn(),
      updatePassword: vi.fn(),
    };
    useCase = new GetMeUseCase(userRepo);
  });

  it('should return user profile for active user', async () => {
    const lastLogin = new Date('2024-06-15');
    const user = makeUser({ lastLoginAt: lastLogin });
    vi.mocked(userRepo.findById).mockResolvedValue(user);

    const result = await useCase.execute('user-1');

    expect(userRepo.findById).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      phone: null,
      role: 'CL_ADMIN',
      status: 'ACTIVE',
      tenantId: 'tenant-1',
      branchId: null,
      totpEnabled: false,
      lastLoginAt: lastLogin.toISOString(),
      createdAt: new Date('2024-01-01').toISOString(),
    });
  });

  it('should throw UnauthorizedError when user not found', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(null);

    await expect(useCase.execute('non-existent')).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it('should throw UnauthorizedError when user is deleted', async () => {
    const user = makeUser({ deletedAt: new Date('2024-03-01') });
    vi.mocked(userRepo.findById).mockResolvedValue(user);

    await expect(useCase.execute('user-1')).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it('should throw UnauthorizedError when user is inactive', async () => {
    const user = makeUser({ status: 'INACTIVE' });
    vi.mocked(userRepo.findById).mockResolvedValue(user);

    await expect(useCase.execute('user-1')).rejects.toThrow(
      UnauthorizedError,
    );
  });
});
