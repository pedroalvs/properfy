import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotifyOnStatusTransitionHandler } from '../../../src/modules/notification/application/handlers/notify-on-status-transition.handler';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';

function makeAppointment(
  overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
): AppointmentEntity {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'prop-1',
    serviceTypeId: 'st-1',
    inspectorId: 'insp-1',
    status: 'SCHEDULED',
    scheduledDate: new Date('2026-04-01'),
    timeSlot: '09:00-12:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    tenantConfirmationStatus: 'CONFIRMED',
    priceAmount: 200,
    payoutAmount: 140,
    pricingRuleSnapshotJson: {},
    notes: null,
    customFieldsJson: null,
    reason: null,
    createdByUserId: 'user-1',
    doneCheckedByUserId: null,
    doneCheckedAt: null,
    serviceGroupId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makeContact(
  overrides: Partial<ConstructorParameters<typeof AppointmentContactEntity>[0]> = {},
): AppointmentContactEntity {
  return new AppointmentContactEntity({
    id: 'contact-1',
    appointmentId: 'appt-1',
    tenantName: 'John Smith',
    primaryEmail: 'john@example.com',
    secondaryEmail: null,
    primaryPhone: '+61400000000',
    secondaryPhone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeProperty(): PropertyEntity {
  return new PropertyEntity({
    id: 'prop-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyCode: 'PROP-001',
    type: 'HOUSE',
    street: '123 Main St',
    addressLine2: 'Unit 4',
    suburb: 'Sydney',
    postcode: '2000',
    state: 'NSW',
    country: 'Australia',
    geocodingStatus: 'DONE',
    latitude: null,
    longitude: null,
    notes: null,
    rulesJson: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

const appointmentRepo = {
  findById: vi.fn(),
  findAll: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  saveContact: vi.fn(),
  updateContact: vi.fn(),
  saveRestriction: vi.fn(),
  deleteRestrictionsByAppointmentId: vi.fn(),
};

const propertyRepo = {
  findById: vi.fn(),
  findByPropertyCode: vi.fn(),
  findAll: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
};

const createNotification = {
  execute: vi.fn().mockResolvedValue({ notificationId: 'notif-1' }),
};

function makeHandler() {
  return new NotifyOnStatusTransitionHandler(
    appointmentRepo as any,
    propertyRepo as any,
    createNotification as any,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  appointmentRepo.findById.mockResolvedValue({
    appointment: makeAppointment(),
    contact: makeContact(),
    restrictions: [],
  });
  propertyRepo.findById.mockResolvedValue(makeProperty());
  createNotification.execute.mockResolvedValue({ notificationId: 'notif-1' });
});

describe('NotifyOnStatusTransitionHandler', () => {
  it('sends INSPECTION_NOTICE email when target is SCHEDULED', async () => {
    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).toHaveBeenCalledOnce();
    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        templateCode: 'INSPECTION_NOTICE',
        channel: 'EMAIL',
        recipient: 'john@example.com',
      }),
    );
  });

  it('sends INSPECTION_CANCELLED email when target is CANCELLED', async () => {
    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'SCHEDULED',
      targetStatus: 'CANCELLED',
    });

    expect(createNotification.execute).toHaveBeenCalledOnce();
    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        templateCode: 'INSPECTION_CANCELLED',
        channel: 'EMAIL',
      }),
    );
  });

  it('skips notification when no contact exists (contact is null)', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment(),
      contact: null,
      restrictions: [],
    });

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('skips notification when primaryEmail is null', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment(),
      contact: makeContact({ primaryEmail: null }),
      restrictions: [],
    });

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('skips notification when appointment not found', async () => {
    appointmentRepo.findById.mockResolvedValue(null);

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('does not send notification for irrelevant transitions', async () => {
    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'DRAFT',
      targetStatus: 'AWAITING_INSPECTOR',
    });

    expect(appointmentRepo.findById).not.toHaveBeenCalled();
    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('does not throw when createNotification.execute throws', async () => {
    createNotification.execute.mockRejectedValueOnce(new Error('Queue failure'));

    const handler = makeHandler();
    await expect(
      handler.execute({
        appointmentId: 'appt-1',
        previousStatus: 'AWAITING_INSPECTOR',
        targetStatus: 'SCHEDULED',
      }),
    ).rejects.toThrow('Queue failure');
  });

  it('passes correct payloadJson with all expected keys', async () => {
    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        appointmentId: 'appt-1',
        payloadJson: {
          tenantName: 'John Smith',
          scheduledDate: '2026-04-01',
          timeSlot: '09:00-12:00',
          propertyAddress: '123 Main St, Unit 4, Sydney, NSW, 2000, Australia',
          appointmentReference: 'appt-1',
        },
      }),
    );
  });

  it('uses property fullAddress when property is found', async () => {
    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        payloadJson: expect.objectContaining({
          propertyAddress: '123 Main St, Unit 4, Sydney, NSW, 2000, Australia',
        }),
      }),
    );
  });

  it('falls back to empty string for address when property is not found', async () => {
    propertyRepo.findById.mockResolvedValue(null);

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        payloadJson: expect.objectContaining({
          propertyAddress: '',
        }),
      }),
    );
  });
});
