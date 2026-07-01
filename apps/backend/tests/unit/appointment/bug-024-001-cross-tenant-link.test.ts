/**
 * BUG-024-001 / BUG-024-002 — Orchestration-only unit guard.
 *
 * SCOPE: this file proves that the use case CALLS `contactRepo.findById`
 * with the correct arguments and threads the visibility check, then maps
 * results to the right response/error shape. It does NOT prove the SQL
 * contract — the mocks here return values regardless of arguments, which
 * is precisely how the cycle-2 BUG-024-001 fix passed but production
 * still failed (real Prisma's `WHERE tenant_id = $2` filtered the row
 * out). That false-confidence cost an extra QA cycle (cycle 3/2).
 *
 * The SQL-contract proof lives in
 *   `tests/integration/db/contact-appointment-link.integration.test.ts`
 * which exercises the real `PrismaContactRepository` against a
 * Testcontainers Postgres instance. **Any future change to the
 * cross-tenant lookup pattern MUST also update that integration test.**
 *
 * Captured as memory: feedback_mock_masks_real_bug.md.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateAppointmentUseCase } from '../../../src/modules/appointment/application/use-cases/create-appointment.use-case';
import { UpdateAppointmentUseCase } from '../../../src/modules/appointment/application/use-cases/update-appointment.use-case';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import type { IAppointmentRepository } from '../../../src/modules/appointment/domain/appointment.repository';
import type { IBranchRepository } from '../../../src/modules/tenant/domain/branch.repository';
import type { IPropertyRepository } from '../../../src/modules/property/domain/property.repository';
import type { IServiceTypeRepository } from '../../../src/modules/service-type/domain/service-type.repository';
import type { IPricingRuleRepository } from '../../../src/modules/pricing-rule/domain/pricing-rule.repository';
import type { IContactRepository } from '../../../src/modules/contact/domain/contact.repository';
import type { CreatePropertyUseCase } from '../../../src/modules/property/application/use-cases/create-property.use-case';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { NotFoundError } from '../../../src/shared/domain/errors';
import { BranchEntity } from '../../../src/modules/tenant/domain/branch.entity';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';
import { ServiceTypeEntity } from '../../../src/modules/service-type/domain/service-type.entity';
import { PricingRuleEntity } from '../../../src/modules/pricing-rule/domain/pricing-rule.entity';
import { ContactEntity } from '../../../src/modules/contact/domain/contact.entity';
import { futureDateStr } from '../../helpers/date-fixtures';

const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const TENANT_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const BRANCH_B = 'bbbbbbbb-0000-4000-8000-000000000010';
const PROPERTY_B = 'bbbbbbbb-0000-4000-8000-000000000020';
const STANDALONE_CONTACT_ID = 'cccccccc-0000-4000-8000-000000000001';
const TENANT_A_CONTACT_ID = 'cccccccc-0000-4000-8000-000000000002';

function makeBranch(tenantId: string, branchId: string): BranchEntity {
  return new BranchEntity({
    id: branchId, tenantId, name: 'Branch',
    addressJson: null, contactEmail: null, status: 'ACTIVE',
    createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
  });
}
function makeProperty(tenantId: string, branchId: string, propertyId: string): PropertyEntity {
  return new PropertyEntity({
    id: propertyId, tenantId, branchId, propertyCode: 'PROP-1',
    type: 'RESIDENTIAL', street: '1 St', addressLine2: null, suburb: 'S',
    postcode: '2000', state: 'NSW', country: 'AU',
    lat: null, lng: null, geocodingStatus: 'PENDING', notes: null, rulesJson: {},
    createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
  });
}
function makeServiceType(): ServiceTypeEntity {
  return new ServiceTypeEntity({
    id: 'svc-type-1', code: 'ROUTINE', name: 'Routine', flowType: 'STANDARD',
    requiresRentalTenantConfirmation: false, status: 'ACTIVE',
    createdAt: new Date(), updatedAt: new Date(),
  });
}
function makePricingRule(tenantId: string): PricingRuleEntity {
  return new PricingRuleEntity({
    id: 'pricing-1', tenantId, currency: 'AUD', serviceTypeId: 'svc-type-1',
    branchId: null, priceAmount: 150, payoutType: 'FIXED', payoutValue: 80,
    bonusRuleJson: null, status: 'ACTIVE',
    createdAt: new Date(), updatedAt: new Date(),
  });
}
function makeContact(id: string, tenantId: string | null, email: string): ContactEntity {
  return new ContactEntity({
    id, tenantId, type: 'RENTAL_TENANT', displayName: 'Pat',
    company: null, primaryEmail: email, primaryPhone: null,
    additionalChannels: [], notes: null, isActive: true,
    createdAt: new Date(), updatedAt: new Date(),
  });
}

function makeRepos() {
  const appointmentRepo: IAppointmentRepository = {
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
  const branchRepo: IBranchRepository = {
    findById: vi.fn(), findByName: vi.fn(), findAll: vi.fn(),
    count: vi.fn(), save: vi.fn(), update: vi.fn(),
  } as unknown as IBranchRepository;
  const propertyRepo: IPropertyRepository = {
    findById: vi.fn(), findByPropertyCode: vi.fn(), findAll: vi.fn(),
    count: vi.fn(), save: vi.fn(), update: vi.fn(),
  } as unknown as IPropertyRepository;
  const serviceTypeRepo: IServiceTypeRepository = {
    findById: vi.fn(), findByCode: vi.fn(), findAll: vi.fn(),
    count: vi.fn(), save: vi.fn(), update: vi.fn(),
  } as unknown as IServiceTypeRepository;
  const pricingRuleRepo: IPricingRuleRepository = {
    findById: vi.fn(), findByUnique: vi.fn(), findAll: vi.fn(),
    count: vi.fn(), save: vi.fn(), update: vi.fn(),
  } as unknown as IPricingRuleRepository;
  const contactRepo: IContactRepository = {
    findById: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    search: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    existsByEmail: vi.fn(),
    existsByPhone: vi.fn(),
    findActiveByEmailOrPhone: vi.fn(),
    existsLinkedToTenant: vi.fn(),
    findAppointmentsByContactId: vi.fn(),
    countAppointmentsByContactId: vi.fn(),
    countDistinctPropertiesByContactIds: vi.fn(),
    countPrimaryDistinctPropertiesByContactIds: vi.fn(),
    findPropertiesByContactId: vi.fn(),
    countPropertiesByContactId: vi.fn(),
  } as unknown as IContactRepository;
  const createPropertyUseCase = { execute: vi.fn() } as unknown as CreatePropertyUseCase;
  const auditService = { log: vi.fn() } as unknown as AuditService;
  return {
    appointmentRepo, branchRepo, propertyRepo, serviceTypeRepo, pricingRuleRepo,
    contactRepo, createPropertyUseCase, auditService,
  };
}

function makeActor(role: string, tenantId: string | null): AuthContext {
  return {
    userId: 'user-1', tenantId, role,
    branchId: null, inspectorId: null,
  } as AuthContext;
}

const baseInputForCreate = {
  branchId: BRANCH_B,
  propertyId: PROPERTY_B,
  serviceTypeId: 'svc-type-1',
  scheduledDate: futureDateStr(60),
  timeSlotStart: '09:00', timeSlotEnd: '10:00',
  keyRequired: false,
};

describe('BUG-024-001 — CreateAppointmentUseCase cross-tenant contact link', () => {
  let repos: ReturnType<typeof makeRepos>;
  let useCase: CreateAppointmentUseCase;

  beforeEach(() => {
    repos = makeRepos();
    vi.mocked(repos.branchRepo.findById).mockResolvedValue(makeBranch(TENANT_B, BRANCH_B));
    vi.mocked(repos.propertyRepo.findById).mockResolvedValue(makeProperty(TENANT_B, BRANCH_B, PROPERTY_B));
    vi.mocked(repos.serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(repos.pricingRuleRepo.findAll).mockResolvedValue([makePricingRule(TENANT_B)]);

    useCase = new CreateAppointmentUseCase(
      repos.appointmentRepo,
      repos.branchRepo,
      repos.propertyRepo,
      repos.serviceTypeRepo,
      repos.pricingRuleRepo,
      repos.createPropertyUseCase,
      repos.auditService,
      new AuthorizationService(repos.auditService),
      undefined, // tenantRepo
      repos.contactRepo,
    );
  });

  it('AM links a STANDALONE contact (tenant_id=null) into a TenantB appointment', async () => {
    // 024 §FR-301 — registry contact has no tenant linkage. AM must be able
    // to use it as a contact for the TenantB appointment. Pre-fix the lookup
    // `findById(id, TENANT_B)` returned null and threw APPOINTMENT_CONTACT_NOT_FOUND.
    vi.mocked(repos.contactRepo.findById).mockResolvedValue(
      makeContact(STANDALONE_CONTACT_ID, null, 'standalone@example.com'),
    );

    const result = await useCase.execute({
      ...baseInputForCreate,
      contacts: [{ contactId: STANDALONE_CONTACT_ID, role: 'RENTAL_TENANT', isPrimary: true }] as any,
      actor: makeActor('AM', null),
    });

    // Lookup must drop the tenant filter for AM (cross-tenant). The visibility
    // gate is intentionally NOT consulted for AM/OP (global scope).
    expect(repos.contactRepo.findById).toHaveBeenCalledWith(STANDALONE_CONTACT_ID, null);
    expect(repos.contactRepo.existsLinkedToTenant).not.toHaveBeenCalled();
    expect(result.id).toBeDefined();
    expect(result.tenantId).toBe(TENANT_B);
    expect(repos.appointmentRepo.saveContact).toHaveBeenCalled();
  });

  it('OP at TenantB links a contact registered under TenantA (cross-tenant lookup)', async () => {
    // 024 §FR-301 — the contact-lookup fix is independent of the OP
    // appointment-tenant-resolution gap (line 173 comment in the use case
    // is stale, predates Constitution v1.3.0). To isolate BUG-024-001 we
    // use an OP context whose JWT already targets TenantB; the focus here
    // is purely the contact lookup dropping the tenant filter so AM/OP
    // can use a contact whose registry row lives in another tenant.
    vi.mocked(repos.contactRepo.findById).mockResolvedValue(
      makeContact(TENANT_A_CONTACT_ID, TENANT_A, 'a-pinned@example.com'),
    );

    const result = await useCase.execute({
      ...baseInputForCreate,
      contacts: [{ contactId: TENANT_A_CONTACT_ID, role: 'RENTAL_TENANT', isPrimary: true }] as any,
      actor: makeActor('OP', TENANT_B),
    });

    expect(repos.contactRepo.findById).toHaveBeenCalledWith(TENANT_A_CONTACT_ID, null);
    expect(repos.contactRepo.existsLinkedToTenant).not.toHaveBeenCalled();
    expect(result.id).toBeDefined();
    expect(result.tenantId).toBe(TENANT_B);
  });

  it('CL_ADMIN(B) cannot link a contact unreachable through the operational junction in B (404 collapse)', async () => {
    // The registry row exists (CL fetches it without the tenant filter
    // because we removed the route-level overwrite for the contacts API),
    // but visibility derives from `appointment_contacts` joined to
    // `appointments.tenant_id = TENANT_B`. With no junction in B, the use
    // case must treat the contact as "not found" — never leak existence
    // (FR-022).
    vi.mocked(repos.contactRepo.findById).mockResolvedValue(
      makeContact(STANDALONE_CONTACT_ID, null, 'unreachable@example.com'),
    );
    vi.mocked(repos.contactRepo.existsLinkedToTenant).mockResolvedValue(false);

    await expect(
      useCase.execute({
        ...baseInputForCreate,
        contacts: [{ contactId: STANDALONE_CONTACT_ID, role: 'RENTAL_TENANT', isPrimary: true }] as any,
        actor: makeActor('CL_ADMIN', TENANT_B),
      }),
    ).rejects.toThrow(NotFoundError);

    expect(repos.contactRepo.existsLinkedToTenant).toHaveBeenCalledWith(STANDALONE_CONTACT_ID, TENANT_B);
    expect(repos.appointmentRepo.saveContact).not.toHaveBeenCalled();
  });

  it('CL_ADMIN(B) CAN link a contact already reachable in B via the operational junction', async () => {
    // Visibility predicate returns true → the link proceeds.
    vi.mocked(repos.contactRepo.findById).mockResolvedValue(
      makeContact(TENANT_A_CONTACT_ID, TENANT_A, 'reachable-in-b@example.com'),
    );
    vi.mocked(repos.contactRepo.existsLinkedToTenant).mockResolvedValue(true);

    const result = await useCase.execute({
      ...baseInputForCreate,
      contacts: [{ contactId: TENANT_A_CONTACT_ID, role: 'RENTAL_TENANT', isPrimary: true }] as any,
      actor: makeActor('CL_ADMIN', TENANT_B),
    });

    // 024 §FR-303 (BUG-024-002 cycle 3) — lookup is global; CL visibility
    // resolves via the `ownsContact` shortcut (registry tenantId === actor
    // tenantId) OR the operational-junction predicate. The contact in this
    // test lives in TenantA, so the shortcut misses and the junction fires.
    expect(repos.contactRepo.findById).toHaveBeenCalledWith(TENANT_A_CONTACT_ID, null);
    expect(repos.contactRepo.existsLinkedToTenant).toHaveBeenCalledWith(TENANT_A_CONTACT_ID, TENANT_B);
    expect(result.id).toBeDefined();
    expect(repos.appointmentRepo.saveContact).toHaveBeenCalled();
  });
});

describe('BUG-024-001 — UpdateAppointmentUseCase cross-tenant contact link (parity with create)', () => {
  let repos: ReturnType<typeof makeRepos>;
  let useCase: UpdateAppointmentUseCase;

  const APPOINTMENT_ID = 'eeeeeeee-0000-4000-8000-000000000001';

  function makeExistingAppointment(): AppointmentEntity {
    return new AppointmentEntity({
      id: APPOINTMENT_ID,
      appointmentNumber: 1,
      tenantId: TENANT_B,
      branchId: BRANCH_B,
      propertyId: PROPERTY_B,
      serviceTypeId: 'svc-type-1',
      inspectorId: null,
      status: 'DRAFT',
      scheduledDate: new Date(futureDateStr(60)),
      timeSlotStart: '09:00', timeSlotEnd: '10:00',
      keyRequired: false,
      meetingLocation: null,
      keyLocation: null,
      rentalTenantConfirmationStatus: 'PENDING',
      priceAmount: 150,
      payoutAmount: 80,
      pricingRuleSnapshotJson: {},
      notes: null,
      rentalTenantNote: null,
      customFieldsJson: null,
      reason: null,
      cancellationReasonCode: null,
      rejectionReasonCode: null,
      createdByUserId: 'user-1',
      doneMarkedByUserId: null,
      doneCheckedByUserId: null,
      doneCheckedAt: null,
      serviceGroupId: null,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  beforeEach(() => {
    repos = makeRepos();
    vi.mocked(repos.appointmentRepo.findById).mockResolvedValue({
      appointment: makeExistingAppointment(),
      contacts: [],
      restrictions: [],
    } as any);

    useCase = new UpdateAppointmentUseCase(
      repos.appointmentRepo,
      repos.auditService,
      new AuthorizationService(repos.auditService),
      undefined, // tenantRepo
      repos.contactRepo,
    );
  });

  it('AM replaces the contacts array with a STANDALONE contact (cross-tenant lookup)', async () => {
    vi.mocked(repos.contactRepo.findById).mockResolvedValue(
      makeContact(STANDALONE_CONTACT_ID, null, 'standalone-update@example.com'),
    );

    await useCase.execute({
      appointmentId: APPOINTMENT_ID,
      data: {
        contacts: [{ contactId: STANDALONE_CONTACT_ID, role: 'RENTAL_TENANT', isPrimary: true }] as any,
      },
      actor: makeActor('AM', null),
    });

    // Same fix shape as create-appointment: AM/OP look up by id only;
    // visibility gate not consulted.
    expect(repos.contactRepo.findById).toHaveBeenCalledWith(STANDALONE_CONTACT_ID, null);
    expect(repos.contactRepo.existsLinkedToTenant).not.toHaveBeenCalled();
    expect(repos.appointmentRepo.deleteContactsByAppointmentId).toHaveBeenCalledWith(APPOINTMENT_ID);
    expect(repos.appointmentRepo.saveContact).toHaveBeenCalled();
  });

  it('CL_ADMIN(B) cannot replace contacts with one unreachable through the operational junction', async () => {
    vi.mocked(repos.contactRepo.findById).mockResolvedValue(
      makeContact(STANDALONE_CONTACT_ID, null, 'unreachable-update@example.com'),
    );
    vi.mocked(repos.contactRepo.existsLinkedToTenant).mockResolvedValue(false);

    await expect(
      useCase.execute({
        appointmentId: APPOINTMENT_ID,
        data: {
          contacts: [{ contactId: STANDALONE_CONTACT_ID, role: 'RENTAL_TENANT', isPrimary: true }] as any,
        },
        actor: makeActor('CL_ADMIN', TENANT_B),
      }),
    ).rejects.toThrow(NotFoundError);

    expect(repos.contactRepo.existsLinkedToTenant).toHaveBeenCalledWith(STANDALONE_CONTACT_ID, TENANT_B);
    expect(repos.appointmentRepo.saveContact).not.toHaveBeenCalled();
  });
});
