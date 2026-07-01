import { describe, it, expect } from 'vitest';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import type { AppointmentProps } from '../../../src/modules/appointment/domain/appointment.entity';

function makeAppointment(overrides: Partial<AppointmentProps> = {}): AppointmentEntity {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'prop-1',
    serviceTypeId: 'st-1',
    inspectorId: null,
    status: 'DRAFT',
    scheduledDate: new Date('2026-04-01'),
    timeSlotStart: '09:00',
    timeSlotEnd: '12:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    rentalTenantConfirmationStatus: 'PENDING',
    priceAmount: 200,
    payoutAmount: 140,
    pricingRuleSnapshotJson: {},
    notes: null,
    customFieldsJson: null,
    reason: null,
    createdByUserId: 'user-1',
    doneMarkedByUserId: null,
    doneCheckedByUserId: null,
    doneCheckedAt: null,
    serviceGroupId: null,
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-01'),
    deletedAt: null,
    ...overrides,
  });
}

describe('AppointmentEntity', () => {
  describe('isEditable()', () => {
    it('returns true for DRAFT status', () => {
      const appt = makeAppointment({ status: 'DRAFT' });
      expect(appt.isEditable()).toBe(true);
    });

    it('returns true for AWAITING_INSPECTOR status', () => {
      const appt = makeAppointment({ status: 'AWAITING_INSPECTOR' });
      expect(appt.isEditable()).toBe(true);
    });

    it('returns false for SCHEDULED status', () => {
      const appt = makeAppointment({ status: 'SCHEDULED' });
      expect(appt.isEditable()).toBe(false);
    });

    it('returns false for DONE status', () => {
      const appt = makeAppointment({ status: 'DONE' });
      expect(appt.isEditable()).toBe(false);
    });

    it('returns false for CANCELLED status', () => {
      const appt = makeAppointment({ status: 'CANCELLED' });
      expect(appt.isEditable()).toBe(false);
    });

    it('returns false for REJECTED status', () => {
      const appt = makeAppointment({ status: 'REJECTED' });
      expect(appt.isEditable()).toBe(false);
    });
  });

  describe('isActive() and isDeleted()', () => {
    it('isActive() returns true when deletedAt is null', () => {
      const appt = makeAppointment({ deletedAt: null });
      expect(appt.isActive()).toBe(true);
    });

    it('isActive() returns false when deletedAt is set', () => {
      const appt = makeAppointment({ deletedAt: new Date() });
      expect(appt.isActive()).toBe(false);
    });

    it('isDeleted() returns false when deletedAt is null', () => {
      const appt = makeAppointment({ deletedAt: null });
      expect(appt.isDeleted()).toBe(false);
    });

    it('isDeleted() returns true when deletedAt is set', () => {
      const appt = makeAppointment({ deletedAt: new Date() });
      expect(appt.isDeleted()).toBe(true);
    });
  });

  describe('canTransitionTo()', () => {
    it('DRAFT can transition to AWAITING_INSPECTOR', () => {
      expect(makeAppointment({ status: 'DRAFT' }).canTransitionTo('AWAITING_INSPECTOR')).toBe(true);
    });

    it('DRAFT can transition to REJECTED', () => {
      expect(makeAppointment({ status: 'DRAFT' }).canTransitionTo('REJECTED')).toBe(true);
    });

    it('DRAFT can transition to CANCELLED', () => {
      expect(makeAppointment({ status: 'DRAFT' }).canTransitionTo('CANCELLED')).toBe(true);
    });

    it('AWAITING_INSPECTOR can transition to SCHEDULED', () => {
      expect(
        makeAppointment({ status: 'AWAITING_INSPECTOR' }).canTransitionTo('SCHEDULED'),
      ).toBe(true);
    });

    it('AWAITING_INSPECTOR can transition to CANCELLED', () => {
      expect(
        makeAppointment({ status: 'AWAITING_INSPECTOR' }).canTransitionTo('CANCELLED'),
      ).toBe(true);
    });

    it('AWAITING_INSPECTOR can transition to REJECTED', () => {
      expect(
        makeAppointment({ status: 'AWAITING_INSPECTOR' }).canTransitionTo('REJECTED'),
      ).toBe(true);
    });

    it('SCHEDULED can transition to DONE', () => {
      expect(makeAppointment({ status: 'SCHEDULED' }).canTransitionTo('DONE')).toBe(true);
    });

    it('SCHEDULED can transition to CANCELLED', () => {
      expect(makeAppointment({ status: 'SCHEDULED' }).canTransitionTo('CANCELLED')).toBe(true);
    });

    it('SCHEDULED can transition to REJECTED', () => {
      expect(makeAppointment({ status: 'SCHEDULED' }).canTransitionTo('REJECTED')).toBe(true);
    });

    it('DONE can transition to DRAFT', () => {
      expect(makeAppointment({ status: 'DONE' }).canTransitionTo('DRAFT')).toBe(true);
    });

    it('DONE can transition to REJECTED', () => {
      expect(makeAppointment({ status: 'DONE' }).canTransitionTo('REJECTED')).toBe(true);
    });

    it('CANCELLED can transition to DRAFT', () => {
      expect(makeAppointment({ status: 'CANCELLED' }).canTransitionTo('DRAFT')).toBe(true);
    });

    it('REJECTED can transition to DRAFT', () => {
      expect(makeAppointment({ status: 'REJECTED' }).canTransitionTo('DRAFT')).toBe(true);
    });

    it('REJECTED can transition to AWAITING_INSPECTOR', () => {
      expect(
        makeAppointment({ status: 'REJECTED' }).canTransitionTo('AWAITING_INSPECTOR'),
      ).toBe(true);
    });

    it('returns false for invalid transition DRAFT → DONE', () => {
      expect(makeAppointment({ status: 'DRAFT' }).canTransitionTo('DONE')).toBe(false);
    });

    it('returns false for invalid transition DONE → AWAITING_INSPECTOR', () => {
      expect(makeAppointment({ status: 'DONE' }).canTransitionTo('AWAITING_INSPECTOR')).toBe(false);
    });

    it('returns false for invalid transition DONE → CANCELLED', () => {
      expect(makeAppointment({ status: 'DONE' }).canTransitionTo('CANCELLED')).toBe(false);
    });

    it('returns false for invalid transition DONE → SCHEDULED', () => {
      expect(makeAppointment({ status: 'DONE' }).canTransitionTo('SCHEDULED')).toBe(false);
    });

    it('returns false for invalid transition SCHEDULED → AWAITING_INSPECTOR', () => {
      expect(
        makeAppointment({ status: 'SCHEDULED' }).canTransitionTo('AWAITING_INSPECTOR'),
      ).toBe(false);
    });

    it('returns false for invalid transition CANCELLED → DONE', () => {
      expect(makeAppointment({ status: 'CANCELLED' }).canTransitionTo('DONE')).toBe(false);
    });
  });
});
