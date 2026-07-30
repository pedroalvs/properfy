import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

// bcrypt at cost 12 takes a few hundred ms per call by design. Running it for
// real here added enough CPU contention to time out unrelated bcrypt tests in
// the full parallel suite, so it is stubbed: what matters is WHICH value gets
// hashed and at what cost, not re-verifying bcrypt itself.
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(async (value: string) => `hashed:${value}`),
    compare: vi.fn(async (value: string, hash: string) => hash === `hashed:${value}`),
  },
}));

import { CreateInspectorUseCase } from '../../../src/modules/inspector/application/use-cases/create-inspector.use-case';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { IUserManagementRepository } from '../../../src/modules/user/domain/user-management.repository';
import type { IServiceRegionRepository } from '../../../src/modules/service-region/domain/service-region.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { inspectorResponseSchema } from '@properfy/shared';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import { InspectorEmailConflictError } from '../../../src/modules/inspector/domain/inspector.errors';
import {
  PasswordTooWeakError,
  PasswordTooCommonError,
} from '../../../src/modules/auth/domain/auth.errors';
import { COMMON_PASSWORDS } from '../../../src/modules/auth/application/constants/common-passwords';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

/** Satisfies the canonical password policy shared with createUserSchema. */
const VALID_PASSWORD = 'Insp@2026x';

function makeInspector(
  overrides: Partial<ConstructorParameters<typeof InspectorEntity>[0]> = {},
): InspectorEntity {
  return new InspectorEntity({
    id: 'inspector-1',
    name: 'John Inspector',
    email: 'john@example.com',
    phone: '+61400000000',
    status: 'ACTIVE',
    paymentSettingsJson: {},
    serviceTypesJson: [{ serviceTypeId: 'service-1', certified: false }],
    blockedClientsJson: [],
    fullName: null,
    address: null,
    abn: null,
    dateOfBirth: null,
    insuranceFileKey: null,
    insuranceExpiresAt: null,
    policeCheckFileKey: null,
    policeCheckExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-am-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

describe('CreateInspectorUseCase', () => {
  let inspectorRepo: IInspectorRepository;
  let userManagementRepo: IUserManagementRepository;
  let auditService: AuditService;
  let useCase: CreateInspectorUseCase;

  beforeEach(() => {
    inspectorRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findByUserId: vi.fn(),
      linkUserId: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      findByRegionId: vi.fn(),
    };
    userManagementRepo = {
      findById: vi.fn(),
      findByIdAndTenantId: vi.fn(),
      findByEmail: vi.fn(),
      findByPhone: vi.fn(),
      findByTenantId: vi.fn(),
      countByTenantId: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      resetPassword: vi.fn(),
      unlock: vi.fn(),
      revokeAllSessions: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    const authorizationService = new AuthorizationService(auditService);
    useCase = new CreateInspectorUseCase(inspectorRepo, userManagementRepo, auditService, undefined, authorizationService);
  });

  it('should create inspector for AM with auto-created user record', async () => {
    vi.mocked(inspectorRepo.findByEmail).mockResolvedValue(null);

    const result = await useCase.execute({
      name: 'John Inspector',
      email: 'john@example.com',
      password: VALID_PASSWORD,
      phone: '+61400000000',
      actor: makeActor(),
    });

    expect(result.status).toBe('ACTIVE');
    expect(result.name).toBe('John Inspector');
    expect(result.email).toBe('john@example.com');
    expect(result.id).toBeDefined();
    expect(result.userId).toBeDefined();
    expect(userManagementRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'INSP',
        email: 'john@example.com',
        tenantId: null,
        branchId: null,
        status: 'ACTIVE',
      }),
    );
    expect(inspectorRepo.save).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'inspector.created' }),
    );
  });

  it('returns an output that satisfies inspectorResponseSchema (HTTP response contract)', async () => {
    // Guards against field drift between the use case output and the route's
    // declared response schema. The Fastify zod serializerCompiler parses the
    // response body against this exact schema before sending the 201, so a
    // missing required field (e.g. updatedAt) throws AFTER the rows are
    // committed — the inspector persists but the client sees a 500.
    vi.mocked(inspectorRepo.findByEmail).mockResolvedValue(null);

    const result = await useCase.execute({
      name: 'John Inspector',
      email: 'john@example.com',
      password: VALID_PASSWORD,
      actor: makeActor(),
    });

    expect(() => inspectorResponseSchema.parse(result)).not.toThrow();
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it('should create inspector for OP', async () => {
    vi.mocked(inspectorRepo.findByEmail).mockResolvedValue(null);

    const result = await useCase.execute({
      name: 'Jane Inspector',
      email: 'jane@example.com',
      password: VALID_PASSWORD,
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.status).toBe('ACTIVE');
    expect(result.name).toBe('Jane Inspector');
    expect(inspectorRepo.save).toHaveBeenCalled();
  });

  it('should reject CL_ADMIN with AUTH_FORBIDDEN', async () => {
    await expect(
      useCase.execute({
        name: 'Inspector',
        email: 'test@example.com',
        password: VALID_PASSWORD,
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw INSPECTOR_EMAIL_CONFLICT when email already exists', async () => {
    vi.mocked(inspectorRepo.findByEmail).mockResolvedValue(makeInspector());

    await expect(
      useCase.execute({
        name: 'Another Inspector',
        email: 'john@example.com',
        password: VALID_PASSWORD,
        actor: makeActor(),
      }),
    ).rejects.toThrow(InspectorEmailConflictError);
  });

  describe('operator-supplied password', () => {
    beforeEach(() => {
      vi.mocked(inspectorRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(userManagementRepo.findByEmail).mockResolvedValue(null);
    });

    it('hashes the operator-supplied password onto the login account', async () => {
      await useCase.execute({
        name: 'John Inspector',
        email: 'john@example.com',
        password: VALID_PASSWORD,
        actor: makeActor(),
      });

      // The regression this guards: the use case used to hash a discarded
      // crypto.randomUUID() instead of the operator's password, leaving an
      // account nobody could ever log into.
      expect(bcrypt.hash).toHaveBeenCalledWith(VALID_PASSWORD, 12);

      const savedUser = vi.mocked(userManagementRepo.save).mock.calls[0][0];
      expect(savedUser.passwordHash).not.toBe(VALID_PASSWORD);
      expect(savedUser.passwordHash).toBe(`hashed:${VALID_PASSWORD}`);
    });

    it('rejects a password that fails the strength policy', async () => {
      await expect(
        useCase.execute({
          name: 'John Inspector',
          email: 'john@example.com',
          password: 'weak',
          actor: makeActor(),
        }),
      ).rejects.toThrow(PasswordTooWeakError);

      expect(userManagementRepo.save).not.toHaveBeenCalled();
      expect(inspectorRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a blacklisted common password', async () => {
      // The blacklist check runs after the strength check, so it is only
      // reachable by a password strong enough to get past it. Real blacklist
      // entries ('password123') fail strength first — hence the injection,
      // mirroring create-user.use-case.test.ts. The set holds the lowercased
      // form because the lookup is COMMON_PASSWORDS.has(password.toLowerCase()),
      // while the password itself needs an uppercase char to pass strength.
      COMMON_PASSWORDS.add('blacklisted1!strong');
      try {
        await expect(
          useCase.execute({
            name: 'John Inspector',
            email: 'john@example.com',
            password: 'Blacklisted1!Strong',
            actor: makeActor(),
          }),
        ).rejects.toThrow(PasswordTooCommonError);

        expect(userManagementRepo.save).not.toHaveBeenCalled();
      } finally {
        COMMON_PASSWORDS.delete('blacklisted1!strong');
      }
    });
  });

  describe('email collision with an existing login account', () => {
    it('rejects when the email already belongs to a user, even with no inspector row', async () => {
      // users.email has no unique constraint and findByEmail uses findFirst, so a
      // collision would make login non-deterministic once real passwords exist.
      vi.mocked(inspectorRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(userManagementRepo.findByEmail).mockResolvedValue(
        new UserEntity({
          id: 'user-existing',
          tenantId: 'tenant-1',
          branchId: null,
          role: 'CL_USER',
          name: 'Existing',
          email: 'john@example.com',
          phone: null,
          status: 'ACTIVE',
          passwordHash: 'hash',
          totpSecret: null,
          totpEnabled: false,
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        }),
      );

      // Reuses INSPECTOR_EMAIL_CONFLICT rather than USER_EMAIL_CONFLICT because
      // the web form only maps that code onto the inline email field error.
      await expect(
        useCase.execute({
          name: 'Another Inspector',
          email: 'john@example.com',
          password: VALID_PASSWORD,
          actor: makeActor(),
        }),
      ).rejects.toThrow(InspectorEmailConflictError);

      expect(userManagementRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('compensation for the untransacted double write', () => {
    it('soft-deletes the orphan login account when the inspector save fails', async () => {
      // Without this, a failed inspector save leaves an INSP user holding a real,
      // working password that no API can see, reach, or ever recreate.
      vi.mocked(inspectorRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(userManagementRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(inspectorRepo.save).mockRejectedValue(new Error('db down'));

      await expect(
        useCase.execute({
          name: 'John Inspector',
          email: 'john@example.com',
          password: VALID_PASSWORD,
          actor: makeActor(),
        }),
      ).rejects.toThrow('db down');

      const savedUser = vi.mocked(userManagementRepo.save).mock.calls[0][0];
      expect(userManagementRepo.update).toHaveBeenCalledWith(
        savedUser.id,
        null,
        expect.objectContaining({ deletedAt: expect.any(Date) }),
      );
    });

    it('does not destroy the login account when only the region link fails', async () => {
      // The inspector row is already committed at that point. Soft-deleting its
      // user would leave an inspector whose user_id points at a deleted account:
      // link-user 409s (userId non-null), reset-password 404s, re-creating the
      // same email 409s forever, and there is no DELETE inspector route.
      const serviceRegionRepo = {
        setInspectorRegions: vi.fn().mockRejectedValue(new Error('region FK violation')),
      } as unknown as IServiceRegionRepository;
      const withRegions = new CreateInspectorUseCase(
        inspectorRepo,
        userManagementRepo,
        auditService,
        serviceRegionRepo,
        new AuthorizationService(auditService),
      );
      vi.mocked(inspectorRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(userManagementRepo.findByEmail).mockResolvedValue(null);

      await expect(
        withRegions.execute({
          name: 'John Inspector',
          email: 'john@example.com',
          password: VALID_PASSWORD,
          regionIds: ['11111111-1111-4111-8111-111111111111'],
          actor: makeActor(),
        }),
      ).rejects.toThrow('region FK violation');

      expect(userManagementRepo.update).not.toHaveBeenCalled();
    });

    it('surfaces the original failure even when the compensation itself fails', async () => {
      // Otherwise the operator sees "compensation failed" and loses the actual
      // reason the inspector could not be created.
      vi.mocked(inspectorRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(userManagementRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(inspectorRepo.save).mockRejectedValue(new Error('db down'));
      vi.mocked(userManagementRepo.update).mockRejectedValue(new Error('compensation exploded'));

      await expect(
        useCase.execute({
          name: 'John Inspector',
          email: 'john@example.com',
          password: VALID_PASSWORD,
          actor: makeActor(),
        }),
      ).rejects.toThrow('db down');
    });

    it('audits a failed compensation so the surviving orphan is traceable', async () => {
      // That orphan permanently blocks its email via the user-email check, and
      // no logger is injected here — the audit trail is the only record.
      vi.mocked(inspectorRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(userManagementRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(inspectorRepo.save).mockRejectedValue(new Error('db down'));
      vi.mocked(userManagementRepo.update).mockRejectedValue(new Error('compensation exploded'));

      await expect(
        useCase.execute({
          name: 'John Inspector',
          email: 'john@example.com',
          password: VALID_PASSWORD,
          actor: makeActor(),
        }),
      ).rejects.toThrow('db down');

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'inspector.create_compensation_failed',
          entityType: 'User',
          metadata: expect.objectContaining({
            email: 'john@example.com',
            originalError: 'db down',
            compensationError: 'compensation exploded',
          }),
        }),
      );
    });
  });
});
