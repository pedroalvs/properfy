import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateTenantUseCase } from '../../../src/modules/tenant/application/use-cases/create-tenant.use-case';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { IAppointmentTimeSlotRepository } from '../../../src/modules/appointment-time-slot/domain/appointment-time-slot.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { DomainEventBus, TENANT_EVENTS } from '../../../src/shared/application/events/domain-event-bus';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { TenantLegalNameConflictError } from '../../../src/modules/tenant/domain/tenant.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

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
    settingsJson: {},
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

describe('CreateTenantUseCase', () => {
  let tenantRepo: ITenantRepository;
  let timeSlotRepo: IAppointmentTimeSlotRepository;
  let auditService: AuditService;
  let eventBus: DomainEventBus;
  let useCase: CreateTenantUseCase;

  beforeEach(() => {
    tenantRepo = {
      findById: vi.fn(),
      findByLegalName: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    timeSlotRepo = {
      create: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(),
      findAll: vi.fn(),
      findEffective: vi.fn(),
      softDelete: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    eventBus = new DomainEventBus();
    useCase = new CreateTenantUseCase(tenantRepo, auditService, timeSlotRepo, new AuthorizationService(auditService), eventBus);
  });

  it('should create a tenant with PENDING status when actor is AM', async () => {
    vi.mocked(tenantRepo.findByLegalName).mockResolvedValue(null);

    const result = await useCase.execute({
      name: 'New Agency',
      legalName: 'New Agency Pty Ltd',
      timezone: 'Australia/Sydney',
      currency: 'AUD',
      actor: makeActor(),
    });

    expect(result.status).toBe('PENDING');
    expect(result.name).toBe('New Agency');
    expect(result.legalName).toBe('New Agency Pty Ltd');
    expect(result.id).toBeDefined();
    expect(tenantRepo.save).toHaveBeenCalled();
    expect(timeSlotRepo.create).toHaveBeenCalledTimes(2);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant.created' }),
    );
  });

  it('should emit tenant.created.v1 domain event after successful creation', async () => {
    vi.mocked(tenantRepo.findByLegalName).mockResolvedValue(null);

    const handler = vi.fn();
    eventBus.subscribe(TENANT_EVENTS.CREATED, handler);

    const result = await useCase.execute({
      name: 'Event Agency',
      legalName: 'Event Agency Pty Ltd',
      timezone: 'Australia/Sydney',
      currency: 'AUD',
      actor: makeActor(),
    });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: TENANT_EVENTS.CREATED,
        payload: expect.objectContaining({
          tenantId: result.id,
          name: 'Event Agency',
          legalName: 'Event Agency Pty Ltd',
        }),
      }),
    );
  });

  it('should reject non-AM non-OP roles with AUTH_FORBIDDEN', async () => {
    for (const role of ['CL_ADMIN', 'INSP', 'CL_USER'] as const) {
      await expect(
        useCase.execute({
          name: 'Agency',
          legalName: 'Agency Ltd',
          timezone: 'UTC',
          currency: 'USD',
          actor: makeActor({ role, tenantId: 'tenant-1' }),
        }),
      ).rejects.toThrow(ForbiddenError);
    }
  });

  it('should throw TENANT_LEGAL_NAME_CONFLICT when legalName already exists', async () => {
    vi.mocked(tenantRepo.findByLegalName).mockResolvedValue(makeTenant());

    await expect(
      useCase.execute({
        name: 'Another Agency',
        legalName: 'Test Agency Pty Ltd',
        timezone: 'UTC',
        currency: 'USD',
        actor: makeActor(),
      }),
    ).rejects.toThrow(TenantLegalNameConflictError);
  });
});
