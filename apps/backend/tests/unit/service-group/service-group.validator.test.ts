import { describe, it, expect } from 'vitest';
import { ServiceGroupValidator } from '../../../src/modules/service-group/domain/service-group.validator';
import type { AppointmentForValidation } from '../../../src/modules/service-group/domain/service-group.validator';
import { GroupSizeTooSmallError } from '../../../src/modules/service-group/domain/service-group.errors';
import { GroupSizeTooLargeError } from '../../../src/modules/service-group/domain/service-group.errors';
import { AppointmentInvalidStatusError } from '../../../src/modules/service-group/domain/service-group.errors';
import { AppointmentAlreadyInGroupError } from '../../../src/modules/service-group/domain/service-group.errors';
import { ServiceTypeMismatchError } from '../../../src/modules/service-group/domain/service-group.errors';

function makeAppointment(overrides: Partial<AppointmentForValidation> = {}): AppointmentForValidation {
  return {
    id: `appt-${Math.random().toString(36).slice(2, 8)}`,
    status: 'AWAITING_INSPECTOR',
    serviceTypeId: 'st-1',
    tenantId: 'tenant-1',
    serviceGroupId: null,
    ...overrides,
  };
}

function makeAppointments(count: number, overrides: Partial<AppointmentForValidation> = {}): AppointmentForValidation[] {
  return Array.from({ length: count }, (_, i) =>
    makeAppointment({ id: `appt-${i + 1}`, ...overrides }),
  );
}

describe('ServiceGroupValidator', () => {
  describe('valid scenarios', () => {
    it('accepts 5 valid AWAITING_INSPECTOR appointments with same service type', () => {
      const appointments = makeAppointments(5);
      expect(() =>
        ServiceGroupValidator.validate(appointments, 'st-1', 'tenant-1'),
      ).not.toThrow();
    });

    it('accepts 25 valid appointments (maximum)', () => {
      const appointments = makeAppointments(25);
      expect(() =>
        ServiceGroupValidator.validate(appointments, 'st-1', 'tenant-1'),
      ).not.toThrow();
    });

    it('accepts an intermediate count (10 appointments)', () => {
      const appointments = makeAppointments(10);
      expect(() =>
        ServiceGroupValidator.validate(appointments, 'st-1', 'tenant-1'),
      ).not.toThrow();
    });
  });

  describe('size constraints', () => {
    it('rejects less than 5 appointments', () => {
      const appointments = makeAppointments(4);
      expect(() =>
        ServiceGroupValidator.validate(appointments, 'st-1', 'tenant-1'),
      ).toThrow(GroupSizeTooSmallError);
    });

    it('rejects 0 appointments', () => {
      expect(() =>
        ServiceGroupValidator.validate([], 'st-1', 'tenant-1'),
      ).toThrow(GroupSizeTooSmallError);
    });

    it('rejects more than 25 appointments', () => {
      const appointments = makeAppointments(26);
      expect(() =>
        ServiceGroupValidator.validate(appointments, 'st-1', 'tenant-1'),
      ).toThrow(GroupSizeTooLargeError);
    });

    it('includes actual size in error for too small', () => {
      const appointments = makeAppointments(3);
      try {
        ServiceGroupValidator.validate(appointments, 'st-1', 'tenant-1');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(GroupSizeTooSmallError);
        expect((err as GroupSizeTooSmallError).message).toContain('3');
      }
    });

    it('includes actual size in error for too large', () => {
      const appointments = makeAppointments(30);
      try {
        ServiceGroupValidator.validate(appointments, 'st-1', 'tenant-1');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(GroupSizeTooLargeError);
        expect((err as GroupSizeTooLargeError).message).toContain('30');
      }
    });
  });

  describe('appointment status', () => {
    it('accepts DRAFT appointments (grouping transitions them to AWAITING_INSPECTOR)', () => {
      const appointments = makeAppointments(5).map((a) => ({ ...a, status: 'DRAFT' }));
      expect(() =>
        ServiceGroupValidator.validate(appointments, 'st-1', 'tenant-1'),
      ).not.toThrow();
    });

    it('accepts a mix of DRAFT and AWAITING_INSPECTOR appointments', () => {
      const appointments = makeAppointments(5);
      appointments[0] = makeAppointment({ id: 'appt-draft', status: 'DRAFT' });
      expect(() =>
        ServiceGroupValidator.validate(appointments, 'st-1', 'tenant-1'),
      ).not.toThrow();
    });

    it('rejects SCHEDULED appointment', () => {
      const appointments = makeAppointments(5);
      appointments[0] = makeAppointment({ id: 'appt-sched', status: 'SCHEDULED' });
      expect(() =>
        ServiceGroupValidator.validate(appointments, 'st-1', 'tenant-1'),
      ).toThrow(AppointmentInvalidStatusError);
    });

    it('includes appointment id in error', () => {
      const appointments = makeAppointments(5);
      appointments[1] = makeAppointment({ id: 'appt-xyz', status: 'DONE' });
      try {
        ServiceGroupValidator.validate(appointments, 'st-1', 'tenant-1');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppointmentInvalidStatusError);
        expect((err as AppointmentInvalidStatusError).message).toContain('appt-xyz');
      }
    });
  });

  describe('appointment already in group', () => {
    it('rejects appointment that already belongs to a service group', () => {
      const appointments = makeAppointments(5);
      appointments[3] = makeAppointment({ id: 'appt-grouped', serviceGroupId: 'sg-existing' });
      expect(() =>
        ServiceGroupValidator.validate(appointments, 'st-1', 'tenant-1'),
      ).toThrow(AppointmentAlreadyInGroupError);
    });

    it('includes appointment id in error', () => {
      const appointments = makeAppointments(5);
      appointments[0] = makeAppointment({ id: 'appt-dup', serviceGroupId: 'sg-old' });
      try {
        ServiceGroupValidator.validate(appointments, 'st-1', 'tenant-1');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppointmentAlreadyInGroupError);
        expect((err as AppointmentAlreadyInGroupError).message).toContain('appt-dup');
      }
    });
  });

  describe('service type mismatch', () => {
    it('rejects appointment with different service type', () => {
      const appointments = makeAppointments(5);
      appointments[4] = makeAppointment({ id: 'appt-mismatch', serviceTypeId: 'st-other' });
      expect(() =>
        ServiceGroupValidator.validate(appointments, 'st-1', 'tenant-1'),
      ).toThrow(ServiceTypeMismatchError);
    });
  });
});
