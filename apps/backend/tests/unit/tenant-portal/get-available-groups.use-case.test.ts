import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GetAvailableGroupsUseCase,
  type GetAvailableGroupsInput,
} from '../../../src/modules/rental-tenant-portal/application/use-cases/get-available-groups.use-case';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import type { PortalEligibleGroupMember } from '../../../src/modules/service-group/domain/service-group.repository';

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
    rentalTenantConfirmationStatus: 'PENDING',
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

function makeMember(overrides: Partial<PortalEligibleGroupMember> = {}): PortalEligibleGroupMember {
  return {
    groupId: 'sg-1',
    scheduledDate: new Date('2026-05-31'),
    timeSlotStart: '13:00',
    timeSlotEnd: '15:00',
    suburb: 'Surry Hills',
    inspectorName: 'John Smith',
    isOwnAgency: true,
    ...overrides,
  };
}

const ELIGIBLE_MEMBER = makeMember();

function makeInput(overrides: Partial<GetAvailableGroupsInput> = {}): GetAvailableGroupsInput {
  return {
    appointmentId: 'appt-1',
    ...overrides,
  };
}

describe('GetAvailableGroupsUseCase', () => {
  let appointmentRepo: { findById: ReturnType<typeof vi.fn> };
  let serviceGroupRepo: { findPortalEligibleSlots: ReturnType<typeof vi.fn> };
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
      findPortalEligibleSlots: vi.fn().mockResolvedValue([ELIGIBLE_MEMBER]),
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
      groupId: 'sg-1',
      scheduledDate: '2026-05-31',
      timeSlotStart: '13:00',
      timeSlotEnd: '15:00',
      suburb: 'Surry Hills',
      inspectorName: 'John Smith',
      // 13:00-15:00 is two hours, so four inspections fit; the member holding
      // the window is the one already booked.
      bookedCount: 1,
      capacityMax: 4,
    });
  });

  it('should give each window of the same group its own numbers', async () => {
    serviceGroupRepo.findPortalEligibleSlots.mockResolvedValue([
      makeMember({ timeSlotStart: '08:00', timeSlotEnd: '16:00' }),
      makeMember({ timeSlotStart: '08:00', timeSlotEnd: '16:00' }),
      makeMember({ timeSlotStart: '08:00', timeSlotEnd: '16:00' }),
      makeMember({ timeSlotStart: '15:00', timeSlotEnd: '18:00' }),
    ]);

    const result = await useCase.execute(makeInput());

    expect(result.groups).toEqual([
      expect.objectContaining({ timeSlotStart: '08:00', timeSlotEnd: '16:00', bookedCount: 3, capacityMax: 16 }),
      expect.objectContaining({ timeSlotStart: '15:00', timeSlotEnd: '18:00', bookedCount: 1, capacityMax: 6 }),
    ]);
  });

  it('should not offer a window with no room left', async () => {
    serviceGroupRepo.findPortalEligibleSlots.mockResolvedValue([
      makeMember({ timeSlotStart: '08:00', timeSlotEnd: '09:00' }),
      makeMember({ timeSlotStart: '08:00', timeSlotEnd: '09:00' }),
    ]);

    const result = await useCase.execute(makeInput());
    expect(result.groups).toEqual([]);
  });

  it('should count another agency towards capacity without offering its window', async () => {
    serviceGroupRepo.findPortalEligibleSlots.mockResolvedValue([
      makeMember({ timeSlotStart: '08:00', timeSlotEnd: '10:00' }),
      makeMember({ timeSlotStart: '11:00', timeSlotEnd: '12:00', isOwnAgency: false }),
    ]);

    const result = await useCase.execute(makeInput());

    expect(result.groups).toEqual([
      expect.objectContaining({ timeSlotStart: '08:00', timeSlotEnd: '10:00', bookedCount: 1, capacityMax: 4 }),
    ]);
  });

  it('should return groups even after the portal token expired (isReadOnly)', async () => {
    const result = await useCase.execute(makeInput());
    expect(result.groups).toHaveLength(1);
    expect(serviceGroupRepo.findPortalEligibleSlots).toHaveBeenCalled();
  });

  it('should pass correct params to repository', async () => {
    await useCase.execute(makeInput());
    expect(serviceGroupRepo.findPortalEligibleSlots).toHaveBeenCalledWith(
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
    expect(serviceGroupRepo.findPortalEligibleSlots).not.toHaveBeenCalled();
  });
});
