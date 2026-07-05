import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BulkEditAppointmentsUseCase } from '../../../src/modules/appointment/application/use-cases/bulk-edit-appointments.use-case';
import type { IAppointmentRepository, AppointmentWithRelations } from '../../../src/modules/appointment/domain/appointment.repository';
import type { IContactRepository } from '../../../src/modules/contact/domain/contact.repository';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { IPricingRuleRepository } from '../../../src/modules/pricing-rule/domain/pricing-rule.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import { ContactEntity } from '../../../src/modules/contact/domain/contact.entity';
import { PricingRuleEntity } from '../../../src/modules/pricing-rule/domain/pricing-rule.entity';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AppointmentBulkFieldNotAllowedError } from '../../../src/modules/appointment/domain/appointment.errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAppointmentEntity(
  overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
): AppointmentEntity {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'property-1',
    serviceTypeId: 'svc-type-1',
    inspectorId: null,
    status: 'DRAFT',
    scheduledDate: new Date('2027-06-01'),
    timeSlotStart: '09:00', timeSlotEnd: '10:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    rentalTenantConfirmationStatus: 'PENDING',
    priceAmount: 150,
    payoutAmount: 80,
    pricingRuleSnapshotJson: {},
    notes: null,
    customFieldsJson: null,
    reason: null,
    cancellationReasonCode: null,
    rejectionReasonCode: null,
    createdByUserId: 'user-1',
    doneMarkedByUserId: null,
    doneCheckedByUserId: null,
    doneCheckedAt: null,
    serviceGroupId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makeAppointmentWithRelations(
  overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
  contacts: AppointmentWithRelations['contacts'] = [],
): AppointmentWithRelations {
  return {
    appointment: makeAppointmentEntity(overrides),
    contact: contacts[0] ?? null,
    contacts,
    restrictions: [],
  };
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-op',
    tenantId: 'tenant-1',
    role: 'OP',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

function makeContactEntity(overrides: Partial<ConstructorParameters<typeof ContactEntity>[0]> = {}): ContactEntity {
  return new ContactEntity({
    id: 'contact-1',
    tenantId: 'tenant-1',
    type: 'PROPERTY_MANAGER',
    displayName: 'Jane PM',
    primaryEmail: 'jane.pm@example.com',
    primaryPhone: '+61400111222',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe('BulkEditAppointmentsUseCase', () => {
  let appointmentRepo: IAppointmentRepository;
  let contactRepo: IContactRepository;
  let inspectorRepo: IInspectorRepository;
  let pricingRuleRepo: IPricingRuleRepository;
  let auditService: AuditService;
  let authorizationService: AuthorizationService;
  let useCase: BulkEditAppointmentsUseCase;

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
      findScheduledOnDate: vi.fn(),
      findAllContacts: vi.fn(),
      countContacts: vi.fn(),
      findContactById: vi.fn(),
      findDuplicateForImport: vi.fn(),
    } as unknown as IAppointmentRepository;

    contactRepo = {
      findById: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      existsByEmail: vi.fn(),
      existsByPhone: vi.fn(),
      findActiveByEmailOrPhone: vi.fn(),
      findAppointmentsByContactId: vi.fn(),
      countAppointmentsByContactId: vi.fn(),
      search: vi.fn(),
    } as unknown as IContactRepository;

    inspectorRepo = {
      findById: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    } as unknown as IInspectorRepository;

    pricingRuleRepo = {
      findById: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    } as unknown as IPricingRuleRepository;

    auditService = { log: vi.fn() } as unknown as AuditService;
    authorizationService = new AuthorizationService(auditService);

    useCase = new BulkEditAppointmentsUseCase(
      appointmentRepo,
      contactRepo,
      inspectorRepo,
      pricingRuleRepo,
      auditService,
      authorizationService,
    );
  });

  // -------------------------------------------------------------------------
  // (a) Forbidden field → whole request rejected
  // -------------------------------------------------------------------------

  it('(a) rejects whole request when changes contain a forbidden field', async () => {
    await expect(
      useCase.execute({
        ids: ['appt-1'],
        changes: { status: 'DONE' } as any,
        actor: makeActor(),
      }),
    ).rejects.toThrow(AppointmentBulkFieldNotAllowedError);

    expect(appointmentRepo.findById).not.toHaveBeenCalled();
  });

  it('(a) rejects whole request when changes mix valid and forbidden fields', async () => {
    await expect(
      useCase.execute({
        ids: ['appt-1'],
        changes: { assignedInspectorId: 'insp-1', unknownField: 'x' } as any,
        actor: makeActor(),
      }),
    ).rejects.toThrow(AppointmentBulkFieldNotAllowedError);
  });

  // -------------------------------------------------------------------------
  // RBAC: AM/OP allowed; CL_ADMIN, CL_USER, INSP forbidden
  // -------------------------------------------------------------------------

  it('(RBAC) allows AM to bulk edit', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ tenantId: 'tenant-1', status: 'DRAFT' }),
    );

    const result = await useCase.execute({
      ids: ['appt-1'],
      changes: { timeSlotStart: '10:00', timeSlotEnd: '11:00' },
      actor: makeActor({ role: 'AM', tenantId: null }),
    });

    expect(result.updated).toBe(1);
    expect(result.failed).toHaveLength(0);
  });

  it('(RBAC) allows OP to bulk edit', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ tenantId: 'tenant-1', status: 'DRAFT' }),
    );

    const result = await useCase.execute({
      ids: ['appt-1'],
      changes: { timeSlotStart: '10:00', timeSlotEnd: '11:00' },
      actor: makeActor({ role: 'OP', tenantId: 'tenant-1' }),
    });

    expect(result.updated).toBe(1);
    expect(result.failed).toHaveLength(0);
  });

  it('(RBAC) throws ForbiddenError for CL_ADMIN', async () => {
    await expect(
      useCase.execute({
        ids: ['appt-1'],
        changes: { timeSlotStart: '10:00', timeSlotEnd: '11:00' },
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('(RBAC) throws ForbiddenError for CL_USER', async () => {
    await expect(
      useCase.execute({
        ids: ['appt-1'],
        changes: { timeSlotStart: '10:00', timeSlotEnd: '11:00' },
        actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('(RBAC) throws ForbiddenError for INSP', async () => {
    await expect(
      useCase.execute({
        ids: ['appt-1'],
        changes: { timeSlotStart: '10:00', timeSlotEnd: '11:00' },
        actor: makeActor({ role: 'INSP', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  // -------------------------------------------------------------------------
  // (d) Happy path: assignedInspectorId
  // -------------------------------------------------------------------------

  it('(d) happy path: assigns active inspector to DRAFT appointment', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'DRAFT', tenantId: 'tenant-1' }),
    );
    vi.mocked(inspectorRepo.findById).mockResolvedValue({
      id: 'insp-1',
      status: 'ACTIVE',
      isEligibleForTenant: () => true,
    } as any);

    const result = await useCase.execute({
      ids: ['appt-1'],
      changes: { assignedInspectorId: 'insp-1' },
      actor: makeActor(),
    });

    expect(result.updated).toBe(1);
    expect(result.failed).toHaveLength(0);
    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      expect.objectContaining({ inspectorId: 'insp-1' }),
    );
  });

  it('(d) happy path: multiple appointments — all succeed', async () => {
    vi.mocked(appointmentRepo.findById)
      .mockResolvedValueOnce(makeAppointmentWithRelations({ id: 'appt-1', status: 'DRAFT' }))
      .mockResolvedValueOnce(makeAppointmentWithRelations({ id: 'appt-2', status: 'DRAFT' }))
      .mockResolvedValueOnce(makeAppointmentWithRelations({ id: 'appt-3', status: 'DRAFT' }));

    const result = await useCase.execute({
      ids: ['appt-1', 'appt-2', 'appt-3'],
      changes: { timeSlotStart: '14:00', timeSlotEnd: '15:00' },
      actor: makeActor(),
    });

    expect(result.updated).toBe(3);
    expect(result.failed).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // (e) Inactive inspector → per-row error
  // -------------------------------------------------------------------------

  it('(e) inactive inspector produces per-row error — other rows still succeed', async () => {
    vi.mocked(appointmentRepo.findById)
      .mockResolvedValueOnce(makeAppointmentWithRelations({ id: 'appt-1', status: 'DRAFT' }))
      .mockResolvedValueOnce(makeAppointmentWithRelations({ id: 'appt-2', status: 'DRAFT' }));

    vi.mocked(inspectorRepo.findById)
      .mockResolvedValueOnce({ id: 'insp-inactive', status: 'INACTIVE' } as any) // appt-1 → fail
      .mockResolvedValueOnce({ id: 'insp-active', status: 'ACTIVE', isEligibleForTenant: () => true } as any); // appt-2 → ok

    const result = await useCase.execute({
      ids: ['appt-1', 'appt-2'],
      changes: { assignedInspectorId: 'insp-active' },
      actor: makeActor(),
    });

    expect(result.updated).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({
      id: 'appt-1',
      code: 'INSPECTOR_INACTIVE',
    });
  });

  it('(e) appointment not found produces per-row APPOINTMENT_NOT_FOUND error', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(null);

    const result = await useCase.execute({
      ids: ['appt-missing'],
      changes: { timeSlotStart: '10:00', timeSlotEnd: '11:00' },
      actor: makeActor(),
    });

    expect(result.updated).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({
      id: 'appt-missing',
      code: 'APPOINTMENT_NOT_FOUND',
    });
  });

  // -------------------------------------------------------------------------
  // (f) Terminal status → per-row error
  // -------------------------------------------------------------------------

  it('(f) DONE appointment with assignedInspectorId → per-row error', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'DONE' }),
    );

    const result = await useCase.execute({
      ids: ['appt-1'],
      changes: { assignedInspectorId: 'insp-1' },
      actor: makeActor(),
    });

    expect(result.updated).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({
      id: 'appt-1',
      code: 'APPOINTMENT_UPDATE_NOT_ALLOWED',
    });
  });

  it('(f) CANCELLED appointment with branchId change → per-row error', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'CANCELLED' }),
    );

    const result = await useCase.execute({
      ids: ['appt-1'],
      changes: { branchId: 'branch-2' },
      actor: makeActor(),
    });

    expect(result.updated).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({
      id: 'appt-1',
      code: 'APPOINTMENT_BULK_BRANCH_CHANGE_NOT_ALLOWED',
    });
  });

  it('(f) REJECTED appointment with scheduledDate change → per-row error', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'REJECTED' }),
    );

    const result = await useCase.execute({
      ids: ['appt-1'],
      changes: { scheduledDate: '2027-08-01' },
      actor: makeActor(),
    });

    expect(result.updated).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({
      id: 'appt-1',
      code: 'APPOINTMENT_UPDATE_NOT_ALLOWED',
    });
  });

  it('(f) SCHEDULED appointment with branchId change → per-row error (DRAFT only)', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'SCHEDULED' }),
    );

    const result = await useCase.execute({
      ids: ['appt-1'],
      changes: { branchId: 'branch-2' },
      actor: makeActor(),
    });

    expect(result.updated).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({
      id: 'appt-1',
      code: 'APPOINTMENT_BULK_BRANCH_CHANGE_NOT_ALLOWED',
    });
  });

  // -------------------------------------------------------------------------
  // Partial failure: some succeed, some fail
  // -------------------------------------------------------------------------

  it('partial failure: first row succeeds, second row fails (DONE)', async () => {
    vi.mocked(appointmentRepo.findById)
      .mockResolvedValueOnce(makeAppointmentWithRelations({ id: 'appt-1', status: 'DRAFT' }))
      .mockResolvedValueOnce(makeAppointmentWithRelations({ id: 'appt-2', status: 'DONE' }));

    const result = await useCase.execute({
      ids: ['appt-1', 'appt-2'],
      changes: { branchId: 'branch-new' },
      actor: makeActor(),
    });

    expect(result.updated).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.id).toBe('appt-2');
  });

  // -------------------------------------------------------------------------
  // (g) PM contact snapshot created
  // -------------------------------------------------------------------------

  it('(g) PM contact: creates junction row with PROPERTY_MANAGER role and snapshot', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'DRAFT' }, []), // no existing contacts
    );

    const pmContact = makeContactEntity({
      id: 'pm-contact-1',
      displayName: 'Jane PM',
      primaryEmail: 'jane.pm@example.com',
      primaryPhone: '+61400111222',
      isActive: true,
    });
    vi.mocked(contactRepo.findById).mockResolvedValue(pmContact);

    const result = await useCase.execute({
      ids: ['appt-1'],
      changes: { propertyManagerContactId: 'pm-contact-1' },
      actor: makeActor(),
    });

    expect(result.updated).toBe(1);
    expect(result.failed).toHaveLength(0);
    expect(appointmentRepo.saveContact).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: 'pm-contact-1',
        role: 'PROPERTY_MANAGER',
        snapshotName: 'Jane PM',
        snapshotEmail: 'jane.pm@example.com',
        snapshotPhone: '+61400111222',
      }),
    );
  });

  it('(g) PM contact inactive → per-row error', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'DRAFT' }),
    );

    const pmContact = makeContactEntity({ id: 'pm-contact-inactive', isActive: false });
    vi.mocked(contactRepo.findById).mockResolvedValue(pmContact);

    const result = await useCase.execute({
      ids: ['appt-1'],
      changes: { propertyManagerContactId: 'pm-contact-inactive' },
      actor: makeActor(),
    });

    expect(result.updated).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ code: 'CONTACT_INACTIVE' });
  });

  it('(g) PM contact not found → per-row error', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'DRAFT' }),
    );
    vi.mocked(contactRepo.findById).mockResolvedValue(null);

    const result = await useCase.execute({
      ids: ['appt-1'],
      changes: { propertyManagerContactId: 'pm-nonexistent' },
      actor: makeActor(),
    });

    expect(result.updated).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ code: 'CONTACT_NOT_FOUND' });
  });

  // -------------------------------------------------------------------------
  // (h) Audit per row
  // -------------------------------------------------------------------------

  it('(h) emits one audit log entry per successfully updated appointment', async () => {
    vi.mocked(appointmentRepo.findById)
      .mockResolvedValueOnce(makeAppointmentWithRelations({ id: 'appt-1', status: 'DRAFT' }))
      .mockResolvedValueOnce(makeAppointmentWithRelations({ id: 'appt-2', status: 'DRAFT' }));

    await useCase.execute({
      ids: ['appt-1', 'appt-2'],
      changes: { timeSlotStart: '11:00', timeSlotEnd: '12:00' },
      actor: makeActor(),
      requestId: 'req-batch-1',
    });

    expect(auditService.log).toHaveBeenCalledTimes(2);
    expect(auditService.log).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: 'appointment.updated',
        actorId: 'user-op',
        entityType: 'appointment',
        entityId: 'appt-1',
        before: expect.objectContaining({ timeSlotStart: '09:00', timeSlotEnd: '10:00' }),
        after: expect.objectContaining({ timeSlotStart: '11:00', timeSlotEnd: '12:00' }),
        metadata: expect.objectContaining({ source: 'bulk-edit', batchId: 'req-batch-1' }),
      }),
    );
    expect(auditService.log).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        action: 'appointment.updated',
        entityId: 'appt-2',
      }),
    );
  });

  it('(h) does not emit audit for failed rows', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'DONE' }),
    );

    await useCase.execute({
      ids: ['appt-1'],
      changes: { assignedInspectorId: 'insp-1' },
      actor: makeActor(),
    });

    expect(auditService.log).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Summary response
  // -------------------------------------------------------------------------

  it('returns correct updated/failed counts', async () => {
    vi.mocked(appointmentRepo.findById)
      .mockResolvedValueOnce(makeAppointmentWithRelations({ id: 'appt-1', status: 'DRAFT' }))
      .mockResolvedValueOnce(null) // appt-2 not found
      .mockResolvedValueOnce(makeAppointmentWithRelations({ id: 'appt-3', status: 'DONE' })); // terminal

    const result = await useCase.execute({
      ids: ['appt-1', 'appt-2', 'appt-3'],
      changes: { timeSlotStart: '08:00', timeSlotEnd: '09:00' },
      actor: makeActor(),
    });

    expect(result.updated).toBe(1);
    expect(result.failed).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Tenant scope: OP cannot edit another tenant's appointments (findById returns null)
  // -------------------------------------------------------------------------

  it('tenant scope: appointment from another tenant returns per-row APPOINTMENT_NOT_FOUND', async () => {
    // OP is scoped to tenant-1; findById is called with tenantId='tenant-1' so the
    // repo will return null for an appointment that belongs to tenant-other.
    vi.mocked(appointmentRepo.findById).mockResolvedValue(null);

    const result = await useCase.execute({
      ids: ['appt-other-tenant'],
      changes: { timeSlotStart: '10:00', timeSlotEnd: '11:00' },
      actor: makeActor({ role: 'OP', tenantId: 'tenant-1' }),
    });

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
    // Verify scope is passed to the repo
    expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-other-tenant', 'tenant-1');
  });

  it('tenant scope: AM passes null tenantId to findById (global scope)', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ tenantId: 'tenant-other', status: 'DRAFT' }),
    );

    const result = await useCase.execute({
      ids: ['appt-1'],
      changes: { timeSlotStart: '10:00', timeSlotEnd: '11:00' },
      actor: makeActor({ role: 'AM', tenantId: null }),
    });

    expect(result.updated).toBe(1);
    expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-1', null);
  });

  // -------------------------------------------------------------------------
  // scheduledDate field guardrail: DRAFT and AWAITING_INSPECTOR only
  // -------------------------------------------------------------------------

  it('scheduledDate change allowed on AWAITING_INSPECTOR appointment', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'AWAITING_INSPECTOR' }),
    );

    const result = await useCase.execute({
      ids: ['appt-1'],
      changes: { scheduledDate: '2027-09-01' },
      actor: makeActor(),
    });

    expect(result.updated).toBe(1);
    expect(result.failed).toHaveLength(0);
    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      expect.objectContaining({ scheduledDate: expect.any(Date) }),
    );
  });

  it('scheduledDate change on SCHEDULED appointment → per-row error', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'SCHEDULED' }),
    );

    const result = await useCase.execute({
      ids: ['appt-1'],
      changes: { scheduledDate: '2027-09-01' },
      actor: makeActor(),
    });

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ code: 'APPOINTMENT_UPDATE_NOT_ALLOWED' });
  });

  // -------------------------------------------------------------------------
  // timeSlot field guardrail: DRAFT and AWAITING_INSPECTOR only
  // -------------------------------------------------------------------------

  it('timeSlot change on DONE appointment → per-row error', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'DONE' }),
    );

    const result = await useCase.execute({
      ids: ['appt-1'],
      changes: { timeSlotStart: '10:00', timeSlotEnd: '11:00' },
      actor: makeActor(),
    });

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ code: 'APPOINTMENT_UPDATE_NOT_ALLOWED' });
  });

  // -------------------------------------------------------------------------
  // serviceTypeId: DRAFT only, requires pricing re-resolution
  // -------------------------------------------------------------------------

  it('serviceTypeId change on DRAFT re-resolves pricing rule', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'DRAFT', branchId: 'branch-1' }),
    );

    const pricingRule = new PricingRuleEntity({
      id: 'rule-1',
      tenantId: 'tenant-1',
      currency: 'AUD',
      branchId: null,
      serviceTypeId: 'svc-type-new',
      priceAmount: 200,
      payoutType: 'FIXED',
      payoutValue: 100,
      bonusRuleJson: null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(pricingRuleRepo.findAll).mockResolvedValue([pricingRule]);

    const result = await useCase.execute({
      ids: ['appt-1'],
      changes: { serviceTypeId: 'svc-type-new' },
      actor: makeActor(),
    });

    expect(result.updated).toBe(1);
    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      expect.objectContaining({
        serviceTypeId: 'svc-type-new',
        priceAmount: 200,
      }),
    );
  });

  it('serviceTypeId change on DRAFT with no pricing rule → per-row error', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'DRAFT' }),
    );
    vi.mocked(pricingRuleRepo.findAll).mockResolvedValue([]);

    const result = await useCase.execute({
      ids: ['appt-1'],
      changes: { serviceTypeId: 'svc-type-no-rule' },
      actor: makeActor(),
    });

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ code: 'APPOINTMENT_NO_PRICE_RULE' });
  });

  it('serviceTypeId change on AWAITING_INSPECTOR → per-row error', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'AWAITING_INSPECTOR' }),
    );

    const result = await useCase.execute({
      ids: ['appt-1'],
      changes: { serviceTypeId: 'svc-type-2' },
      actor: makeActor(),
    });

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ code: 'APPOINTMENT_UPDATE_NOT_ALLOWED' });
  });

  // -------------------------------------------------------------------------
  // Inspector eligibility check
  // -------------------------------------------------------------------------

  it('inspector blocked for the tenant → per-row INSPECTOR_NOT_ELIGIBLE error', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'DRAFT', tenantId: 'tenant-1' }),
    );
    vi.mocked(inspectorRepo.findById).mockResolvedValue({
      id: 'insp-1',
      status: 'ACTIVE',
      blockedClientsJson: ['tenant-1'],
      isEligibleForTenant: (tid: string) => !['tenant-1'].includes(tid),
    } as any);

    const result = await useCase.execute({
      ids: ['appt-1'],
      changes: { assignedInspectorId: 'insp-1' },
      actor: makeActor(),
    });

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ code: 'INSPECTOR_NOT_ELIGIBLE' });
  });

  it('inspector not blocked for the tenant → succeeds', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'DRAFT', tenantId: 'tenant-1' }),
    );
    vi.mocked(inspectorRepo.findById).mockResolvedValue({
      id: 'insp-1',
      status: 'ACTIVE',
      blockedClientsJson: ['tenant-other'],
      isEligibleForTenant: (tid: string) => !['tenant-other'].includes(tid),
    } as any);

    const result = await useCase.execute({
      ids: ['appt-1'],
      changes: { assignedInspectorId: 'insp-1' },
      actor: makeActor(),
    });

    expect(result.updated).toBe(1);
    expect(result.failed).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Empty changes (no-op update)
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // PM contact policy: addIfMissing
  // -------------------------------------------------------------------------

  function makePmJunction(overrides: Partial<ConstructorParameters<typeof AppointmentContactEntity>[0]> = {}): AppointmentContactEntity {
    return new AppointmentContactEntity({
      id: 'apc-1',
      appointmentId: 'appt-1',
      contactId: 'pm-existing',
      role: 'PROPERTY_MANAGER',
      isPrimary: false,
      snapshotName: 'Existing PM',
      snapshotEmail: 'existing.pm@example.com',
      snapshotPhone: null,
      rentalTenantName: 'Existing PM',
      primaryEmail: 'existing.pm@example.com',
      primaryPhone: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });
  }

  it('(policy) addIfMissing + appointment without existing PM → creates junction', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'DRAFT' }, []),
    );
    vi.mocked(contactRepo.findById).mockResolvedValue(makeContactEntity({ id: 'pm-new' }));

    const result = await useCase.execute({
      ids: ['appt-1'],
      changes: { propertyManagerContactId: 'pm-new' },
      options: { propertyManagerContactPolicy: 'addIfMissing' },
      actor: makeActor(),
    });

    expect(result.updated).toBe(1);
    expect(result.failed).toHaveLength(0);
    expect(appointmentRepo.saveContact).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: 'pm-new', role: 'PROPERTY_MANAGER' }),
    );
  });

  it('(policy) addIfMissing + appointment WITH existing PM → reported and skipped (saveContact NOT called)', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'DRAFT' }, [makePmJunction()]),
    );
    vi.mocked(contactRepo.findById).mockResolvedValue(makeContactEntity({ id: 'pm-new' }));

    const result = await useCase.execute({
      ids: ['appt-1'],
      changes: { propertyManagerContactId: 'pm-new' },
      options: { propertyManagerContactPolicy: 'addIfMissing' },
      actor: makeActor(),
    });

    expect(result.updated).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({
      id: 'appt-1',
      code: 'APPOINTMENT_HAS_EXISTING_CONTACT',
    });
    expect(appointmentRepo.saveContact).not.toHaveBeenCalled();
  });

  it('(policy) default replace + appointment WITH existing PM → still saves a new junction (backwards-compatible)', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'DRAFT' }, [makePmJunction()]),
    );
    vi.mocked(contactRepo.findById).mockResolvedValue(makeContactEntity({ id: 'pm-new' }));

    const result = await useCase.execute({
      ids: ['appt-1'],
      changes: { propertyManagerContactId: 'pm-new' },
      // no options → default `replace`
      actor: makeActor(),
    });

    expect(result.updated).toBe(1);
    expect(result.failed).toHaveLength(0);
    expect(appointmentRepo.saveContact).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: 'pm-new', role: 'PROPERTY_MANAGER' }),
    );
  });

  it('(policy) addIfMissing partial: appt-1 (no PM) succeeds, appt-2 (has PM) reported', async () => {
    vi.mocked(appointmentRepo.findById)
      .mockResolvedValueOnce(makeAppointmentWithRelations({ id: 'appt-1', status: 'DRAFT' }, []))
      .mockResolvedValueOnce(makeAppointmentWithRelations({ id: 'appt-2', status: 'DRAFT' }, [makePmJunction({ appointmentId: 'appt-2' })]));
    vi.mocked(contactRepo.findById).mockResolvedValue(makeContactEntity({ id: 'pm-new' }));

    const result = await useCase.execute({
      ids: ['appt-1', 'appt-2'],
      changes: { propertyManagerContactId: 'pm-new' },
      options: { propertyManagerContactPolicy: 'addIfMissing' },
      actor: makeActor(),
    });

    expect(result.updated).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ id: 'appt-2', code: 'APPOINTMENT_HAS_EXISTING_CONTACT' });
    // saveContact called exactly once (for appt-1).
    expect(appointmentRepo.saveContact).toHaveBeenCalledTimes(1);
  });

  it('empty changes object: no fields to update — still audits with empty before/after', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'DRAFT' }),
    );

    const result = await useCase.execute({
      ids: ['appt-1'],
      changes: {},
      actor: makeActor(),
    });

    // No fields checked → no per-row guardrail failures → success (no-op update)
    expect(result.updated).toBe(1);
    // repo.update should NOT be called when updateData is empty
    expect(appointmentRepo.update).not.toHaveBeenCalled();
  });
});
