import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { FindMoveTargetGroupsForAppointmentsUseCase } from '../../../src/modules/service-group/application/use-cases/find-move-target-groups-for-appointments.use-case';
import type { IServiceGroupRepository } from '../../../src/modules/service-group/domain/service-group.repository';
import type { IAppointmentRepository, AppointmentWithRelations } from '../../../src/modules/appointment/domain/appointment.repository';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return { userId: 'user-1', tenantId: null, role: 'OP', branchId: null, inspectorId: null, ...overrides };
}

function makeApptWithRelations(
  overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
): AppointmentWithRelations {
  return {
    appointment: new AppointmentEntity({
      id: 'appt-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      propertyId: 'property-1',
      serviceTypeId: 'svc-type-1',
      inspectorId: null,
      status: 'AWAITING_INSPECTOR',
      scheduledDate: new Date('2026-08-10T00:00:00.000Z'),
      timeSlotStart: '09:00',
      timeSlotEnd: '10:00',
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
      serviceGroupId: 'source-group',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    }),
    contact: null,
    contacts: [],
    restrictions: [],
    hasActivePortalToken: false,
  };
}

const BEFORE_CUTOFF = () => new Date('2026-08-10T02:00:00.000Z'); // 12:00 Sydney

describe('FindMoveTargetGroupsForAppointmentsUseCase', () => {
  let groupRepo: IServiceGroupRepository;
  let appointmentRepo: IAppointmentRepository;
  let auditService: AuditService;

  function makeUseCase(clock = BEFORE_CUTOFF): FindMoveTargetGroupsForAppointmentsUseCase {
    return new FindMoveTargetGroupsForAppointmentsUseCase(
      groupRepo,
      appointmentRepo,
      new AuthorizationService(auditService),
      clock,
    );
  }

  beforeEach(() => {
    auditService = { log: vi.fn() } as unknown as AuditService;
    groupRepo = {
      findMoveTargetsForAppointments: vi.fn().mockResolvedValue([
        { id: 'g-today', groupNumber: 1, code: '1', status: 'PUBLISHED', scheduledDate: new Date('2026-08-10T00:00:00.000Z'), timeWindow: '08:00-12:00', currentSize: 2, serviceTypeName: 'Routine' },
        { id: 'g-future', groupNumber: 2, code: '2', status: 'ACCEPTED', scheduledDate: new Date('2026-08-20T00:00:00.000Z'), timeWindow: '08:00-12:00', currentSize: 5, serviceTypeName: 'Routine' },
      ]),
    } as unknown as IServiceGroupRepository;
    appointmentRepo = {
      findById: vi.fn().mockResolvedValue(makeApptWithRelations()),
    } as unknown as IAppointmentRepository;
  });

  it('returns targets with a server-computed isCurrentDay flag', async () => {
    const result = await makeUseCase().execute({ appointmentIds: ['appt-1'], actor: makeActor() });

    expect(result.reason).toBeUndefined();
    expect(result.groups).toHaveLength(2);
    expect(result.groups.find((g) => g.id === 'g-today')!.isCurrentDay).toBe(true);
    expect(result.groups.find((g) => g.id === 'g-future')!.isCurrentDay).toBe(false);
  });

  it('passes the appointments current groups as excludeGroupIds and today as the lower bound', async () => {
    await makeUseCase().execute({ appointmentIds: ['appt-1'], actor: makeActor() });

    expect(groupRepo.findMoveTargetsForAppointments).toHaveBeenCalledWith(
      expect.objectContaining({ serviceTypeId: 'svc-type-1', excludeGroupIds: ['source-group'], lowerBoundDate: '2026-08-10' }),
    );
  });

  it('uses tomorrow as the lower bound once past the 18:50 cutoff', async () => {
    const afterCutoff = () => new Date('2026-08-10T09:00:00.000Z'); // 19:00 Sydney
    await makeUseCase(afterCutoff).execute({ appointmentIds: ['appt-1'], actor: makeActor() });

    expect(groupRepo.findMoveTargetsForAppointments).toHaveBeenCalledWith(
      expect.objectContaining({ lowerBoundDate: '2026-08-11' }),
    );
  });

  it('returns NOT_GROUPED when any selected appointment is ungrouped', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeApptWithRelations({ serviceGroupId: null }));

    const result = await makeUseCase().execute({ appointmentIds: ['appt-1'], actor: makeActor() });

    expect(result.reason).toBe('NOT_GROUPED');
    expect(result.groups).toEqual([]);
    expect(groupRepo.findMoveTargetsForAppointments).not.toHaveBeenCalled();
  });

  it('returns MIXED_APPOINTMENT_PROPERTIES for mixed service types', async () => {
    vi.mocked(appointmentRepo.findById)
      .mockResolvedValueOnce(makeApptWithRelations({ id: 'a', serviceTypeId: 'svc-type-1' }))
      .mockResolvedValueOnce(makeApptWithRelations({ id: 'b', serviceTypeId: 'svc-type-2' }));

    const result = await makeUseCase().execute({ appointmentIds: ['a', 'b'], actor: makeActor() });

    expect(result.reason).toBe('MIXED_APPOINTMENT_PROPERTIES');
  });

  it('forbids a non AM/OP actor', async () => {
    await expect(
      makeUseCase().execute({ appointmentIds: ['appt-1'], actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }) }),
    ).rejects.toThrow();
  });
});
