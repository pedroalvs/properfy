import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateTenantUseCase } from '../../../src/modules/tenant/application/use-cases/update-tenant.use-case';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import {
  TenantNotFoundError,
  TenantLegalNameConflictError,
} from '../../../src/modules/tenant/domain/tenant.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

function makeTenant(
  overrides: Partial<ConstructorParameters<typeof TenantEntity>[0]> = {},
): TenantEntity {
  return new TenantEntity({
    id: 'tenant-1',
    name: 'Test Agency',
    legalName: 'Test Agency Pty Ltd',
    status: 'ACTIVE',
    timezone: 'Australia/Sydney',
    currency: 'AUD',
    settingsJson: { theme: 'light', notifications: { email: true } },
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

describe('UpdateTenantUseCase', () => {
  let tenantRepo: ITenantRepository;
  let auditService: AuditService;
  let useCase: UpdateTenantUseCase;

  beforeEach(() => {
    tenantRepo = {
      findById: vi.fn(),
      findByLegalName: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new UpdateTenantUseCase(tenantRepo, auditService);
  });

  it('should allow AM to update all fields', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(tenantRepo.findByLegalName).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      data: {
        name: 'Updated Name',
        legalName: 'Updated Legal Name',
        timezone: 'America/Sao_Paulo',
        currency: 'BRL',
      },
      actor: makeActor(),
    });

    expect(result.name).toBe('Updated Name');
    expect(result.legalName).toBe('Updated Legal Name');
    expect(result.timezone).toBe('America/Sao_Paulo');
    expect(result.currency).toBe('BRL');
    expect(tenantRepo.update).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        name: 'Updated Name',
        legalName: 'Updated Legal Name',
        timezone: 'America/Sao_Paulo',
        currency: 'BRL',
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant.updated' }),
    );
  });

  it('should allow CL_ADMIN to update own tenant (only name + settings)', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      data: {
        name: 'New Name',
        settings: { theme: 'dark' },
      },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.name).toBe('New Name');
  });

  it('should strip legalName/timezone/currency when CL_ADMIN updates', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());

    await useCase.execute({
      tenantId: 'tenant-1',
      data: {
        name: 'New Name',
        legalName: 'Hacked Legal Name',
        timezone: 'Hacked/TZ',
        currency: 'FAKE',
      },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    // Verify update was NOT called with legalName, timezone, or currency
    const updateCall = vi.mocked(tenantRepo.update).mock.calls[0]![1]!;
    expect(updateCall).not.toHaveProperty('legalName');
    expect(updateCall).not.toHaveProperty('timezone');
    expect(updateCall).not.toHaveProperty('currency');
  });

  it('should throw TENANT_LEGAL_NAME_CONFLICT when legalName is taken', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(tenantRepo.findByLegalName).mockResolvedValue(
      makeTenant({ id: 'tenant-other' }),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        data: { legalName: 'Taken Legal Name' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(TenantLegalNameConflictError);
  });

  it('should deep merge settings', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({
        settingsJson: {
          theme: 'light',
          notifications: { email: true, sms: false },
        },
      }),
    );

    await useCase.execute({
      tenantId: 'tenant-1',
      data: {
        settings: { notifications: { sms: true } },
      },
      actor: makeActor(),
    });

    const updateCall = vi.mocked(tenantRepo.update).mock.calls[0]![1]!;
    expect(updateCall.settingsJson).toEqual({
      theme: 'light',
      notifications: { email: true, sms: true },
    });
  });

  it('should throw TENANT_NOT_FOUND when tenant does not exist', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'nonexistent',
        data: { name: 'New Name' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(TenantNotFoundError);
  });

  it('should reject non-AM and non-owner CL_ADMIN with AUTH_FORBIDDEN', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        data: { name: 'X' },
        actor: makeActor({ role: 'OP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
