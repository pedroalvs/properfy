import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FindAddableGroupsForAppointmentsUseCase } from '../../../src/modules/service-group/application/use-cases/find-addable-groups-for-appointments.use-case';
import type { IServiceGroupRepository } from '../../../src/modules/service-group/domain/service-group.repository';
import type { IAppointmentRepository } from '../../../src/modules/appointment/domain/appointment.repository';
import type { AuthContext } from '@properfy/shared';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const makeAuth = (role: AuthContext['role'] = 'OP'): AuthContext => ({
  userId: 'user-1',
  tenantId: role === 'AM' || role === 'OP' ? null : 'tenant-1',
  role,
} as AuthContext);

function makeApptResult(overrides: Record<string, unknown> = {}) {
  return {
    appointment: {
      id: 'appt-1',
      tenantId: 'tenant-1',
      serviceTypeId: 'svc-1',
      scheduledDate: new Date('2026-07-01T00:00:00.000Z'),
      timeSlot: '09:00-10:00',
      ...overrides,
    },
    // required fields from AppointmentWithRelations
    contact: null,
    contacts: [],
    restrictions: [],
    propertyAddress: '123 Test St',
    propertyCode: null,
    propertyLatitude: null,
    propertyLongitude: null,
    tenantName: 'Acme',
    tenantAppointmentCodePrefix: null,
    branchName: 'Branch',
    serviceTypeName: 'Routine',
    inspectorName: null,
  } as any;
}

describe('FindAddableGroupsForAppointmentsUseCase', () => {
  let groupRepo: IServiceGroupRepository;
  let appointmentRepo: IAppointmentRepository;
  let authSvc: AuthorizationService;
  let useCase: FindAddableGroupsForAppointmentsUseCase;

  beforeEach(() => {
    groupRepo = {
      findAddableForAppointments: vi.fn().mockResolvedValue([]),
    } as unknown as IServiceGroupRepository;

    appointmentRepo = {
      findById: vi.fn().mockResolvedValue(makeApptResult()),
    } as unknown as IAppointmentRepository;

    authSvc = new AuthorizationService({ log: vi.fn() } as any);
    useCase = new FindAddableGroupsForAppointmentsUseCase(groupRepo, appointmentRepo, authSvc);
  });

  it('returns groups from repo for eligible AM/OP actor', async () => {
    const fakeGroups = [{ id: 'g-1', name: 'Group 1', status: 'DRAFT', scheduledDate: new Date(), timeWindow: '09:00-17:00', currentSize: 5, serviceTypeName: 'Routine' }];
    (groupRepo.findAddableForAppointments as ReturnType<typeof vi.fn>).mockResolvedValue(fakeGroups);

    const result = await useCase.execute({ appointmentIds: ['appt-1'], actor: makeAuth('OP') });
    expect(result.groups).toEqual(fakeGroups);
    expect(result.reason).toBeUndefined();
  });

  it('returns MIXED_APPOINTMENT_PROPERTIES when appointments have different serviceTypeId', async () => {
    (appointmentRepo.findById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeApptResult({ serviceTypeId: 'svc-1' }))
      .mockResolvedValueOnce(makeApptResult({ serviceTypeId: 'svc-2' }));

    const result = await useCase.execute({ appointmentIds: ['appt-1', 'appt-2'], actor: makeAuth('OP') });
    expect(result.groups).toHaveLength(0);
    expect(result.reason).toBe('MIXED_APPOINTMENT_PROPERTIES');
    expect(groupRepo.findAddableForAppointments).not.toHaveBeenCalled();
  });

  it('returns MIXED_APPOINTMENT_PROPERTIES when appointments have different tenantId', async () => {
    (appointmentRepo.findById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeApptResult({ tenantId: 'tenant-1' }))
      .mockResolvedValueOnce(makeApptResult({ tenantId: 'tenant-2' }));

    const result = await useCase.execute({ appointmentIds: ['appt-1', 'appt-2'], actor: makeAuth('AM') });
    expect(result.reason).toBe('MIXED_APPOINTMENT_PROPERTIES');
  });

  it('throws ForbiddenError for non-AM/OP roles', async () => {
    await expect(
      useCase.execute({ appointmentIds: ['appt-1'], actor: makeAuth('CL_ADMIN') }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('returns empty groups when no appointments found', async () => {
    (appointmentRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await useCase.execute({ appointmentIds: ['nonexistent'], actor: makeAuth('OP') });
    expect(result.groups).toHaveLength(0);
    expect(result.reason).toBeUndefined();
  });
});
