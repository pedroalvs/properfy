import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateTenantUseCase } from '../../../src/modules/tenant/application/use-cases/create-tenant.use-case';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { IAppointmentTimeSlotRepository } from '../../../src/modules/appointment-time-slot/domain/appointment-time-slot.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { DomainEventBus, TENANT_EVENTS } from '../../../src/shared/application/events/domain-event-bus';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import {
  TenantLegalNameConflictError,
  TenantAppointmentCodePrefixConflictError,
} from '../../../src/modules/tenant/domain/tenant.errors';
import { ForbiddenError, ValidationError } from '../../../src/shared/domain/errors';
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
      findByAppointmentCodePrefix: vi.fn().mockResolvedValue(null),
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
      appointmentCodePrefix: 'NEW',
      actor: makeActor(),
    });

    expect(result.status).toBe('PENDING');
    expect(result.appointmentCodePrefix).toBe('NEW');
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
      appointmentCodePrefix: 'EVT',
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
          appointmentCodePrefix: 'AGY',
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
        appointmentCodePrefix: 'ANB',
        actor: makeActor(),
      }),
    ).rejects.toThrow(TenantLegalNameConflictError);
  });

  it('should throw TENANT_PREFIX_CONFLICT when appointmentCodePrefix already exists', async () => {
    vi.mocked(tenantRepo.findByLegalName).mockResolvedValue(null);
    vi.mocked(tenantRepo.findByAppointmentCodePrefix).mockResolvedValue(makeTenant());

    await expect(
      useCase.execute({
        name: 'Prefix Clash Agency',
        legalName: 'Prefix Clash Pty Ltd',
        timezone: 'UTC',
        currency: 'USD',
        appointmentCodePrefix: 'ACME',
        actor: makeActor(),
      }),
    ).rejects.toThrow(TenantAppointmentCodePrefixConflictError);
    expect(tenantRepo.save).not.toHaveBeenCalled();
  });

  it('should persist the appointmentCodePrefix on the saved tenant', async () => {
    vi.mocked(tenantRepo.findByLegalName).mockResolvedValue(null);

    await useCase.execute({
      name: 'Prefix Agency',
      legalName: 'Prefix Agency Pty Ltd',
      timezone: 'Australia/Sydney',
      currency: 'AUD',
      appointmentCodePrefix: 'PRX',
      actor: makeActor(),
    });

    const saved = vi.mocked(tenantRepo.save).mock.calls[0]![0];
    expect(saved.appointmentCodePrefix).toBe('PRX');
  });

  it('rejects an invalid prefix with a ValidationError (non-route caller)', async () => {
    vi.mocked(tenantRepo.findByLegalName).mockResolvedValue(null);

    await expect(
      useCase.execute({
        name: 'Bad Prefix Agency',
        legalName: 'Bad Prefix Pty Ltd',
        timezone: 'Australia/Sydney',
        currency: 'AUD',
        appointmentCodePrefix: 'A', // too short
        actor: makeActor(),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(tenantRepo.save).not.toHaveBeenCalled();
  });

  it('uppercases the prefix for the uniqueness pre-check and persistence', async () => {
    vi.mocked(tenantRepo.findByLegalName).mockResolvedValue(null);

    await useCase.execute({
      name: 'Lower Agency',
      legalName: 'Lower Agency Pty Ltd',
      timezone: 'Australia/Sydney',
      currency: 'AUD',
      appointmentCodePrefix: 'abc',
      actor: makeActor(),
    });

    // Pre-check must use the normalized value so a lowercase input still
    // collides with an existing uppercase prefix.
    expect(tenantRepo.findByAppointmentCodePrefix).toHaveBeenCalledWith('ABC');
    const saved = vi.mocked(tenantRepo.save).mock.calls[0]![0];
    expect(saved.appointmentCodePrefix).toBe('ABC');
  });
});
