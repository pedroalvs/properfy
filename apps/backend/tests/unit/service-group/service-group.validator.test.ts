import { describe, it, expect } from 'vitest';
import { ServiceGroupValidator } from '../../../src/modules/service-group/domain/service-group.validator';
import type { AppointmentForValidation } from '../../../src/modules/service-group/domain/service-group.validator';
import { AppointmentInvalidStatusError } from '../../../src/modules/service-group/domain/service-group.errors';
import { AppointmentAlreadyInGroupError } from '../../../src/modules/service-group/domain/service-group.errors';
import { ServiceTypeMismatchError } from '../../../src/modules/service-group/domain/service-group.errors';

function makeAppointment(overrides: Partial<AppointmentForValidation> = {}): AppointmentForValidation {
  return {
    id: `appt-${Math.random().toString(36).slice(2, 8)}`,
    appointmentNumber: Math.floor(Math.random() * 9000) + 1000,
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
  describe('valid scenarios (no size limits)', () => {
    it('accepts a single appointment', () => {
      const appointments = makeAppointments(1);
      expect(() =>
        ServiceGroupValidator.validate(appointments, 'st-1'),
      ).not.toThrow();
    });

    it('accepts an intermediate count (10 appointments)', () => {
      const appointments = makeAppointments(10);
      expect(() =>
        ServiceGroupValidator.validate(appointments, 'st-1'),
      ).not.toThrow();
    });

    it('accepts more than 30 appointments (no upper bound at creation)', () => {
      const appointments = makeAppointments(50);
      expect(() =>
        ServiceGroupValidator.validate(appointments, 'st-1'),
      ).not.toThrow();
    });
  });

  describe('appointment status', () => {
    it('accepts DRAFT appointments (grouping transitions them to AWAITING_INSPECTOR)', () => {
      const appointments = makeAppointments(5).map((a) => ({ ...a, status: 'DRAFT' }));
      expect(() =>
        ServiceGroupValidator.validate(appointments, 'st-1'),
      ).not.toThrow();
    });

    it('accepts a mix of DRAFT and AWAITING_INSPECTOR appointments', () => {
      const appointments = makeAppointments(5);
      appointments[0] = makeAppointment({ id: 'appt-draft', status: 'DRAFT' });
      expect(() =>
        ServiceGroupValidator.validate(appointments, 'st-1'),
      ).not.toThrow();
    });

    it('rejects SCHEDULED appointment', () => {
      const appointments = makeAppointments(5);
      appointments[0] = makeAppointment({ id: 'appt-sched', status: 'SCHEDULED' });
      expect(() =>
        ServiceGroupValidator.validate(appointments, 'st-1'),
      ).toThrow(AppointmentInvalidStatusError);
    });

    it('includes appointment number in error', () => {
      const appointments = makeAppointments(5);
      appointments[1] = makeAppointment({ id: 'appt-xyz', appointmentNumber: 9999, status: 'DONE' });
      try {
        ServiceGroupValidator.validate(appointments, 'st-1');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppointmentInvalidStatusError);
        expect((err as AppointmentInvalidStatusError).message).toContain('#9999');
      }
    });
  });

  describe('appointment already in group', () => {
    it('rejects appointment that already belongs to a service group', () => {
      const appointments = makeAppointments(5);
      appointments[3] = makeAppointment({ id: 'appt-grouped', serviceGroupId: 'sg-existing' });
      expect(() =>
        ServiceGroupValidator.validate(appointments, 'st-1'),
      ).toThrow(AppointmentAlreadyInGroupError);
    });

    it('includes appointment number in error', () => {
      const appointments = makeAppointments(5);
      appointments[0] = makeAppointment({ id: 'appt-dup', appointmentNumber: 8888, serviceGroupId: 'sg-old' });
      try {
        ServiceGroupValidator.validate(appointments, 'st-1');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppointmentAlreadyInGroupError);
        expect((err as AppointmentAlreadyInGroupError).message).toContain('#8888');
      }
    });
  });

  describe('service type mismatch', () => {
    it('rejects appointment with different service type', () => {
      const appointments = makeAppointments(5);
      appointments[4] = makeAppointment({ id: 'appt-mismatch', serviceTypeId: 'st-other' });
      expect(() =>
        ServiceGroupValidator.validate(appointments, 'st-1'),
      ).toThrow(ServiceTypeMismatchError);
    });
  });

});

// 026 §FR-510 — predicate variant. Powers the per-item mixed-result
// envelope for add + eligibility-check use cases; the original `validate`
// keeps the create flow's all-or-nothing semantic.
describe('ServiceGroupValidator.canAddToGroup (026 §FR-510)', () => {
  const baseAppointment = {
    id: 'apt-1',
    appointmentNumber: 1,
    status: 'DRAFT',
    serviceTypeId: 'st-1',
    tenantId: 'tenant-1',
    serviceGroupId: null,
    scheduledDate: new Date('2026-06-01T00:00:00Z'),
    timeSlot: '09:00-12:00',
  };
  const baseGroup = {
    status: 'DRAFT' as const,
    tenantId: 'tenant-1',
    serviceTypeId: 'st-1',
    scheduledDate: new Date('2026-06-01T00:00:00Z'),
    timeWindow: '09:00-12:00',
    currentSize: 5,
  };

  it('accepts a fully matching DRAFT appointment', () => {
    expect(ServiceGroupValidator.canAddToGroup(baseAppointment, baseGroup)).toEqual({ ok: true });
  });

  it('accepts AWAITING_INSPECTOR appointments', () => {
    expect(ServiceGroupValidator.canAddToGroup(
      { ...baseAppointment, status: 'AWAITING_INSPECTOR' },
      baseGroup,
    )).toEqual({ ok: true });
  });

  it('rejects when the group is in a terminal state', () => {
    expect(ServiceGroupValidator.canAddToGroup(
      baseAppointment, { ...baseGroup, status: 'ACCEPTED' },
    )).toEqual({ ok: false, reasonCode: 'GROUP_IN_TERMINAL_STATE' });
    expect(ServiceGroupValidator.canAddToGroup(
      baseAppointment, { ...baseGroup, status: 'CANCELLED' },
    )).toEqual({ ok: false, reasonCode: 'GROUP_IN_TERMINAL_STATE' });
    expect(ServiceGroupValidator.canAddToGroup(
      baseAppointment, { ...baseGroup, status: 'REJECTED' },
    )).toEqual({ ok: false, reasonCode: 'GROUP_IN_TERMINAL_STATE' });
  });

  it('rejects when the group is at capacity (30)', () => {
    expect(ServiceGroupValidator.canAddToGroup(
      baseAppointment, { ...baseGroup, currentSize: 30 },
    )).toEqual({ ok: false, reasonCode: 'GROUP_CAPACITY_EXCEEDED' });
  });

  it('allows an appointment from a different agency (groups are tenant-agnostic)', () => {
    expect(ServiceGroupValidator.canAddToGroup(
      { ...baseAppointment, tenantId: 'tenant-OTHER' }, baseGroup,
    )).toEqual({ ok: true });
  });

  it('rejects when service type mismatches', () => {
    expect(ServiceGroupValidator.canAddToGroup(
      { ...baseAppointment, serviceTypeId: 'st-OTHER' }, baseGroup,
    )).toEqual({ ok: false, reasonCode: 'INVALID_SERVICE_TYPE' });
  });

  it('rejects DONE/CANCELLED/SCHEDULED statuses', () => {
    for (const status of ['DONE', 'CANCELLED', 'SCHEDULED']) {
      expect(ServiceGroupValidator.canAddToGroup(
        { ...baseAppointment, status }, baseGroup,
      )).toEqual({ ok: false, reasonCode: 'INVALID_STATUS' });
    }
  });

  it('rejects appointments already in a group', () => {
    expect(ServiceGroupValidator.canAddToGroup(
      { ...baseAppointment, serviceGroupId: 'group-OTHER' }, baseGroup,
    )).toEqual({ ok: false, reasonCode: 'ALREADY_GROUPED' });
  });

  it('rejects when scheduledDate doesn\'t match the group day', () => {
    expect(ServiceGroupValidator.canAddToGroup(
      { ...baseAppointment, scheduledDate: new Date('2026-06-02T00:00:00Z') },
      baseGroup,
    )).toEqual({ ok: false, reasonCode: 'INVALID_DATE' });
  });

  it('accepts a same-day appointment with a different time slot (time is ignored)', () => {
    expect(ServiceGroupValidator.canAddToGroup(
      { ...baseAppointment, timeSlot: '13:00-16:00' },
      { ...baseGroup, timeWindow: '09:00-12:00' },
    )).toEqual({ ok: true });
  });

  it('isAddableStatus reflects the group lifecycle', () => {
    expect(ServiceGroupValidator.isAddableStatus('DRAFT')).toBe(true);
    expect(ServiceGroupValidator.isAddableStatus('PUBLISHED')).toBe(true);
    expect(ServiceGroupValidator.isAddableStatus('ACCEPTED')).toBe(false);
    expect(ServiceGroupValidator.isAddableStatus('CANCELLED')).toBe(false);
    expect(ServiceGroupValidator.isAddableStatus('REJECTED')).toBe(false);
  });
});
