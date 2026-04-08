import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListAppointmentsUseCase } from '../../../src/modules/appointment/application/use-cases/list-appointments.use-case';
import type { IAppointmentRepository, AppointmentListItem } from '../../../src/modules/appointment/domain/appointment.repository';
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
      tenantConfirmationStatus: 'PENDING',
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
    branchName: 'Main Branch',
    serviceTypeName: 'Routine Inspection',
    inspectorName: null,
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
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      saveContact: vi.fn(),
      updateContact: vi.fn(),
      saveRestriction: vi.fn(),
      deleteRestrictionsByAppointmentId: vi.fn(),
      findScheduledOnDate: vi.fn(),
      findDuplicateForImport: vi.fn(),
    };
    useCase = new ListAppointmentsUseCase(appointmentRepo);
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
});
