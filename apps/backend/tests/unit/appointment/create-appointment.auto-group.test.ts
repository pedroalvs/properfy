/**
 * Wiring between appointment creation and the INGOING/OUTGOING auto-group.
 *
 * The behaviour of the grouping itself lives in
 * tests/unit/service-group/auto-group-ingoing-outgoing.service.test.ts — here we
 * only care that the use case calls it with the right data, reflects its outcome,
 * and never lets it break appointment creation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { CreateAppointmentUseCase } from '../../../src/modules/appointment/application/use-cases/create-appointment.use-case';
import type { IAppointmentRepository } from '../../../src/modules/appointment/domain/appointment.repository';
import type { IBranchRepository } from '../../../src/modules/tenant/domain/branch.repository';
import type { IPropertyRepository } from '../../../src/modules/property/domain/property.repository';
import type { IServiceTypeRepository } from '../../../src/modules/service-type/domain/service-type.repository';
import type { IPricingRuleRepository } from '../../../src/modules/pricing-rule/domain/pricing-rule.repository';
import type { CreatePropertyUseCase } from '../../../src/modules/property/application/use-cases/create-property.use-case';
import type { AutoGroupIngoingOutgoingService } from '../../../src/modules/service-group/application/services/auto-group-ingoing-outgoing.service';
import type { IIdempotencyService } from '../../../src/shared/domain/idempotency.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { ServiceTypeEntity } from '../../../src/modules/service-type/domain/service-type.entity';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';
import { PricingRuleEntity } from '../../../src/modules/pricing-rule/domain/pricing-rule.entity';
import { BranchEntity } from '../../../src/modules/tenant/domain/branch.entity';
import { futureDateStr } from '../../helpers/date-fixtures';

const GROUP_ID = 'group-auto-1';

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return { userId: 'user-1', tenantId: 'tenant-1', role: 'CL_ADMIN', branchId: null, inspectorId: null, ...overrides };
}

function makeServiceType(flowType: string) {
  return new ServiceTypeEntity({
    id: 'svc-type-1',
    code: 'SVC',
    name: 'Service',
    flowType: flowType as never,
    requiresRentalTenantConfirmation: false,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeBranch(): BranchEntity {
  return new BranchEntity({
    id: 'branch-1',
    tenantId: 'tenant-1',
    name: 'Main Branch',
    addressJson: null,
    contactEmail: null,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

function makeProperty(): PropertyEntity {
  return new PropertyEntity({
    id: 'property-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyCode: 'PROP-001',
    type: 'HOUSE',
    street: '123 Main St',
    addressLine2: null,
    suburb: 'Sydney',
    postcode: '2000',
    state: 'NSW',
    country: 'AU',
    lat: null,
    lng: null,
    geocodingStatus: 'PENDING',
    notes: null,
    rulesJson: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

function makePricingRule(): PricingRuleEntity {
  return new PricingRuleEntity({
    id: 'pricing-1',
    tenantId: 'tenant-1',
    currency: 'AUD',
    serviceTypeId: 'svc-type-1',
    branchId: null,
    priceAmount: 150,
    payoutType: 'FIXED',
    payoutValue: 80,
    bonusRuleJson: null,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeBranchRepo(): IBranchRepository {
  return { findById: vi.fn().mockResolvedValue(makeBranch()) } as unknown as IBranchRepository;
}

function makePropertyRepo(): IPropertyRepository {
  return { findById: vi.fn().mockResolvedValue(makeProperty()) } as unknown as IPropertyRepository;
}

function makePricingRuleRepo(): IPricingRuleRepository {
  return { findAll: vi.fn().mockResolvedValue([makePricingRule()]) } as unknown as IPricingRuleRepository;
}

describe('CreateAppointmentUseCase — auto-group wiring', () => {
  let appointmentRepo: IAppointmentRepository;
  let autoGroupService: AutoGroupIngoingOutgoingService;
  let idempotencyService: IIdempotencyService;
  let serviceTypeRepo: IServiceTypeRepository;
  let auditService: AuditService;
  let useCase: CreateAppointmentUseCase;
  let baseInput: Parameters<CreateAppointmentUseCase['execute']>[0];

  beforeEach(() => {
    appointmentRepo = {
      findById: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      saveContact: vi.fn(),
      updateContact: vi.fn(),
      saveRestriction: vi.fn(),
      deleteRestrictionsByAppointmentId: vi.fn(),
      replaceRestrictions: vi.fn(),
    } as unknown as IAppointmentRepository;

    const branchRepo = makeBranchRepo();
    const propertyRepo = makePropertyRepo();
    const pricingRuleRepo = makePricingRuleRepo();

    serviceTypeRepo = { findById: vi.fn().mockResolvedValue(makeServiceType('INGOING')) } as unknown as IServiceTypeRepository;

    autoGroupService = {
      tryAutoGroupAndPublish: vi.fn().mockResolvedValue({ kind: 'PUBLISHED', groupId: GROUP_ID }),
    } as unknown as AutoGroupIngoingOutgoingService;

    idempotencyService = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    } as unknown as IIdempotencyService;

    auditService = { log: vi.fn() } as unknown as AuditService;

    useCase = new CreateAppointmentUseCase(
      appointmentRepo,
      branchRepo,
      propertyRepo,
      serviceTypeRepo,
      pricingRuleRepo,
      {} as CreatePropertyUseCase,
      auditService,
      new AuthorizationService(auditService),
      undefined,
      undefined,
      undefined,
      idempotencyService,
      undefined,
      autoGroupService,
    );

    baseInput = {
      branchId: 'branch-1',
      propertyId: 'property-1',
      serviceTypeId: 'svc-type-1',
      scheduledDate: futureDateStr(30),
      timeSlotStart: '09:00',
      timeSlotEnd: '11:00',
      keyRequired: false,
      actor: makeActor(),
    } as Parameters<CreateAppointmentUseCase['execute']>[0];
  });

  it('passes the appointment and its service type flow to the auto-group service', async () => {
    const result = await useCase.execute(baseInput);

    expect(autoGroupService.tryAutoGroupAndPublish).toHaveBeenCalledTimes(1);
    expect(autoGroupService.tryAutoGroupAndPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: result.id,
        tenantId: 'tenant-1',
        serviceTypeId: 'svc-type-1',
        flowType: 'INGOING',
        scheduledDate: baseInput.scheduledDate,
        timeSlotStart: '09:00',
        timeSlotEnd: '11:00',
        // The original actor — the service elevates it to SYS itself.
        actor: expect.objectContaining({ role: 'CL_ADMIN', userId: 'user-1' }),
      }),
    );
  });

  it.each(['PUBLISHED', 'DRAFT'] as const)(
    'reports AWAITING_INSPECTOR and the group id on a %s outcome',
    async (kind) => {
      vi.mocked(autoGroupService.tryAutoGroupAndPublish).mockResolvedValue({
        kind, groupId: GROUP_ID, reason: 'NO_REGION_MATCH',
      } as never);

      const result = await useCase.execute(baseInput);

      expect(result.status).toBe('AWAITING_INSPECTOR');
      expect(result.serviceGroupId).toBe(GROUP_ID);
    },
  );

  it('leaves the appointment DRAFT and ungrouped when the service skips it', async () => {
    vi.mocked(autoGroupService.tryAutoGroupAndPublish).mockResolvedValue({ kind: 'SKIPPED' } as never);

    const result = await useCase.execute(baseInput);

    expect(result.status).toBe('DRAFT');
    expect(result.serviceGroupId).toBeNull();
  });

  it('leaves the appointment DRAFT when the automation failed outright', async () => {
    vi.mocked(autoGroupService.tryAutoGroupAndPublish).mockResolvedValue({
      kind: 'FAILED', reason: 'GROUP_CREATE_FAILED',
    } as never);

    const result = await useCase.execute(baseInput);

    expect(result.status).toBe('DRAFT');
    expect(result.serviceGroupId).toBeNull();
  });

  // Defence in depth. The service promises never to throw, but the appointment
  // row is already persisted by the time step 12b runs: letting an exception
  // escape would report failure for an appointment that exists, and the client's
  // retry would create a duplicate.
  it('still returns the created appointment if the auto-group service throws', async () => {
    vi.mocked(autoGroupService.tryAutoGroupAndPublish).mockRejectedValue(new Error('boom'));

    const result = await useCase.execute(baseInput);

    expect(result.id).toBeDefined();
    expect(result.status).toBe('DRAFT');
    expect(result.serviceGroupId).toBeNull();
    expect(appointmentRepo.save).toHaveBeenCalled();
    // Swallowed, but not silently — CLAUDE.md forbids the empty catch.
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'appointment.auto_group_incomplete',
        metadata: expect.objectContaining({ reason: 'GROUP_CREATE_FAILED' }),
      }),
    );
  });

  // audit_logs is retained, and a driver error is not a controlled string: a
  // Prisma failure can embed the row it choked on, contact emails and phone
  // numbers included. Only the short domain code may be persisted.
  it('never writes the raw error message into the audit metadata', async () => {
    const leaky = Object.assign(
      new Error('Unique constraint failed on contacts (jane.doe@example.com, +61400000000)'),
      { code: 'P2002' },
    );
    vi.mocked(autoGroupService.tryAutoGroupAndPublish).mockRejectedValue(leaky);

    await useCase.execute(baseInput);

    const entry = vi.mocked(auditService.log).mock.calls
      .map((c) => c[0] as { action: string; metadata?: Record<string, unknown> })
      .find((e) => e.action === 'appointment.auto_group_incomplete');

    expect(entry?.metadata?.['errorCode']).toBe('P2002');
    expect(JSON.stringify(entry?.metadata)).not.toContain('jane.doe@example.com');
    expect(JSON.stringify(entry?.metadata)).not.toContain('+61400000000');
  });

  // Same audit action, same metadata key — the service and this caller must not
  // write two different value shapes, or grouping incomplete automations by
  // errorCode returns nonsense.
  it('omits errorCode rather than inventing one when the error carries no code', async () => {
    vi.mocked(autoGroupService.tryAutoGroupAndPublish).mockRejectedValue(new Error('plain boom'));

    await useCase.execute(baseInput);

    const entry = vi.mocked(auditService.log).mock.calls
      .map((c) => c[0] as { action: string; metadata?: Record<string, unknown> })
      .find((e) => e.action === 'appointment.auto_group_incomplete');

    expect(entry?.metadata?.['errorCode']).toBeUndefined();
    expect(JSON.stringify(entry?.metadata)).not.toContain('plain boom');
  });

  it('behaves exactly as before when no auto-group service is wired', async () => {
    const auditService = { log: vi.fn() } as unknown as AuditService;
    const withoutService = new CreateAppointmentUseCase(
      appointmentRepo,
      makeBranchRepo(),
      makePropertyRepo(),
      serviceTypeRepo,
      makePricingRuleRepo(),
      {} as CreatePropertyUseCase,
      auditService,
      new AuthorizationService(auditService),
    );

    const result = await withoutService.execute(baseInput);

    expect(result.status).toBe('DRAFT');
    expect(result.serviceGroupId).toBeNull();
  });

  describe('idempotency ordering', () => {
    // Load-bearing: caching before the grouping runs would freeze a
    // "DRAFT, ungrouped" result for 24h that no retry could repair.
    it('caches the post-grouping state, not the pre-grouping one', async () => {
      await useCase.execute({ ...baseInput, idempotencyKey: 'key-1' } as never);

      expect(idempotencyService.set).toHaveBeenCalledTimes(1);
      const cached = vi.mocked(idempotencyService.set).mock.calls[0][2] as { status: string; serviceGroupId: string };
      expect(cached.status).toBe('AWAITING_INSPECTOR');
      expect(cached.serviceGroupId).toBe(GROUP_ID);
    });

    it('does not re-run the automation on an idempotency cache hit', async () => {
      vi.mocked(idempotencyService.get).mockResolvedValue({
        id: 'appt-cached', status: 'AWAITING_INSPECTOR', serviceGroupId: GROUP_ID,
      } as never);

      await useCase.execute({ ...baseInput, idempotencyKey: 'key-1' } as never);

      expect(autoGroupService.tryAutoGroupAndPublish).not.toHaveBeenCalled();
      expect(appointmentRepo.save).not.toHaveBeenCalled();
    });
  });
});
