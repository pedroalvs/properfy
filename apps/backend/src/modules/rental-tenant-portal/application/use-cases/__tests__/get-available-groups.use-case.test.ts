import { describe, it, expect, vi } from 'vitest';
import { GetAvailableGroupsUseCase } from '../get-available-groups.use-case';

function makeUseCase(appointmentOverrides: Record<string, unknown> = {}) {
  const appointment = {
    id: 'appt-1',
    tenantId: 'tenant-1',
    propertyId: 'prop-1',
    serviceTypeId: 'stype-1',
    serviceGroupId: 'sg-own',
    ...appointmentOverrides,
  };
  const appointmentRepo = {
    findById: vi.fn().mockResolvedValue({ appointment, contact: null, contacts: [], restrictions: [] }),
  };
  const serviceGroupRepo = {
    findPortalEligibleSlots: vi.fn().mockResolvedValue([
      {
        groupId: 'sg-other',
        scheduledDate: new Date('2026-08-01T00:00:00.000Z'),
        timeSlotStart: '09:00',
        timeSlotEnd: '12:00',
        suburb: 'Surry Hills',
        inspectorName: 'John Smith',
        confirmedCount: 2,
        capacityMax: 10,
      },
    ]),
  };
  const uc = new GetAvailableGroupsUseCase(appointmentRepo as any, serviceGroupRepo as any);
  return { uc, appointmentRepo, serviceGroupRepo };
}

describe('GetAvailableGroupsUseCase', () => {
  it('excludes the appointment current group from the eligible-slot query', async () => {
    const { uc, serviceGroupRepo } = makeUseCase();

    await uc.execute({ appointmentId: 'appt-1' });

    expect(serviceGroupRepo.findPortalEligibleSlots).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        serviceTypeId: 'stype-1',
        propertyId: 'prop-1',
        excludeGroupId: 'sg-own',
      }),
    );
  });

  it('passes null excludeGroupId when the appointment has no group', async () => {
    const { uc, serviceGroupRepo } = makeUseCase({ serviceGroupId: null });

    await uc.execute({ appointmentId: 'appt-1' });

    expect(serviceGroupRepo.findPortalEligibleSlots).toHaveBeenCalledWith(
      expect.objectContaining({ excludeGroupId: null }),
    );
  });

  it('maps eligible slots to the portal group shape', async () => {
    const { uc } = makeUseCase();

    const result = await uc.execute({ appointmentId: 'appt-1' });

    expect(result.groups).toEqual([
      {
        groupId: 'sg-other',
        scheduledDate: '2026-08-01',
        timeSlotStart: '09:00',
        timeSlotEnd: '12:00',
        suburb: 'Surry Hills',
        inspectorName: 'John Smith',
        confirmedCount: 2,
        capacityMax: 10,
      },
    ]);
  });

  it('returns empty groups when the appointment is missing', async () => {
    const { uc, appointmentRepo, serviceGroupRepo } = makeUseCase();
    appointmentRepo.findById.mockResolvedValue(null);

    const result = await uc.execute({ appointmentId: 'appt-1' });

    expect(result.groups).toEqual([]);
    expect(serviceGroupRepo.findPortalEligibleSlots).not.toHaveBeenCalled();
  });
});
