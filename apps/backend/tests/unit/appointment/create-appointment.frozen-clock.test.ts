import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateAppointmentUseCase } from '../../../src/modules/appointment/application/use-cases/create-appointment.use-case';
import type { IAppointmentRepository } from '../../../src/modules/appointment/domain/appointment.repository';
import type { IBranchRepository } from '../../../src/modules/tenant/domain/branch.repository';
import type { IPropertyRepository } from '../../../src/modules/property/domain/property.repository';
import type { IServiceTypeRepository } from '../../../src/modules/service-type/domain/service-type.repository';
import type { IPricingRuleRepository } from '../../../src/modules/pricing-rule/domain/pricing-rule.repository';
import type { CreatePropertyUseCase } from '../../../src/modules/property/application/use-cases/create-property.use-case';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { BranchEntity } from '../../../src/modules/tenant/domain/branch.entity';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';
import { ServiceTypeEntity } from '../../../src/modules/service-type/domain/service-type.entity';
import { PricingRuleEntity } from '../../../src/modules/pricing-rule/domain/pricing-rule.entity';
import { AppointmentPastDateError } from '../../../src/modules/appointment/domain/appointment.errors';
import { FakeClock } from '../../helpers/fake-clock';

/**
 * Deterministic past-date edge cases using the Clock port. Before the
 * refactor, these tests could not be written — the boundary ("today" vs
 * "yesterday") depended on the wall clock at the moment the suite ran, so
 * either they were skipped or they drifted.
 *
 * Exercises the single code path we care about: `scheduledDate < today`
 * gated by role. AM/OP bypass is already covered by the regular suite.
 */
describe('CreateAppointmentUseCase — frozen clock boundary (CL_ADMIN)', () => {
  let appointmentRepo: IAppointmentRepository;
  let branchRepo: IBranchRepository;
  let propertyRepo: IPropertyRepository;
  let serviceTypeRepo: IServiceTypeRepository;
  let pricingRuleRepo: IPricingRuleRepository;
  let createPropertyUseCase: CreatePropertyUseCase;
  let auditService: AuditService;
  let authorizationService: AuthorizationService;

  const branch = new BranchEntity({
    id: 'branch-1',
    tenantId: 'tenant-1',
    name: 'Main',
    addressJson: null,
    contactEmail: null,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
  const property = new PropertyEntity({
    id: 'property-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyCode: 'P-001',
    type: 'APARTMENT' as any,
    street: '1 Test St',
    addressLine2: null,
    suburb: 'Sydney',
    postcode: '2000',
    state: 'NSW',
    country: 'AU',
    lat: null,
    lng: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
  const serviceType = new ServiceTypeEntity({
    id: 'svc-type-1',
    code: 'ROUTINE',
    name: 'Routine Inspection',
    flowType: 'ROUTINE',
    requiresTenantConfirmation: true,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const pricingRule = new PricingRuleEntity({
    id: 'rule-1',
    tenantId: 'tenant-1',
    serviceTypeId: 'svc-type-1',
    branchId: null,
    propertyType: null,
    priceAmount: 100,
    payoutMode: 'PERCENTAGE',
    payoutValue: 60,
    status: 'ACTIVE',
    effectiveFrom: new Date('2020-01-01'),
    effectiveTo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    appointmentRepo = {
      save: vi.fn(),
      saveContact: vi.fn(),
      saveRestriction: vi.fn(),
    } as unknown as IAppointmentRepository;
    branchRepo = { findById: vi.fn().mockResolvedValue(branch) } as any;
    propertyRepo = { findById: vi.fn().mockResolvedValue(property) } as any;
    serviceTypeRepo = { findById: vi.fn().mockResolvedValue(serviceType) } as any;
    pricingRuleRepo = {
      findAll: vi.fn().mockResolvedValue([pricingRule]),
      count: vi.fn().mockResolvedValue(1),
    } as any;
    createPropertyUseCase = { execute: vi.fn() } as any;
    auditService = { log: vi.fn() } as unknown as AuditService;
    authorizationService = new AuthorizationService(auditService);
  });

  function buildUseCase(clock: FakeClock): CreateAppointmentUseCase {
    return new CreateAppointmentUseCase(
      appointmentRepo,
      branchRepo,
      propertyRepo,
      serviceTypeRepo,
      pricingRuleRepo,
      createPropertyUseCase,
      auditService,
      authorizationService,
      undefined,
      undefined,
      undefined,
      clock,
    );
  }

  const baseInput = {
    branchId: 'branch-1',
    propertyId: 'property-1',
    serviceTypeId: 'svc-type-1',
    timeSlot: '09:00-10:00',
    contact: { tenantName: 'Test', primaryEmail: 't@example.com' },
    keyRequired: false,
  };

  const actor: AuthContext = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    role: 'CL_ADMIN',
    branchId: null,
    inspectorId: null,
  };

  it('accepts scheduledDate equal to the frozen "today" UTC', async () => {
    const clock = new FakeClock(new Date('2026-06-15T10:00:00Z'));
    const uc = buildUseCase(clock);

    const result = await uc.execute({
      ...baseInput,
      scheduledDate: '2026-06-15',
      actor,
    });

    expect(result.id).toBeDefined();
  });

  it('rejects scheduledDate one day before the frozen "today"', async () => {
    const clock = new FakeClock(new Date('2026-06-15T00:00:01Z'));
    const uc = buildUseCase(clock);

    await expect(
      uc.execute({
        ...baseInput,
        scheduledDate: '2026-06-14',
        actor,
      }),
    ).rejects.toBeInstanceOf(AppointmentPastDateError);
  });

  it('rejects when the UTC day has just rolled over to the next date', async () => {
    // 00:00:05 UTC on June 16 — `todayStr` resolves to "2026-06-16".
    // Input "2026-06-15" is strictly less and must be rejected even though
    // only five seconds ago it was still "today".
    const clock = new FakeClock(new Date('2026-06-16T00:00:05Z'));
    const uc = buildUseCase(clock);

    await expect(
      uc.execute({
        ...baseInput,
        scheduledDate: '2026-06-15',
        actor,
      }),
    ).rejects.toBeInstanceOf(AppointmentPastDateError);
  });
});
