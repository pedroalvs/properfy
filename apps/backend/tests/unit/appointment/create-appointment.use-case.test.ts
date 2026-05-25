import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
import {
  ForbiddenError,
  ValidationError,
} from '../../../src/shared/domain/errors';
import {
  AppointmentBranchNotFoundError,
  AppointmentPropertyNotFoundError,
  AppointmentPropertyTenantMismatchError,
  AppointmentServiceTypeNotFoundError,
  AppointmentServiceTypeInactiveError,
  AppointmentNoPriceRuleError,
  AppointmentPastDateError,
  AppointmentDateInPastError,
} from '../../../src/modules/appointment/domain/appointment.errors';
import { futureDateStr } from '../../helpers/date-fixtures';

function makeBranch(overrides: Partial<ConstructorParameters<typeof BranchEntity>[0]> = {}): BranchEntity {
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
    ...overrides,
  });
}

function makeProperty(overrides: Partial<ConstructorParameters<typeof PropertyEntity>[0]> = {}): PropertyEntity {
  return new PropertyEntity({
    id: 'property-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyCode: 'PROP-001',
    type: 'RESIDENTIAL',
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
    ...overrides,
  });
}

function makeServiceType(overrides: Partial<ConstructorParameters<typeof ServiceTypeEntity>[0]> = {}): ServiceTypeEntity {
  return new ServiceTypeEntity({
    id: 'svc-type-1',
    code: 'ROUTINE',
    name: 'Routine Inspection',
    flowType: 'STANDARD',
    requiresTenantConfirmation: true,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makePricingRule(overrides: Partial<ConstructorParameters<typeof PricingRuleEntity>[0]> = {}): PricingRuleEntity {
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
    ...overrides,
  });
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

const baseInput = {
  branchId: 'branch-1',
  propertyId: 'property-1',
  serviceTypeId: 'svc-type-1',
  scheduledDate: futureDateStr(60),
  timeSlot: '09:00-10:00',
  contact: {
    tenantName: 'John Smith',
    primaryEmail: 'john@example.com',
    primaryPhone: '+61400000000',
  },
  keyRequired: false,
};

describe('CreateAppointmentUseCase', () => {
  let appointmentRepo: IAppointmentRepository;
  let branchRepo: IBranchRepository;
  let propertyRepo: IPropertyRepository;
  let serviceTypeRepo: IServiceTypeRepository;
  let pricingRuleRepo: IPricingRuleRepository;
  let createPropertyUseCase: CreatePropertyUseCase;
  let auditService: AuditService;
  let useCase: CreateAppointmentUseCase;

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
    };
    branchRepo = {
      findById: vi.fn(),
      findByName: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    propertyRepo = {
      findById: vi.fn(),
      findByPropertyCode: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    serviceTypeRepo = {
      findById: vi.fn(),
      findByCode: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    pricingRuleRepo = {
      findById: vi.fn(),
      findByUnique: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    createPropertyUseCase = {
      execute: vi.fn(),
    } as unknown as CreatePropertyUseCase;
    auditService = { log: vi.fn() } as unknown as AuditService;

    useCase = new CreateAppointmentUseCase(
      appointmentRepo,
      branchRepo,
      propertyRepo,
      serviceTypeRepo,
      pricingRuleRepo,
      createPropertyUseCase,
      auditService,
      new AuthorizationService(auditService),
    );
  });

  it('should create appointment with existing property (happy path)', async () => {
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(pricingRuleRepo.findAll).mockResolvedValue([makePricingRule()]);

    const result = await useCase.execute({
      ...baseInput,
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.id).toBeDefined();
    expect(result.status).toBe('DRAFT');
    expect(result.tenantId).toBe('tenant-1');
    expect(result.tenantConfirmationStatus).toBe('PENDING');
    expect(result.priceAmount).toBe(150);
    expect(result.payoutAmount).toBe(80);
    expect(appointmentRepo.save).toHaveBeenCalled();
    expect(appointmentRepo.saveContact).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'appointment.created' }),
    );
  });

  it('should create appointment with inline property', async () => {
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(pricingRuleRepo.findAll).mockResolvedValue([makePricingRule()]);
    vi.mocked(createPropertyUseCase.execute).mockResolvedValue({
      id: 'new-property-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      propertyCode: 'PROP-INLINE',
      type: 'RESIDENTIAL',
      street: '456 New St',
      addressLine2: null,
      suburb: 'Melbourne',
      postcode: '3000',
      state: 'VIC',
      country: 'AU',
      geocodingStatus: 'PENDING',
      notes: null,
      rulesJson: {},
      createdAt: new Date(),
    });

    const result = await useCase.execute({
      branchId: 'branch-1',
      property: {
        propertyCode: 'PROP-INLINE',
        type: 'RESIDENTIAL',
        street: '456 New St',
        suburb: 'Melbourne',
        postcode: '3000',
        state: 'VIC',
        country: 'AU',
      },
      serviceTypeId: 'svc-type-1',
      scheduledDate: futureDateStr(60),
      timeSlot: '09:00-10:00',
      contact: { tenantName: 'Jane Doe' },
      keyRequired: false,
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.propertyId).toBe('new-property-1');
    expect(createPropertyUseCase.execute).toHaveBeenCalled();
  });

  it('should fail for INSP role (forbidden)', async () => {
    await expect(
      useCase.execute({
        ...baseInput,
        actor: makeActor({ role: 'INSP', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should fail when branch not found (AM/OP path)', async () => {
    vi.mocked(branchRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        ...baseInput,
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(AppointmentBranchNotFoundError);
  });

  it('should fail when branch not found in tenant (CL path)', async () => {
    // First call (AM tenant resolution) is not applicable for CL, but validate branch lookup
    vi.mocked(branchRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        ...baseInput,
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(AppointmentBranchNotFoundError);
  });

  it('should fail when property not found', async () => {
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());
    vi.mocked(propertyRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        ...baseInput,
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(AppointmentPropertyNotFoundError);
  });

  it('should fail when property belongs to a different tenant', async () => {
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());
    // Property has a different tenantId
    vi.mocked(propertyRepo.findById).mockResolvedValue(
      makeProperty({ tenantId: 'tenant-other' }),
    );

    await expect(
      useCase.execute({
        ...baseInput,
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(AppointmentPropertyTenantMismatchError);
  });

  it('should fail when service type not found', async () => {
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        ...baseInput,
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(AppointmentServiceTypeNotFoundError);
  });

  it('should fail when service type is inactive', async () => {
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(
      makeServiceType({ status: 'INACTIVE' }),
    );

    await expect(
      useCase.execute({
        ...baseInput,
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(AppointmentServiceTypeInactiveError);
  });

  it('should fail when no pricing rule found', async () => {
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(pricingRuleRepo.findAll).mockResolvedValue([]);

    await expect(
      useCase.execute({
        ...baseInput,
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(AppointmentNoPriceRuleError);
  });

  it('should create contact alongside appointment', async () => {
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(pricingRuleRepo.findAll).mockResolvedValue([makePricingRule()]);

    const result = await useCase.execute({
      ...baseInput,
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.contact.tenantName).toBe('John Smith');
    expect(result.contact.primaryEmail).toBe('john@example.com');
    expect(appointmentRepo.saveContact).toHaveBeenCalledOnce();
  });

  it('should create restriction if provided', async () => {
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(pricingRuleRepo.findAll).mockResolvedValue([makePricingRule()]);

    const result = await useCase.execute({
      ...baseInput,
      restriction: {
        isHome: true,
        unavailableDays: ['2026-04-03'],
        unavailableHours: ['09:00-12:00'],
        notes: 'Tenant works early morning',
        source: 'OPERATOR',
      },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.restriction).not.toBeNull();
    expect(result.restriction?.isHome).toBe(true);
    expect(result.restriction?.source).toBe('OPERATOR');
    expect(appointmentRepo.saveRestriction).toHaveBeenCalledOnce();
  });

  it('should not create restriction when not provided', async () => {
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(pricingRuleRepo.findAll).mockResolvedValue([makePricingRule()]);

    const result = await useCase.execute({
      ...baseInput,
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.restriction).toBeNull();
    expect(appointmentRepo.saveRestriction).not.toHaveBeenCalled();
  });

  it('should calculate payout correctly for FIXED', async () => {
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(pricingRuleRepo.findAll).mockResolvedValue([
      makePricingRule({ payoutType: 'FIXED', payoutValue: 80 }),
    ]);

    const result = await useCase.execute({
      ...baseInput,
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.payoutAmount).toBe(80);
  });

  it('should calculate payout correctly for PERCENTAGE', async () => {
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(pricingRuleRepo.findAll).mockResolvedValue([
      makePricingRule({
        priceAmount: 200,
        payoutType: 'PERCENTAGE',
        payoutValue: 60,
      }),
    ]);

    const result = await useCase.execute({
      ...baseInput,
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    // 200 * 60 / 100 = 120
    expect(result.payoutAmount).toBe(120);
  });

  it('should throw ValidationError when neither propertyId nor inline property provided', async () => {
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());

    const { propertyId: _removed, ...inputWithoutProperty } = baseInput;

    await expect(
      useCase.execute({
        ...inputWithoutProperty,
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ValidationError);
  });

  // Past date prevention
  describe('past date prevention', () => {
    it('should reject past scheduledDate for CL_ADMIN', async () => {
      await expect(
        useCase.execute({
          ...baseInput,
          scheduledDate: '2020-01-01',
          actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
        }),
      ).rejects.toThrow(AppointmentDateInPastError);
    });

    // Cycle 6: AM/OP past-date exemption removed — universal rejection for all roles.
    it('should reject past scheduledDate for AM', async () => {
      await expect(
        useCase.execute({
          ...baseInput,
          scheduledDate: '2020-01-01',
          actor: makeActor({ role: 'AM' }),
        }),
      ).rejects.toThrow(AppointmentDateInPastError);
    });

    it('should reject past scheduledDate for OP', async () => {
      await expect(
        useCase.execute({
          ...baseInput,
          scheduledDate: '2020-01-01',
          actor: makeActor({ role: 'OP', tenantId: 'tenant-1' }),
        }),
      ).rejects.toThrow(AppointmentDateInPastError);
    });

    it('should accept today for CL_ADMIN', async () => {
      // Freeze before baseInput timeSlot (09:00) so the slot is not yet past.
      vi.useFakeTimers({ now: new Date('2027-01-15T07:00:00Z') });
      vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());
      vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
      vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
      vi.mocked(pricingRuleRepo.findAll).mockResolvedValue([makePricingRule()]);

      const result = await useCase.execute({
        ...baseInput,
        scheduledDate: '2027-01-15', // matches frozen date
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      });

      expect(result.status).toBe('DRAFT');
      vi.useRealTimers();
    });
  });

  // H4: CL_USER permission check
  describe('CL_USER create_appointments permission', () => {

    it('should allow CL_USER with create_appointments permission', async () => {
      const uc = new CreateAppointmentUseCase(
        appointmentRepo, branchRepo, propertyRepo, serviceTypeRepo,
        pricingRuleRepo, createPropertyUseCase, auditService, new AuthorizationService(auditService),
      );
      vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());
      vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
      vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
      vi.mocked(pricingRuleRepo.findAll).mockResolvedValue([makePricingRule()]);

      const result = await uc.execute({
        ...baseInput,
        actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1', clUserPermissions: ['create_appointments'] }),
      });
      expect(result.status).toBe('DRAFT');
    });

    it('should throw ForbiddenError for CL_USER without create_appointments permission', async () => {
      const uc = new CreateAppointmentUseCase(
        appointmentRepo, branchRepo, propertyRepo, serviceTypeRepo,
        pricingRuleRepo, createPropertyUseCase, auditService, new AuthorizationService(auditService),
      );

      await expect(
        uc.execute({
          ...baseInput,
          actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1', clUserPermissions: [] }),
        }),
      ).rejects.toThrow('CL_USER does not have create_appointments permission');
    });
  });
});
