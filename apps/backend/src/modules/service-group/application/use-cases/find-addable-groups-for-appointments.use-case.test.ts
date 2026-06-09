/**
 * Unit tests for FindAddableGroupsForAppointmentsUseCase.
 *
 * Uses real validator logic (no mocked WHERE filters) so the status pre-check
 * is exercised against actual appointment data — ref feedback: mock-masks-real-bug.
 */

import { describe, it, expect, vi } from 'vitest';
import { FindAddableGroupsForAppointmentsUseCase } from './find-addable-groups-for-appointments.use-case';
import type { AppointmentEntity } from '../../../appointment/domain/appointment.entity';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { AuthContext } from '@properfy/shared';

const TENANT_ID = 'tenant-aaa';
const SERVICE_TYPE_ID = 'svc-bbb';
const SCHEDULED_DATE = new Date('2026-06-01T00:00:00.000Z');
const TIME_SLOT = '09:00-10:00';

function makeAppointment(id: string, status: string): AppointmentEntity {
  return {
    id,
    tenantId: TENANT_ID,
    serviceTypeId: SERVICE_TYPE_ID,
    scheduledDate: SCHEDULED_DATE,
    timeSlot: TIME_SLOT,
    status,
  } as unknown as AppointmentEntity;
}

const actorOp: AuthContext = { userId: 'op-1', tenantId: TENANT_ID, role: 'OP', branchId: null, inspectorId: null };

function makeUseCase(appointments: AppointmentEntity[]) {
  const appointmentRepo = {
    findById: vi.fn(async (id: string) => {
      const appt = appointments.find((a) => a.id === id);
      return appt ? { appointment: appt } : null;
    }),
  } as unknown as IAppointmentRepository;

  const groupRepo = {
    findAddableForAppointments: vi.fn(async () => []),
  } as unknown as IServiceGroupRepository;

  const authorizationService = {
    assertRoles: vi.fn(),
  } as unknown as AuthorizationService;

  return { useCase: new FindAddableGroupsForAppointmentsUseCase(groupRepo, appointmentRepo, authorizationService), groupRepo };
}

describe('FindAddableGroupsForAppointmentsUseCase', () => {
  it('should return INVALID_APPOINTMENT_STATUS when selection includes DONE appointment', async () => {
    const apptDraft = makeAppointment('id-1', 'DRAFT');
    const apptDone = makeAppointment('id-2', 'DONE');
    const { useCase, groupRepo } = makeUseCase([apptDraft, apptDone]);

    const result = await useCase.execute({
      appointmentIds: ['id-1', 'id-2'],
      actor: actorOp,
    });

    expect(result).toEqual({ groups: [], reason: 'INVALID_APPOINTMENT_STATUS' });
    expect(groupRepo.findAddableForAppointments).not.toHaveBeenCalled();
  });

  it('should return INVALID_APPOINTMENT_STATUS when selection includes SCHEDULED appointment', async () => {
    const apptScheduled = makeAppointment('id-3', 'SCHEDULED');
    const { useCase } = makeUseCase([apptScheduled]);

    const result = await useCase.execute({
      appointmentIds: ['id-3'],
      actor: actorOp,
    });

    expect(result).toEqual({ groups: [], reason: 'INVALID_APPOINTMENT_STATUS' });
  });

  it('should proceed to group query when all appointments are DRAFT or AWAITING_INSPECTOR', async () => {
    const apptDraft = makeAppointment('id-4', 'DRAFT');
    const apptAwaiting = makeAppointment('id-5', 'AWAITING_INSPECTOR');
    const { useCase, groupRepo } = makeUseCase([apptDraft, apptAwaiting]);

    await useCase.execute({
      appointmentIds: ['id-4', 'id-5'],
      actor: actorOp,
    });

    expect(groupRepo.findAddableForAppointments).toHaveBeenCalledOnce();
  });

  it('should return MIXED_APPOINTMENT_PROPERTIES before status check when properties differ', async () => {
    // Tenant may differ (groups are tenant-agnostic); a different service type
    // is still a mixed-property rejection.
    const apptA = makeAppointment('id-6', 'DRAFT');
    const apptB = { ...makeAppointment('id-7', 'DRAFT'), serviceTypeId: 'other-service-type' } as unknown as AppointmentEntity;
    const { useCase } = makeUseCase([apptA, apptB]);

    const result = await useCase.execute({
      appointmentIds: ['id-6', 'id-7'],
      actor: actorOp,
    });

    expect(result).toEqual({ groups: [], reason: 'MIXED_APPOINTMENT_PROPERTIES' });
  });
});
