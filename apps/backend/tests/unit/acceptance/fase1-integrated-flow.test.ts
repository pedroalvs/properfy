import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { CreateAppointmentUseCase } from '../../../src/modules/appointment/application/use-cases/create-appointment.use-case';
import { ExecuteStatusTransitionUseCase } from '../../../src/modules/appointment/application/use-cases/execute-status-transition.use-case';
import { CreateServiceGroupUseCase } from '../../../src/modules/service-group/application/use-cases/create-service-group.use-case';
import { PublishServiceGroupUseCase } from '../../../src/modules/service-group/application/use-cases/publish-service-group.use-case';
import { GetMarketplaceOffersUseCase } from '../../../src/modules/service-group/application/use-cases/get-marketplace-offers.use-case';
import { AcceptOfferUseCase } from '../../../src/modules/service-group/application/use-cases/accept-offer.use-case';
import { GetInspectorScheduleUseCase } from '../../../src/modules/inspector-execution/application/use-cases/get-inspector-schedule.use-case';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import { AppointmentRestrictionEntity } from '../../../src/modules/appointment/domain/appointment-restriction.entity';
import { BranchEntity } from '../../../src/modules/tenant/domain/branch.entity';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';
import { ServiceTypeEntity } from '../../../src/modules/service-type/domain/service-type.entity';
import { PricingRuleEntity } from '../../../src/modules/pricing-rule/domain/pricing-rule.entity';
import { ServiceGroupEntity } from '../../../src/modules/service-group/domain/service-group.entity';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import type {
  AppointmentFilters,
  AppointmentListItem,
  AppointmentWithRelations,
  ContactDetail,
  ContactFilters,
  ContactListItem,
  IAppointmentRepository,
  PaginationParams as AppointmentPaginationParams,
} from '../../../src/modules/appointment/domain/appointment.repository';
import type {
  IServiceGroupRepository,
  MarketplaceOffer,
  ServiceGroupFilters,
  ServiceGroupWithAppointments,
  PaginationParams as ServiceGroupPaginationParams,
} from '../../../src/modules/service-group/domain/service-group.repository';
import type { IInspectionExecutionRepository } from '../../../src/modules/inspector-execution/domain/inspection-execution.repository';

const TENANT_ID = 'tenant-1';
const BRANCH_ID = 'branch-1';
const SERVICE_TYPE_ID = 'service-type-1';
const INSPECTOR_ID = 'inspector-1';
const OTHER_INSPECTOR_ID = 'inspector-2';

const clAdminActor: AuthContext = {
  userId: 'cl-admin-1',
  tenantId: TENANT_ID,
  role: 'CL_ADMIN',
  branchId: BRANCH_ID,
  inspectorId: null,
};

const opActor: AuthContext = {
  userId: 'op-1',
  tenantId: null,
  role: 'OP',
  branchId: null,
  inspectorId: null,
};

const inspectorActor: AuthContext = {
  userId: 'insp-user-1',
  tenantId: null,
  role: 'INSP',
  branchId: null,
  inspectorId: INSPECTOR_ID,
};

const otherInspectorActor: AuthContext = {
  userId: 'insp-user-2',
  tenantId: null,
  role: 'INSP',
  branchId: null,
  inspectorId: OTHER_INSPECTOR_ID,
};

function makeBranch(): BranchEntity {
  return new BranchEntity({
    id: BRANCH_ID,
    tenantId: TENANT_ID,
    name: 'City Office',
    addressJson: { suburb: 'Sydney' },
    contactEmail: 'city@example.com',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

function makeProperty(id: string, code: string, suburb: string): PropertyEntity {
  return new PropertyEntity({
    id,
    tenantId: TENANT_ID,
    branchId: BRANCH_ID,
    propertyCode: code,
    type: 'RESIDENTIAL',
    street: `${code} Test St`,
    addressLine2: null,
    suburb,
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

function makeServiceType(): ServiceTypeEntity {
  return new ServiceTypeEntity({
    id: SERVICE_TYPE_ID,
    code: 'INGOING',
    name: 'Ingoing Inspection',
    flowType: 'INGOING',
    requiresTenantConfirmation: false,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makePricingRule(): PricingRuleEntity {
  return new PricingRuleEntity({
    id: 'pricing-rule-1',
    tenantId: TENANT_ID,
    currency: 'AUD',
    serviceTypeId: SERVICE_TYPE_ID,
    branchId: BRANCH_ID,
    priceAmount: 150,
    payoutType: 'FIXED',
    payoutValue: 90,
    bonusRuleJson: null,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeInspector(id: string, userId: string, regions: string[]): InspectorEntity {
  return new InspectorEntity({
    id,
    userId,
    tenantId: null,
    branchId: null,
    name: `Inspector ${id}`,
    email: `${id}@example.com`,
    phone: null,
    status: 'ACTIVE',
    paymentSettingsJson: {},
    serviceTypesJson: [{ serviceTypeId: SERVICE_TYPE_ID, certified: false }],
    clientEligibilityJson: [{ tenantId: TENANT_ID, eligible: true }],
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
  } as ConstructorParameters<typeof InspectorEntity>[0]);
}

class InMemoryAppointmentRepo implements IAppointmentRepository {
  constructor(
    private readonly appointments: Map<string, AppointmentEntity>,
    private readonly contacts: Map<string, AppointmentContactEntity>,
    private readonly restrictions: Map<string, AppointmentRestrictionEntity[]>,
    private readonly properties: Map<string, PropertyEntity>,
    private readonly branches: Map<string, BranchEntity>,
    private readonly serviceTypes: Map<string, ServiceTypeEntity>,
    private readonly inspectors: Map<string, InspectorEntity>,
  ) {}

  async findById(id: string, tenantId: string | null): Promise<AppointmentWithRelations | null> {
    const appointment = this.appointments.get(id);
    if (!appointment) return null;
    if (tenantId && appointment.tenantId !== tenantId) return null;
    const property = this.properties.get(appointment.propertyId);
    const branch = this.branches.get(appointment.branchId);
    const serviceType = this.serviceTypes.get(appointment.serviceTypeId);
    const inspector = appointment.inspectorId
      ? this.inspectors.get(appointment.inspectorId)
      : null;
    return {
      appointment,
      contact: this.contacts.get(id) ?? null,
      restrictions: this.restrictions.get(id) ?? [],
      propertyCode: property?.propertyCode,
      propertyAddress: property?.fullAddress,
      propertySuburb: property?.suburb,
      propertyLatitude: property?.lat ?? null,
      propertyLongitude: property?.lng ?? null,
      branchName: branch?.name,
      serviceTypeName: serviceType?.name,
      inspectorName: inspector?.name ?? null,
    };
  }

  async findAll(
    filters: AppointmentFilters,
    pagination: AppointmentPaginationParams,
  ): Promise<AppointmentListItem[]> {
    const rows = [...this.appointments.values()]
      .filter((appointment) => {
        if (filters.tenantId && appointment.tenantId !== filters.tenantId) return false;
        if (filters.status && appointment.status !== filters.status) return false;
        if (filters.branchId && appointment.branchId !== filters.branchId) return false;
        if (filters.serviceTypeId && appointment.serviceTypeId !== filters.serviceTypeId) return false;
        if (filters.inspectorId && appointment.inspectorId !== filters.inspectorId) return false;
        if (filters.propertyId && appointment.propertyId !== filters.propertyId) return false;
        if (filters.tenantConfirmationStatus && appointment.tenantConfirmationStatus !== filters.tenantConfirmationStatus) return false;
        const scheduledDate = appointment.scheduledDate.toISOString().slice(0, 10);
        if (filters.fromDate && scheduledDate < filters.fromDate) return false;
        if (filters.toDate && scheduledDate > filters.toDate) return false;
        return true;
      })
      .sort((a, b) => a.timeSlot.localeCompare(b.timeSlot))
      .slice(0, pagination.pageSize);

    return rows.map((appointment) => {
      const property = this.properties.get(appointment.propertyId)!;
      const branch = this.branches.get(appointment.branchId)!;
      const serviceType = this.serviceTypes.get(appointment.serviceTypeId)!;
      const inspector = appointment.inspectorId
        ? this.inspectors.get(appointment.inspectorId)
        : null;
      return {
        appointment,
        contact: this.contacts.get(appointment.id) ?? null,
        propertyCode: property.propertyCode,
        propertyAddress: property.fullAddress,
        branchName: branch.name,
        serviceTypeName: serviceType.name,
        inspectorName: inspector?.name ?? null,
      };
    });
  }

  async count(filters: AppointmentFilters): Promise<number> {
    return (await this.findAll(filters, { page: 1, pageSize: 10_000, sortOrder: 'asc' })).length;
  }

  async save(appointment: AppointmentEntity): Promise<void> {
    this.appointments.set(appointment.id, appointment);
  }

  async update(id: string, tenantId: string, data: Record<string, unknown>): Promise<void> {
    const appointment = this.appointments.get(id);
    if (!appointment || appointment.tenantId !== tenantId) return;
    Object.assign(appointment, data, { updatedAt: new Date() });
  }

  async saveContact(contact: AppointmentContactEntity): Promise<void> {
    this.contacts.set(contact.appointmentId, contact);
  }

  async updateContact(): Promise<void> {
    throw new Error('Not implemented for this acceptance proof');
  }

  async saveRestriction(restriction: AppointmentRestrictionEntity): Promise<void> {
    const current = this.restrictions.get(restriction.appointmentId) ?? [];
    current.push(restriction);
    this.restrictions.set(restriction.appointmentId, current);
  }

  async deleteRestrictionsByAppointmentId(appointmentId: string): Promise<void> {
    this.restrictions.delete(appointmentId);
  }

  async findScheduledOnDate(date: Date): Promise<AppointmentWithRelations[]> {
    const targetDate = date.toISOString().slice(0, 10);
    const items = await this.findAll(
      { status: 'SCHEDULED', fromDate: targetDate, toDate: targetDate },
      { page: 1, pageSize: 10_000, sortOrder: 'asc' },
    );
    return items.map((item) => ({
      appointment: item.appointment,
      contact: item.contact,
      restrictions: this.restrictions.get(item.appointment.id) ?? [],
      propertyCode: item.propertyCode,
      propertyAddress: item.propertyAddress,
      branchName: item.branchName,
      serviceTypeName: item.serviceTypeName,
      inspectorName: item.inspectorName,
    }));
  }

  async findAllContacts(): Promise<ContactListItem[]> {
    return [];
  }

  async countContacts(_filters: ContactFilters): Promise<number> {
    return 0;
  }

  async findContactById(_id: string): Promise<ContactDetail | null> {
    return null;
  }

  async findVisibleForInspector(params: {
    inspectorId: string;
    fromDate: string;
    toDate: string;
    today: Date;
  }): Promise<AppointmentListItem[]> {
    // Reuse findAll with T-1 filtering via T1VisibilityService
    const items = await this.findAll(
      { inspectorId: params.inspectorId, status: 'SCHEDULED', fromDate: params.fromDate, toDate: params.toDate },
      { page: 1, pageSize: 1000, sortOrder: 'asc' },
    );
    const { T1VisibilityService } = await import('../../../src/modules/inspector-execution/domain/t1-visibility.service');
    const t1 = new T1VisibilityService();
    return items.filter((item) => {
      const serviceType = this.serviceTypes.get(item.appointment.serviceTypeId);
      const flowType = serviceType?.flowType ?? 'ROUTINE';
      return t1.isVisibleForInspector(
        flowType,
        item.appointment.tenantConfirmationStatus,
        item.appointment.keyRequired,
        item.appointment.scheduledDate,
        params.today,
      );
    });
  }

  async isAppointmentVisibleForInspector(appointmentId: string, today: Date): Promise<boolean> {
    const appointment = this.appointments.get(appointmentId);
    if (!appointment) return false;
    const serviceType = this.serviceTypes.get(appointment.serviceTypeId);
    const flowType = serviceType?.flowType ?? 'ROUTINE';
    const { T1VisibilityService } = await import('../../../src/modules/inspector-execution/domain/t1-visibility.service');
    const t1 = new T1VisibilityService();
    return t1.isVisibleForInspector(
      flowType,
      appointment.tenantConfirmationStatus,
      appointment.keyRequired,
      appointment.scheduledDate,
      today,
    );
  }

  async findDuplicateForImport(): Promise<AppointmentEntity | null> {
    return null;
  }
}

class InMemoryServiceGroupRepo implements IServiceGroupRepository {
  constructor(
    private readonly groups: Map<string, ServiceGroupEntity>,
    private readonly appointments: Map<string, AppointmentEntity>,
    private readonly properties: Map<string, PropertyEntity>,
    private readonly serviceTypes: Map<string, ServiceTypeEntity>,
    private readonly tenants: Map<string, { id: string; name: string }>,
    private readonly inspectors?: Map<string, InspectorEntity>,
  ) {}

  async findById(_id: string, _tenantId: string | null): Promise<ServiceGroupWithAppointments | null> {
    const group = this.groups.get(_id);
    if (!group) return null;
    const appointments = [...this.appointments.values()]
      .filter((appointment) => appointment.serviceGroupId === _id)
      .map((appointment) => ({
        id: appointment.id,
        appointmentNumber: 0,
        status: appointment.status,
        serviceTypeId: appointment.serviceTypeId,
        tenantId: appointment.tenantId,
        propertyId: appointment.propertyId,
        serviceGroupId: appointment.serviceGroupId,
        scheduledDate: appointment.scheduledDate ?? new Date(),
        propertyAddress: null,
        propertyCode: null,
      }));
    const tenantIds = [...new Set(appointments.map((a) => a.tenantId))];
    return {
      group,
      appointments,
      tenantIds,
      primaryTenantId: tenantIds.length === 1 ? tenantIds[0]! : null,
      agencies: tenantIds.map((tid) => ({ id: tid, name: `Agency ${tid}` })),
    };
  }

  async findAll(
    filters: ServiceGroupFilters,
    pagination: ServiceGroupPaginationParams,
  ): Promise<ServiceGroupEntity[]> {
    return [...this.groups.values()]
      .filter((group) => {
        // Groups are tenant-agnostic; tenant filtering is derived from appointments
        // in the real repo and is not exercised by this flow.
        if (filters.status && group.status !== filters.status) return false;
        if (filters.serviceTypeId && group.serviceTypeId !== filters.serviceTypeId) return false;
        return true;
      })
      .slice(0, pagination.pageSize);
  }

  async count(filters: ServiceGroupFilters): Promise<number> {
    return (await this.findAll(filters, { page: 1, pageSize: 10_000, sortOrder: 'asc' })).length;
  }

  async save(group: ServiceGroupEntity): Promise<void> {
    this.groups.set(group.id, group);
  }

  async update(id: string, data: Record<string, unknown>): Promise<void> {
    const group = this.groups.get(id);
    if (!group) return;
    Object.assign(group, data, { updatedAt: new Date() });
  }

  async acceptOptimistic(id: string, inspectorId: string, assignedAt: Date): Promise<number> {
    const group = this.groups.get(id);
    if (!group || group.status !== 'PUBLISHED') return 0;
    Object.assign(group, {
      status: 'ACCEPTED',
      assignedInspectorId: inspectorId,
      assignedAt,
      updatedAt: new Date(),
    });
    return 1;
  }

  async findPublishedForInspector(
    inspectorId: string,
    inspectorServiceTypes: string[],
    inspectorBlockedClients: string[],
    pagination: ServiceGroupPaginationParams,
  ): Promise<MarketplaceOffer[]> {
    // Region filtering is now done via inspector_regions junction table
    // In this in-memory simulation, we skip region-based filtering

    const offers = [...this.groups.values()]
      .filter((group) => group.status === 'PUBLISHED')
      .filter((group) => inspectorServiceTypes.includes(group.serviceTypeId))
      // Denylist semantics: include the group when its tenant is NOT in the
      // blocked list (mirrors AcceptOfferUseCase via Inspector.isEligibleForTenant).
      .filter((group) => !inspectorBlockedClients.includes(group.tenantId))
      // Region filtering skipped in in-memory simulation (handled by spatial queries in production)
      .slice(0, pagination.pageSize)
      .map((group) => {
        const groupAppointments = [...this.appointments.values()].filter(
          (appointment) => appointment.serviceGroupId === group.id,
        );
        const suburbs = [...new Set(groupAppointments.map(
          (appointment) => this.properties.get(appointment.propertyId)?.suburb ?? '',
        ).filter(Boolean))];
        return {
          groupId: group.id,
          tenantId: group.tenantId,
          tenantName: this.tenants.get(group.tenantId)?.name ?? group.tenantId,
          serviceTypeName: this.serviceTypes.get(group.serviceTypeId)?.name ?? group.serviceTypeId,
          groupSize: group.groupSize,
          scheduledDate: group.scheduledDate,
          timeWindow: group.timeWindow,
          priorityMode: group.priorityMode,
          priorityExpiresAt: group.priorityExpiresAt,
          suburbs,
        };
      });
    return offers;
  }

  async countPublishedForInspector(
    inspectorId: string,
    inspectorServiceTypes: string[],
    inspectorBlockedClients: string[],
  ): Promise<number> {
    const offers = await this.findPublishedForInspector(
      inspectorId,
      inspectorServiceTypes,
      inspectorBlockedClients,
      { page: 1, pageSize: 10_000, sortOrder: 'asc' },
    );
    return offers.length;
  }

  async linkAppointments(appointmentIds: string[], groupId: string): Promise<void> {
    for (const appointmentId of appointmentIds) {
      const appointment = this.appointments.get(appointmentId);
      if (appointment) {
        Object.assign(appointment, { serviceGroupId: groupId, updatedAt: new Date() });
      }
    }
  }

  async unlinkAppointments(groupId: string): Promise<void> {
    for (const appointment of this.appointments.values()) {
      if (appointment.serviceGroupId === groupId) {
        Object.assign(appointment, { serviceGroupId: null, updatedAt: new Date() });
      }
    }
  }

  async revertScheduledAppointments(groupId: string): Promise<number> {
    let count = 0;
    for (const appointment of this.appointments.values()) {
      if (appointment.serviceGroupId === groupId && appointment.status === 'SCHEDULED') {
        Object.assign(appointment, {
          status: 'AWAITING_INSPECTOR',
          inspectorId: null,
          updatedAt: new Date(),
        });
        count += 1;
      }
    }
    return count;
  }

  async scheduleAppointments(groupId: string, inspectorId: string): Promise<number> {
    let count = 0;
    for (const appointment of this.appointments.values()) {
      if (appointment.serviceGroupId === groupId && appointment.status === 'AWAITING_INSPECTOR') {
        Object.assign(appointment, {
          status: 'SCHEDULED',
          inspectorId,
          updatedAt: new Date(),
        });
        count += 1;
      }
    }
    return count;
  }
}

describe('FASE 1 integrated proof', () => {
  let createAppointmentUseCase: CreateAppointmentUseCase;
  let executeStatusTransitionUseCase: ExecuteStatusTransitionUseCase;
  let createServiceGroupUseCase: CreateServiceGroupUseCase;
  let publishServiceGroupUseCase: PublishServiceGroupUseCase;
  let getMarketplaceOffersUseCase: GetMarketplaceOffersUseCase;
  let acceptOfferUseCase: AcceptOfferUseCase;
  let getInspectorScheduleUseCase: GetInspectorScheduleUseCase;

  beforeEach(() => {
    const branch = makeBranch();
    const serviceType = makeServiceType();
    const pricingRule = makePricingRule();
    const properties = new Map<string, PropertyEntity>([
      ['property-1', makeProperty('property-1', 'PROP-001', 'Sydney')],
      ['property-2', makeProperty('property-2', 'PROP-002', 'Sydney')],
      ['property-3', makeProperty('property-3', 'PROP-003', 'Sydney')],
      ['property-4', makeProperty('property-4', 'PROP-004', 'Sydney')],
      ['property-5', makeProperty('property-5', 'PROP-005', 'Sydney')],
    ]);
    const inspectors = new Map<string, InspectorEntity>([
      [INSPECTOR_ID, makeInspector(INSPECTOR_ID, inspectorActor.userId, ['Sydney'])],
      [OTHER_INSPECTOR_ID, makeInspector(OTHER_INSPECTOR_ID, otherInspectorActor.userId, ['Melbourne'])],
    ]);
    const appointments = new Map<string, AppointmentEntity>();
    const contacts = new Map<string, AppointmentContactEntity>();
    const restrictions = new Map<string, AppointmentRestrictionEntity[]>();
    const groups = new Map<string, ServiceGroupEntity>();

    const appointmentRepo = new InMemoryAppointmentRepo(
      appointments,
      contacts,
      restrictions,
      properties,
      new Map([[branch.id, branch]]),
      new Map([[serviceType.id, serviceType]]),
      inspectors,
    );

    const serviceGroupRepo = new InMemoryServiceGroupRepo(
      groups,
      appointments,
      properties,
      new Map([[serviceType.id, serviceType]]),
      new Map([[TENANT_ID, { id: TENANT_ID, name: 'Acme Realty' }]]),
      inspectors,
    );

    const branchRepo = {
      findById: vi.fn().mockImplementation(async (id: string) => (id === branch.id ? branch : null)),
    };
    const propertyRepo = {
      findById: vi.fn().mockImplementation(async (id: string, tenantId: string) => {
        const property = properties.get(id);
        if (!property || property.tenantId !== tenantId) return null;
        return property;
      }),
    };
    const serviceTypeRepo = {
      findById: vi.fn().mockImplementation(async (id: string) => (id === serviceType.id ? serviceType : null)),
    };
    const pricingRuleRepo = {
      findAll: vi.fn().mockResolvedValue([pricingRule]),
    };
    const createPropertyUseCase = {
      execute: vi.fn(),
    };
    const auditService = { log: vi.fn() };
    const userRepo = { findById: vi.fn().mockResolvedValue(null) };
    const idempotencyService = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const executionRepo: IInspectionExecutionRepository = {
      findByAppointmentId: vi.fn().mockResolvedValue(null),
      findByAppointmentIds: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      findStuckExecutions: vi.fn().mockResolvedValue([]),
    };
    const inspectorRepo = {
      findById: vi.fn().mockImplementation(async (id: string) => inspectors.get(id) ?? null),
      findByUserId: vi.fn().mockImplementation(async (userId: string) =>
        [...inspectors.values()].find((inspector) => inspector.userId === userId) ?? null,
      ),
    };
    const serviceTypeReader = {
      findById: vi.fn().mockResolvedValue(serviceType),
      findByIds: vi.fn().mockResolvedValue([serviceType]),
    };

    const authorizationService = new AuthorizationService(auditService as any);

    createAppointmentUseCase = new CreateAppointmentUseCase(
      appointmentRepo,
      branchRepo as any,
      propertyRepo as any,
      serviceTypeRepo as any,
      pricingRuleRepo as any,
      createPropertyUseCase as any,
      auditService as any,
      authorizationService,
    );

    executeStatusTransitionUseCase = new ExecuteStatusTransitionUseCase(
      appointmentRepo,
      userRepo as any,
      inspectorRepo as any,
      idempotencyService as any,
      auditService as any,
      authorizationService,
    );

    const mockServiceRegionRepo = {
      findById: vi.fn().mockResolvedValue({ id: 'region-1', tenantId: 'tenant-1', name: 'Test Region', status: 'ACTIVE', isActive: () => true }),
      findByName: vi.fn().mockResolvedValue(null),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      findPropertyIdsInInspectorRegions: vi.fn().mockResolvedValue([]),
      resolveRegionsForAppointments: vi.fn().mockResolvedValue([]),
      findContainingPoint: vi.fn().mockResolvedValue([]),
      countPublishedGroupsByRegionId: vi.fn().mockResolvedValue(0),
      countActiveInspectorsInRegion: vi.fn().mockResolvedValue(1),
      setInspectorRegions: vi.fn(),
      getInspectorRegionIds: vi.fn().mockResolvedValue([]),
      getInspectorRegionIdsBatch: vi.fn().mockResolvedValue(new Map()),
      delete: vi.fn(),
    };

    createServiceGroupUseCase = new CreateServiceGroupUseCase(
      serviceGroupRepo,
      appointmentRepo,
      auditService as any,
      authorizationService,
      mockServiceRegionRepo as any,
    );

    publishServiceGroupUseCase = new PublishServiceGroupUseCase(
      serviceGroupRepo,
      auditService as any,
      mockServiceRegionRepo as any,
      authorizationService,
    );

    getMarketplaceOffersUseCase = new GetMarketplaceOffersUseCase(
      serviceGroupRepo,
      inspectorRepo as any,
      authorizationService,
    );

    acceptOfferUseCase = new AcceptOfferUseCase(
      serviceGroupRepo,
      inspectorRepo as any,
      auditService as any,
      idempotencyService as any,
      authorizationService,
    );

    getInspectorScheduleUseCase = new GetInspectorScheduleUseCase(
      appointmentRepo,
      executionRepo,
      authorizationService,
    );
  });

  it('proves the legitimate flow from real-estate scheduling to inspector schedule visibility', async () => {
    // Use a future date (30 days ahead) so TZ-aware time-slot validation never fires.
    // Past-date and past-time-slot checks only apply to today; future dates always pass.
    const today = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const propertyIds = ['property-1', 'property-2', 'property-3', 'property-4', 'property-5'];

    const createdAppointments = [];
    for (let index = 0; index < propertyIds.length; index += 1) {
      const created = await createAppointmentUseCase.execute({
        branchId: BRANCH_ID,
        propertyId: propertyIds[index]!,
        serviceTypeId: SERVICE_TYPE_ID,
        scheduledDate: today,
        timeSlot: `0${8 + index}:00-0${9 + index}:00`,
        contact: {
          tenantName: `Tenant ${index + 1}`,
          primaryEmail: `tenant${index + 1}@example.com`,
        },
        keyRequired: false,
        actor: clAdminActor,
      });
      createdAppointments.push(created);
    }

    expect(createdAppointments).toHaveLength(5);
    expect(createdAppointments.every((appointment) => appointment.status === 'DRAFT')).toBe(true);
    expect(createdAppointments.every((appointment) => appointment.tenantId === TENANT_ID)).toBe(true);
    expect(createdAppointments.every((appointment) => appointment.branchId === BRANCH_ID)).toBe(true);

    // Creating the service group transitions DRAFT appointments to AWAITING_INSPECTOR
    const group = await createServiceGroupUseCase.execute({
      appointmentIds: createdAppointments.map((appointment) => appointment.id),
      serviceTypeId: SERVICE_TYPE_ID,
      scheduledDate: today,
      timeWindow: '08:00-12:00',
      priorityMode: 'STANDARD',
      serviceRegionId: 'region-1',
      actor: opActor,
    });

    expect(group.status).toBe('DRAFT');
    expect(group.groupSize).toBe(5);

    const published = await publishServiceGroupUseCase.execute({
      groupId: group.id,
      actor: opActor,
    });

    expect(published.status).toBe('PUBLISHED');

    const offers = await getMarketplaceOffersUseCase.execute({
      inspectorId: INSPECTOR_ID,
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: inspectorActor,
    });

    expect(offers.total).toBe(1);
    expect(offers.data[0]?.groupId).toBe(group.id);

    const accepted = await acceptOfferUseCase.execute({
      groupId: group.id,
      inspectorId: INSPECTOR_ID,
      actor: inspectorActor,
    });

    expect(accepted.status).toBe('ACCEPTED');
    expect(accepted.assignedInspectorId).toBe(INSPECTOR_ID);
    expect(accepted.appointmentsScheduled).toBe(5);

    const schedule = await getInspectorScheduleUseCase.execute({
      date: today,
      actor: inspectorActor,
    });

    expect(schedule.date).toBe(today);
    expect(schedule.appointments).toHaveLength(5);
    expect(schedule.appointments.every((appointment) => appointment.status === 'SCHEDULED')).toBe(true);

    const otherInspectorSchedule = await getInspectorScheduleUseCase.execute({
      date: today,
      actor: otherInspectorActor,
    });

    expect(otherInspectorSchedule.appointments).toHaveLength(0);
  });
});
