import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GetAvailableGroupsUseCase,
  type GetAvailableGroupsInput,
} from '../../../src/modules/tenant-portal/application/use-cases/get-available-groups.use-case';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import type { PortalEligibleGroup } from '../../../src/modules/service-group/domain/service-group.repository';

function makeAppointment() {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'prop-1',
    serviceTypeId: 'stype-1',
    inspectorId: null,
    status: 'SCHEDULED',
    scheduledDate: new Date('2026-05-30'),
    timeSlotStart: '09:00', timeSlotEnd: '12:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    tenantConfirmationStatus: 'PENDING',
    priceAmount: 100,
    payoutAmount: 70,
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
  });
}

const ELIGIBLE_GROUP: PortalEligibleGroup = {
  id: 'sg-1',
  scheduledDate: new Date('2026-05-31'),
  timeWindow: '09:00-12:00',
  suburb: 'Surry Hills',
  inspectorName: 'John Smith',
  confirmedCount: 3,
  capacityMax: 10,
};

function makeInput(overrides: Partial<GetAvailableGroupsInput> = {}): GetAvailableGroupsInput {
  return {
    appointmentId: 'appt-1',
    isReadOnly: false,
    ...overrides,
  };
}

describe('GetAvailableGroupsUseCase', () => {
  let appointmentRepo: { findById: ReturnType<typeof vi.fn> };
  let serviceGroupRepo: { findPortalEligibleGroups: ReturnType<typeof vi.fn> };
  let useCase: GetAvailableGroupsUseCase;

  beforeEach(() => {
    appointmentRepo = {
      findById: vi.fn().mockResolvedValue({
        appointment: makeAppointment(),
        contact: null,
        restrictions: [],
      }),
    };
    serviceGroupRepo = {
      findPortalEligibleGroups: vi.fn().mockResolvedValue([ELIGIBLE_GROUP]),
    };
    useCase = new GetAvailableGroupsUseCase(
      appointmentRepo as any,
      serviceGroupRepo as any,
    );
  });

  it('should return groups from repository', async () => {
    const result = await useCase.execute(makeInput());
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({
      id: 'sg-1',
      scheduledDate: '2026-05-31',
      timeWindow: '09:00-12:00',
      suburb: 'Surry Hills',
      inspectorName: 'John Smith',
      confirmedCount: 3,
      capacityMax: 10,
    });
  });

  it('should return empty groups when isReadOnly (past cutoff)', async () => {
    const result = await useCase.execute(makeInput({ isReadOnly: true }));
    expect(result.groups).toEqual([]);
    expect(serviceGroupRepo.findPortalEligibleGroups).not.toHaveBeenCalled();
  });

  it('should pass correct params to repository', async () => {
    await useCase.execute(makeInput());
    expect(serviceGroupRepo.findPortalEligibleGroups).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        serviceTypeId: 'stype-1',
        propertyId: 'prop-1',
      }),
    );
  });

  it('should return empty when appointment not found', async () => {
    appointmentRepo.findById.mockResolvedValue(null);
    const result = await useCase.execute(makeInput());
    expect(result.groups).toEqual([]);
  });

  it('should return empty when appointment has no propertyId', async () => {
    const apptNoProperty = makeAppointment();
    (apptNoProperty as any).propertyId = null;
    appointmentRepo.findById.mockResolvedValue({
      appointment: apptNoProperty,
      contact: null,
      restrictions: [],
    });
    const result = await useCase.execute(makeInput());
    expect(result.groups).toEqual([]);
    expect(serviceGroupRepo.findPortalEligibleGroups).not.toHaveBeenCalled();
  });
});
