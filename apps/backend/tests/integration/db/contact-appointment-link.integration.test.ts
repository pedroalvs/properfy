/**
 * BUG-024-002 — End-to-end Postgres test for the cross-tenant contact-link
 * path in `CreateAppointmentUseCase` and `UpdateAppointmentUseCase`.
 *
 * Why this exists separately from the unit guard
 * (`tests/unit/appointment/bug-024-001-cross-tenant-link.test.ts`):
 * the unit guard mocks `IContactRepository.findById`, which returns the
 * configured value regardless of the `tenantId` argument. Cycle 2 of the
 * 024 fix passed the unit suite because the mock ignored the wrong
 * `lookupTenantId` it received, but production Prisma's
 * `WHERE id = $1 AND tenant_id = $2` filtered the row out. Captured as
 * memory feedback `feedback_mock_masks_real_bug.md` — for any code that
 * depends on a multi-tenant SQL filter, the contract MUST be validated
 * against real Postgres.
 *
 * What's tested here:
 *   1. CL_ADMIN(B) links a contact whose registry row lives in TenantA but
 *      is operationally visible to B via `appointment_contacts` → 201.
 *      Pre-fix this returned 400 because the use case scoped the lookup
 *      by `tenantId = B`.
 *   2. CL_ADMIN(B) tries to link a contact unreachable from B (no junction
 *      in B) → 404 NotFoundError (FR-022 collapse via OBS-024-003 — was 400).
 *   3. CL_ADMIN(B) tries to link a contactId that does not exist → 404.
 *   4. AM links the same TenantA contact into TenantB → 201 (cross-tenant
 *      unrestricted; visibility gate is skipped for AM/OP).
 *   5. UpdateAppointmentUseCase parity: CL_ADMIN(B) replaces the contacts
 *      array with a TenantA-registered contact reachable via junction → ok.
 *
 * The use case is exercised with the REAL `PrismaContactRepository` (the
 * SQL surface under test) and minimal mocks for the orthogonal collaborators
 * (branch/property/serviceType/pricingRule/audit/timeSlot/auth). The
 * appointment repo is also mocked because the test focuses on the contact
 * lookup path — saving the appointment row itself is orchestration, not
 * the contract under test.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaContactRepository } from '../../../src/modules/contact/infrastructure/prisma-contact.repository';
import { CreateAppointmentUseCase } from '../../../src/modules/appointment/application/use-cases/create-appointment.use-case';
import { UpdateAppointmentUseCase } from '../../../src/modules/appointment/application/use-cases/update-appointment.use-case';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { NotFoundError } from '../../../src/shared/domain/errors';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { BranchEntity } from '../../../src/modules/tenant/domain/branch.entity';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';
import { ServiceTypeEntity } from '../../../src/modules/service-type/domain/service-type.entity';
import { PricingRuleEntity } from '../../../src/modules/pricing-rule/domain/pricing-rule.entity';
import type { IAppointmentRepository } from '../../../src/modules/appointment/domain/appointment.repository';
import type { IBranchRepository } from '../../../src/modules/tenant/domain/branch.repository';
import type { IPropertyRepository } from '../../../src/modules/property/domain/property.repository';
import type { IServiceTypeRepository } from '../../../src/modules/service-type/domain/service-type.repository';
import type { IPricingRuleRepository } from '../../../src/modules/pricing-rule/domain/pricing-rule.repository';
import type { CreatePropertyUseCase } from '../../../src/modules/property/application/use-cases/create-property.use-case';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { futureDateStr } from '../../helpers/date-fixtures';

let harness: DbHarness;
let contactRepo: PrismaContactRepository;

const seed = {
  tenantA: '',
  tenantB: '',
  branchB: '',
  propertyB: '',
  serviceTypeId: '',
  appointmentInB: '',
  contactInA: '',
  contactStandalone: '',
};

const NON_EXISTENT_CONTACT_ID = '00000000-0000-4000-8000-000000000099';

beforeAll(async () => {
  harness = await setupDbHarness();
  contactRepo = new PrismaContactRepository(harness.prisma);

  // --- Tenants ---
  const tenantA = await harness.prisma.tenant.create({
    data: { name: 'BUG-024-002-A', legal_name: 'A LLC', status: 'ACTIVE' },
  });
  const tenantB = await harness.prisma.tenant.create({
    data: { name: 'BUG-024-002-B', legal_name: 'B LLC', status: 'ACTIVE' },
  });

  // --- TenantB chain (where the appointment lives) ---
  const branchB = await harness.prisma.branch.create({
    data: { tenant_id: tenantB.id, name: 'B-Branch', status: 'ACTIVE' },
  });
  const userB = await harness.prisma.user.create({
    data: {
      tenant_id: tenantB.id, branch_id: branchB.id, role: 'CL_ADMIN',
      name: 'B-User',
      email: `bug024-002-b-${Math.random().toString(36).slice(2, 8)}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
      status: 'ACTIVE',
    },
  });
  const propertyB = await harness.prisma.property.create({
    data: {
      tenant_id: tenantB.id, branch_id: branchB.id,
      property_code: `BUG-024-002-B-${Math.random().toString(36).slice(2, 6)}`,
      type: 'RESIDENTIAL',
      street: '1 B St', suburb: 'B', postcode: '3000', state: 'VIC', country: 'AU',
      geocoding_status: 'SUCCESS',
    },
  });
  const serviceType = await harness.prisma.serviceType.create({
    data: {
      code: `BUG-024-002-ST-${Math.random().toString(36).slice(2, 6)}`,
      name: 'Test Inspection', flow_type: 'ROUTINE',
      requires_tenant_confirmation: false, status: 'ACTIVE',
    },
  });
  const apptInB = await harness.prisma.appointment.create({
    data: {
      tenant_id: tenantB.id, branch_id: branchB.id,
      property_id: propertyB.id, service_type_id: serviceType.id,
      status: 'SCHEDULED', scheduled_date: new Date(futureDateStr(60)),
      time_slot: '09:00-10:00',
      price_amount: '100.00', payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      tenant_confirmation_status: 'CONFIRMED',
      created_by_user_id: userB.id,
    },
  });

  // --- Contacts (registry rows live wherever) ---
  const cInA = await harness.prisma.contact.create({
    data: {
      tenant: { connect: { id: tenantA.id } },
      type: 'PROPERTY_MANAGER',
      display_name: 'A-Owned Contact',
      primary_email: `bug024-002-a-${Math.random().toString(36).slice(2, 6)}@test.local`,
      additional_channels_json: [], is_active: true,
    },
  });
  const cStandalone = await harness.prisma.contact.create({
    data: {
      type: 'TENANT',
      display_name: 'Standalone Contact (no junction in B)',
      primary_email: `bug024-002-stand-${Math.random().toString(36).slice(2, 6)}@test.local`,
      additional_channels_json: [], is_active: true,
    },
  });

  // --- Junction: link A-owned contact to the TenantB appointment so it is
  //     operationally visible to CL_ADMIN(B). The standalone contact has
  //     no junction → not visible to CL.
  await harness.prisma.appointmentContact.create({
    data: {
      appointment: { connect: { id: apptInB.id } },
      contact: { connect: { id: cInA.id } },
      role: 'PROPERTY_MANAGER', is_primary: false,
      tenant_name: 'A-Owned Contact',
      snapshot_name: 'A-Owned Contact',
      snapshot_email: cInA.primary_email,
    },
  });

  Object.assign(seed, {
    tenantA: tenantA.id,
    tenantB: tenantB.id,
    branchB: branchB.id,
    propertyB: propertyB.id,
    serviceTypeId: serviceType.id,
    appointmentInB: apptInB.id,
    contactInA: cInA.id,
    contactStandalone: cStandalone.id,
  });
}, 180_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

/**
 * Builds a CreateAppointmentUseCase with the real contactRepo and minimal
 * mocked collaborators. The branch/property/serviceType/pricingRule
 * lookups are stubbed to return seed-aligned entities so the use case
 * proceeds to the contact-link path (the surface we actually care about).
 * The appointment repo's `save` and `saveContact` are also stubbed — we
 * assert call shape, not that the appointment row landed in Postgres
 * (orchestration vs SQL contract).
 */
function buildCreateUseCase() {
  const appointmentRepo = makeAppointmentRepoMock();
  const branchRepo: IBranchRepository = {
    findById: vi.fn(async (id: string) => new BranchEntity({
      id, tenantId: seed.tenantB, name: 'B-Branch',
      addressJson: null, contactEmail: null, status: 'ACTIVE',
      createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    })),
    findByName: vi.fn(), findAll: vi.fn(), count: vi.fn(),
    save: vi.fn(), update: vi.fn(),
  } as unknown as IBranchRepository;
  const propertyRepo: IPropertyRepository = {
    findById: vi.fn(async (id: string) => new PropertyEntity({
      id, tenantId: seed.tenantB, branchId: seed.branchB,
      propertyCode: 'PROP-1', type: 'RESIDENTIAL',
      street: '1 St', addressLine2: null, suburb: 'S',
      postcode: '3000', state: 'VIC', country: 'AU',
      lat: null, lng: null, geocodingStatus: 'SUCCESS',
      notes: null, rulesJson: {},
      createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    })),
    findByPropertyCode: vi.fn(), findAll: vi.fn(), count: vi.fn(),
    save: vi.fn(), update: vi.fn(),
  } as unknown as IPropertyRepository;
  const serviceTypeRepo: IServiceTypeRepository = {
    findById: vi.fn(async (id: string) => new ServiceTypeEntity({
      id, code: 'ROUTINE', name: 'Routine', flowType: 'STANDARD',
      requiresTenantConfirmation: false, status: 'ACTIVE',
      createdAt: new Date(), updatedAt: new Date(),
    })),
    findByCode: vi.fn(), findAll: vi.fn(), count: vi.fn(),
    save: vi.fn(), update: vi.fn(),
  } as unknown as IServiceTypeRepository;
  const pricingRuleRepo: IPricingRuleRepository = {
    findById: vi.fn(),
    findByUnique: vi.fn(),
    findAll: vi.fn(async () => [new PricingRuleEntity({
      id: 'pricing-1', tenantId: seed.tenantB, currency: 'AUD',
      serviceTypeId: 'svc-type-1', branchId: null,
      priceAmount: 150, payoutType: 'FIXED', payoutValue: 80,
      bonusRuleJson: null, status: 'ACTIVE',
      createdAt: new Date(), updatedAt: new Date(),
    })]),
    count: vi.fn(), save: vi.fn(), update: vi.fn(),
  } as unknown as IPricingRuleRepository;
  const createPropertyUseCase = { execute: vi.fn() } as unknown as CreatePropertyUseCase;
  const auditService = { log: vi.fn() } as unknown as AuditService;

  const useCase = new CreateAppointmentUseCase(
    appointmentRepo,
    branchRepo,
    propertyRepo,
    serviceTypeRepo,
    pricingRuleRepo,
    createPropertyUseCase,
    auditService,
    new AuthorizationService(auditService),
    undefined, // tenantRepo
    undefined, // timeSlotRepo
    contactRepo, // REAL Prisma-backed repo — the SQL contract under test.
  );
  return { useCase, appointmentRepo };
}

function makeAppointmentRepoMock(): IAppointmentRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    findVisibleForInspector: vi.fn(),
    isAppointmentVisibleForInspector: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    saveContact: vi.fn(),
    updateContact: vi.fn(),
    updateContactSnapshot: vi.fn(),
    deleteContactsByAppointmentId: vi.fn(),
    saveRestriction: vi.fn(),
    deleteRestrictionsByAppointmentId: vi.fn(),
    findScheduledOnDate: vi.fn(),
    findAllContacts: vi.fn(),
    countContacts: vi.fn(),
  } as unknown as IAppointmentRepository;
}

function actor(role: string, tenantId: string | null): AuthContext {
  return {
    userId: '00000000-0000-4000-8000-000000000001',
    tenantId, role, branchId: null, inspectorId: null,
  } as AuthContext;
}

const baseInputForCreate = () => ({
  branchId: seed.branchB,
  propertyId: seed.propertyB,
  serviceTypeId: seed.serviceTypeId,
  scheduledDate: futureDateStr(60),
  timeSlot: '09:00-10:00',
  keyRequired: false,
});

describe('BUG-024-002 — CreateAppointmentUseCase against real Postgres', () => {
  let suiteSpy: { useCase: CreateAppointmentUseCase; appointmentRepo: IAppointmentRepository };

  beforeEach(() => {
    suiteSpy = buildCreateUseCase();
  });

  it('CL_ADMIN(B) links a TenantA-registered contact reachable in B via the operational junction → 201', async () => {
    // This is the exact scenario the cycle-2 mock test claimed to cover.
    // Production Prisma's WHERE tenant_id = B previously filtered out
    // the row; cycle-3 fix uses tenant_id = NULL (global lookup) and
    // gates visibility via existsLinkedToTenant.
    const result = await suiteSpy.useCase.execute({
      ...baseInputForCreate(),
      contacts: [{ contactId: seed.contactInA, role: 'PROPERTY_MANAGER', isPrimary: true }] as any,
      actor: actor('CL_ADMIN', seed.tenantB),
    });

    expect(result.id).toBeDefined();
    expect(result.tenantId).toBe(seed.tenantB);
    expect(suiteSpy.appointmentRepo.saveContact).toHaveBeenCalled();
  });

  it('CL_ADMIN(B) cannot link a contact with no operational junction in B → NotFoundError 404 (OBS-024-003 collapse)', async () => {
    // Standalone contact exists in registry but has no appointment_contacts
    // row in B. Pre-fix this surfaced as ValidationError 400 ("not found in
    // tenant"); cycle-3 fix surfaces it as NotFoundError 404 (FR-022 collapse
    // shared with "row does not exist" below).
    await expect(
      suiteSpy.useCase.execute({
        ...baseInputForCreate(),
        contacts: [{ contactId: seed.contactStandalone, role: 'TENANT', isPrimary: true }] as any,
        actor: actor('CL_ADMIN', seed.tenantB),
      }),
    ).rejects.toThrow(NotFoundError);
    expect(suiteSpy.appointmentRepo.saveContact).not.toHaveBeenCalled();
  });

  it('CL_ADMIN(B) cannot link a contactId that does not exist anywhere → NotFoundError 404 (same shape)', async () => {
    await expect(
      suiteSpy.useCase.execute({
        ...baseInputForCreate(),
        contacts: [{ contactId: NON_EXISTENT_CONTACT_ID, role: 'TENANT', isPrimary: true }] as any,
        actor: actor('CL_ADMIN', seed.tenantB),
      }),
    ).rejects.toThrow(NotFoundError);
    expect(suiteSpy.appointmentRepo.saveContact).not.toHaveBeenCalled();
  });

  it('AM links the same TenantA-registered contact into a TenantB appointment → 201 (cross-tenant, visibility gate skipped)', async () => {
    const result = await suiteSpy.useCase.execute({
      ...baseInputForCreate(),
      contacts: [{ contactId: seed.contactInA, role: 'PROPERTY_MANAGER', isPrimary: true }] as any,
      actor: actor('AM', null),
    });

    expect(result.id).toBeDefined();
    expect(result.tenantId).toBe(seed.tenantB);
    expect(suiteSpy.appointmentRepo.saveContact).toHaveBeenCalled();
  });

  it('AM also links a STANDALONE contact (tenant_id = null) → 201', async () => {
    const result = await suiteSpy.useCase.execute({
      ...baseInputForCreate(),
      contacts: [{ contactId: seed.contactStandalone, role: 'TENANT', isPrimary: true }] as any,
      actor: actor('AM', null),
    });

    expect(result.id).toBeDefined();
    expect(suiteSpy.appointmentRepo.saveContact).toHaveBeenCalled();
  });
});

describe('BUG-024-002 — UpdateAppointmentUseCase against real Postgres (parity)', () => {
  function buildUpdateUseCase() {
    const appointmentRepo = makeAppointmentRepoMock();
    // Real existing appointment fixture so the use case can proceed.
    vi.mocked(appointmentRepo.findById).mockResolvedValue({
      appointment: new AppointmentEntity({
        id: seed.appointmentInB, appointmentNumber: 1,
        tenantId: seed.tenantB, branchId: seed.branchB,
        propertyId: seed.propertyB, serviceTypeId: seed.serviceTypeId,
        inspectorId: null, status: 'DRAFT',
        scheduledDate: new Date(futureDateStr(60)), timeSlot: '09:00-10:00',
        keyRequired: false, meetingLocation: null, keyLocation: null,
        tenantConfirmationStatus: 'PENDING',
        priceAmount: 150, payoutAmount: 80, pricingRuleSnapshotJson: {},
        notes: null, tenantNote: null, customFieldsJson: null,
        reason: null, cancellationReasonCode: null, rejectionReasonCode: null,
        createdByUserId: 'user-1',
        doneMarkedByUserId: null, doneCheckedByUserId: null, doneCheckedAt: null,
        serviceGroupId: null, deletedAt: null,
        createdAt: new Date(), updatedAt: new Date(),
      }),
      contacts: [], restrictions: [],
    } as any);
    const auditService = { log: vi.fn() } as unknown as AuditService;
    const useCase = new UpdateAppointmentUseCase(
      appointmentRepo,
      auditService,
      new AuthorizationService(auditService),
      undefined, // tenantRepo
      undefined, // timeSlotRepo
      contactRepo, // REAL Prisma-backed repo
    );
    return { useCase, appointmentRepo };
  }

  it('CL_ADMIN(B) replaces contacts with a TenantA-registered contact reachable in B', async () => {
    const { useCase, appointmentRepo } = buildUpdateUseCase();

    await useCase.execute({
      appointmentId: seed.appointmentInB,
      data: {
        contacts: [{ contactId: seed.contactInA, role: 'PROPERTY_MANAGER', isPrimary: true }] as any,
      },
      actor: actor('CL_ADMIN', seed.tenantB),
    });

    expect(appointmentRepo.deleteContactsByAppointmentId).toHaveBeenCalledWith(seed.appointmentInB);
    expect(appointmentRepo.saveContact).toHaveBeenCalled();
  });

  it('CL_ADMIN(B) cannot replace contacts with one unreachable from B → NotFoundError 404', async () => {
    const { useCase, appointmentRepo } = buildUpdateUseCase();

    await expect(
      useCase.execute({
        appointmentId: seed.appointmentInB,
        data: {
          contacts: [{ contactId: seed.contactStandalone, role: 'TENANT', isPrimary: true }] as any,
        },
        actor: actor('CL_ADMIN', seed.tenantB),
      }),
    ).rejects.toThrow(NotFoundError);
    expect(appointmentRepo.saveContact).not.toHaveBeenCalled();
  });
});
