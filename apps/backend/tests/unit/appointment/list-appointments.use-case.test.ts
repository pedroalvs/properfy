import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListAppointmentsUseCase } from '../../../src/modules/appointment/application/use-cases/list-appointments.use-case';
import type { IAppointmentRepository, AppointmentListItem } from '../../../src/modules/appointment/domain/appointment.repository';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuthContext } from '@properfy/shared';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';

function makeAppointmentListItem(overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {}): AppointmentListItem {
  return {
    appointment: new AppointmentEntity({
      id: 'appt-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      propertyId: 'property-1',
      serviceTypeId: 'svc-type-1',
      inspectorId: null,
      status: 'DRAFT',
      scheduledDate: new Date('2026-04-01'),
      timeSlot: '09:00-10:00',
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
      createdByUserId: 'user-1',
      doneMarkedByUserId: null,
    doneCheckedByUserId: null,
      doneCheckedAt: null,
      serviceGroupId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    }),
    contact: null,
    propertyCode: 'PROP-001',
    propertyAddress: '123 Test St, Suburb NSW 2000',
    propertyLatitude: null,
    propertyLongitude: null,
    tenantName: 'Test Agency',
    tenantAppointmentCodePrefix: null,
    branchName: 'Main Branch',
    serviceTypeName: 'Routine Inspection',
    inspectorName: null,
    serviceGroupNumber: null,
  };
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

const defaultPagination = {
  page: 1,
  pageSize: 10,
  sortOrder: 'desc' as const,
};

describe('ListAppointmentsUseCase', () => {
  let appointmentRepo: IAppointmentRepository;
  let useCase: ListAppointmentsUseCase;

  beforeEach(() => {
    appointmentRepo = {
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
      findContactById: vi.fn(),
      findDuplicateForImport: vi.fn(),
      findUnconfirmedForDate: vi.fn(),
    };
    const authorizationService = new AuthorizationService({ log: vi.fn() } as any);
    useCase = new ListAppointmentsUseCase(appointmentRepo, authorizationService);
  });

  it('should allow AM to list appointments with tenant filter', async () => {
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([makeAppointmentListItem()]);
    vi.mocked(appointmentRepo.count).mockResolvedValue(1);

    const result = await useCase.execute({
      filters: { tenantId: 'tenant-1' },
      pagination: defaultPagination,
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(appointmentRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      defaultPagination,
    );
  });

  it('should return all appointments for AM without tenantId filter', async () => {
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([makeAppointmentListItem()]);
    vi.mocked(appointmentRepo.count).mockResolvedValue(1);

    const result = await useCase.execute({
      filters: {},
      pagination: defaultPagination,
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    // tenantId is undefined — repository receives no tenant scope
    expect(appointmentRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: undefined }),
      defaultPagination,
    );
  });

  it('should allow CL_ADMIN to list their own tenant appointments', async () => {
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([makeAppointmentListItem()]);
    vi.mocked(appointmentRepo.count).mockResolvedValue(1);

    const result = await useCase.execute({
      filters: {},
      pagination: defaultPagination,
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.data).toHaveLength(1);
    // Should always use actor.tenantId for CL roles, ignoring any passed tenantId
    expect(appointmentRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      defaultPagination,
    );
  });

  it('should ignore tenantId filter for CL roles and use JWT tenantId', async () => {
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([]);
    vi.mocked(appointmentRepo.count).mockResolvedValue(0);

    await useCase.execute({
      filters: { tenantId: 'tenant-other' }, // Should be ignored
      pagination: defaultPagination,
      actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }),
    });

    // Always scoped by JWT tenant
    expect(appointmentRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      defaultPagination,
    );
  });

  it('should return correct pagination metadata', async () => {
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([makeAppointmentListItem()]);
    vi.mocked(appointmentRepo.count).mockResolvedValue(25);

    const result = await useCase.execute({
      filters: { tenantId: 'tenant-1' },
      pagination: { page: 2, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.total).toBe(25);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
  });

  it('should deny INSP role', async () => {
    await expect(
      useCase.execute({
        filters: {},
        pagination: defaultPagination,
        actor: makeActor({ role: 'INSP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should deny TNT role', async () => {
    await expect(
      useCase.execute({
        filters: {},
        pagination: defaultPagination,
        actor: makeActor({ role: 'TNT' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should pass additional filters to repository', async () => {
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([]);
    vi.mocked(appointmentRepo.count).mockResolvedValue(0);

    await useCase.execute({
      filters: {
        tenantId: 'tenant-1',
        status: 'DRAFT',
        branchId: 'branch-2',
        serviceTypeId: 'svc-1',
      },
      pagination: defaultPagination,
      actor: makeActor({ role: 'AM' }),
    });

    expect(appointmentRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        status: 'DRAFT',
        branchId: 'branch-2',
        serviceTypeId: 'svc-1',
      }),
      defaultPagination,
    );
  });

  it('should return empty list when no appointments found', async () => {
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([]);
    vi.mocked(appointmentRepo.count).mockResolvedValue(0);

    const result = await useCase.execute({
      filters: { tenantId: 'tenant-1' },
      pagination: defaultPagination,
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('should expose done check metadata in list items', async () => {
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([
      makeAppointmentListItem({
        status: 'DONE',
        doneCheckedByUserId: 'op-1',
        doneCheckedAt: new Date('2026-03-24T12:00:00Z'),
      }),
    ]);
    vi.mocked(appointmentRepo.count).mockResolvedValue(1);

    const result = await useCase.execute({
      filters: { tenantId: 'tenant-1' },
      pagination: defaultPagination,
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.data[0]).toEqual(
      expect.objectContaining({
        status: 'DONE',
        doneCheckedByUserId: 'op-1',
        doneCheckedAt: new Date('2026-03-24T12:00:00Z'),
      }),
    );
  });

  // Bug C-B2 (QA 2026-04-20). OP is cross-tenant per CLAUDE.md §6; the
  // previous branch coerced its null JWT tenantId via `!` and silently
  // dropped the query filter, so `?tenantId=X` returned every tenant.
  describe('OP tenant scope (Bug C-B2 regression)', () => {
    it('returns cross-tenant when OP does not pass tenantId', async () => {
      vi.mocked(appointmentRepo.findAll).mockResolvedValue([makeAppointmentListItem()]);
      vi.mocked(appointmentRepo.count).mockResolvedValue(1);

      await useCase.execute({
        filters: {},
        pagination: defaultPagination,
        actor: makeActor({ role: 'OP', tenantId: null }),
      });

      expect(appointmentRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: undefined }),
        defaultPagination,
      );
    });

    it('narrows OP listing when tenantId filter is provided', async () => {
      vi.mocked(appointmentRepo.findAll).mockResolvedValue([makeAppointmentListItem()]);
      vi.mocked(appointmentRepo.count).mockResolvedValue(1);

      await useCase.execute({
        filters: { tenantId: 'tenant-sps' },
        pagination: defaultPagination,
        actor: makeActor({ role: 'OP', tenantId: null }),
      });

      expect(appointmentRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-sps' }),
        defaultPagination,
      );
    });

    it('ignores tenantId filter for CL roles and pins to JWT tenantId', async () => {
      vi.mocked(appointmentRepo.findAll).mockResolvedValue([]);
      vi.mocked(appointmentRepo.count).mockResolvedValue(0);

      await useCase.execute({
        filters: { tenantId: 'tenant-other' },
        pagination: defaultPagination,
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-own' }),
      });

      expect(appointmentRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-own' }),
        defaultPagination,
      );
    });
  });

  describe('search by appointment code', () => {
    it('passes searchAppointmentNumber when search looks like a code', async () => {
      vi.mocked(appointmentRepo.findAll).mockResolvedValue([]);
      vi.mocked(appointmentRepo.count).mockResolvedValue(0);

      await useCase.execute({
        filters: { search: 'INS-0042' },
        pagination: defaultPagination,
        actor: makeActor({ role: 'AM' }),
      });

      expect(appointmentRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'INS-0042', searchAppointmentNumber: 42 }),
        defaultPagination,
      );
    });

    it('does not pass searchAppointmentNumber when search is plain text', async () => {
      vi.mocked(appointmentRepo.findAll).mockResolvedValue([]);
      vi.mocked(appointmentRepo.count).mockResolvedValue(0);

      await useCase.execute({
        filters: { search: 'some address' },
        pagination: defaultPagination,
        actor: makeActor({ role: 'AM' }),
      });

      expect(appointmentRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'some address', searchAppointmentNumber: undefined }),
        defaultPagination,
      );
    });

    it('includes appointmentCode in list output', async () => {
      vi.mocked(appointmentRepo.findAll).mockResolvedValue([
        makeAppointmentListItem({ appointmentNumber: 42 }),
      ]);
      vi.mocked(appointmentRepo.count).mockResolvedValue(1);

      const result = await useCase.execute({
        filters: {},
        pagination: defaultPagination,
        actor: makeActor({ role: 'AM' }),
      });

      expect(result.data[0]!.appointmentCode).toBe('INS-0042');
    });

    it('uses custom tenant prefix for appointmentCode', async () => {
      const item = makeAppointmentListItem({ appointmentNumber: 1 });
      item.tenantAppointmentCodePrefix = 'APT';
      vi.mocked(appointmentRepo.findAll).mockResolvedValue([item]);
      vi.mocked(appointmentRepo.count).mockResolvedValue(1);

      const result = await useCase.execute({
        filters: {},
        pagination: defaultPagination,
        actor: makeActor({ role: 'AM' }),
      });

      expect(result.data[0]!.appointmentCode).toBe('APT-0001');
    });
  });

  describe('timeSlot filter', () => {
    it('passes timeSlot filter to repository', async () => {
      vi.mocked(appointmentRepo.findAll).mockResolvedValue([]);
      vi.mocked(appointmentRepo.count).mockResolvedValue(0);

      await useCase.execute({
        filters: { timeSlot: '09:00-10:00' },
        pagination: defaultPagination,
        actor: makeActor({ role: 'AM' }),
      });

      expect(appointmentRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ timeSlot: '09:00-10:00' }),
        defaultPagination,
      );
    });
  });

  describe('contactSearch filter', () => {
    it('passes contactSearch filter to repository', async () => {
      vi.mocked(appointmentRepo.findAll).mockResolvedValue([]);
      vi.mocked(appointmentRepo.count).mockResolvedValue(0);

      await useCase.execute({
        filters: { contactSearch: 'john' },
        pagination: defaultPagination,
        actor: makeActor({ role: 'AM' }),
      });

      expect(appointmentRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ contactSearch: 'john' }),
        defaultPagination,
      );
    });
  });

  describe('hasRentalTenantNote filter', () => {
    it('passes hasRentalTenantNote=true filter to repository', async () => {
      vi.mocked(appointmentRepo.findAll).mockResolvedValue([]);
      vi.mocked(appointmentRepo.count).mockResolvedValue(0);

      await useCase.execute({
        filters: { hasRentalTenantNote: true },
        pagination: defaultPagination,
        actor: makeActor({ role: 'AM' }),
      });

      expect(appointmentRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ hasRentalTenantNote: true }),
        defaultPagination,
      );
    });

    it('passes hasRentalTenantNote=false filter to repository', async () => {
      vi.mocked(appointmentRepo.findAll).mockResolvedValue([]);
      vi.mocked(appointmentRepo.count).mockResolvedValue(0);

      await useCase.execute({
        filters: { hasRentalTenantNote: false },
        pagination: defaultPagination,
        actor: makeActor({ role: 'AM' }),
      });

      expect(appointmentRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ hasRentalTenantNote: false }),
        defaultPagination,
      );
    });
  });

  describe('service group reference in list output', () => {
    it('exposes serviceGroupId and serviceGroupCode for a grouped appointment', async () => {
      const item = makeAppointmentListItem({ serviceGroupId: 'group-uuid-1' });
      item.serviceGroupNumber = 42;
      vi.mocked(appointmentRepo.findAll).mockResolvedValue([item]);
      vi.mocked(appointmentRepo.count).mockResolvedValue(1);

      const result = await useCase.execute({
        filters: {},
        pagination: defaultPagination,
        actor: makeActor({ role: 'AM' }),
      });

      expect(result.data[0]!.serviceGroupId).toBe('group-uuid-1');
      expect(result.data[0]!.serviceGroupCode).toBe('42');
    });

    it('returns null serviceGroupId and serviceGroupCode for an ungrouped appointment', async () => {
      // factory defaults: entity serviceGroupId = null, serviceGroupNumber = null
      vi.mocked(appointmentRepo.findAll).mockResolvedValue([makeAppointmentListItem()]);
      vi.mocked(appointmentRepo.count).mockResolvedValue(1);

      const result = await useCase.execute({
        filters: {},
        pagination: defaultPagination,
        actor: makeActor({ role: 'AM' }),
      });

      expect(result.data[0]!.serviceGroupId).toBeNull();
      expect(result.data[0]!.serviceGroupCode).toBeNull();
    });
  });

  describe('confirmationStatus filter', () => {
    it('passes confirmationStatus filter to repository', async () => {
      vi.mocked(appointmentRepo.findAll).mockResolvedValue([]);
      vi.mocked(appointmentRepo.count).mockResolvedValue(0);

      await useCase.execute({
        filters: { confirmationStatus: 'CONFIRMED' },
        pagination: defaultPagination,
        actor: makeActor({ role: 'AM' }),
      });

      expect(appointmentRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ confirmationStatus: 'CONFIRMED' }),
        defaultPagination,
      );
    });
  });
});
