import { describe, it, expect } from 'vitest';
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  statusTransitionSchema,
  listAppointmentsQuerySchema,
  forceManualConfirmationSchema,
  bulkCancelRequestSchema,
  bulkRescheduleRequestSchema,
  bulkStatusTransitionRequestSchema,
  bulkAssignInspectorRequestSchema,
  bulkActionResultItemSchema,
  bulkActionResponseSchema,
  bulkReopenForRescheduleRequestSchema,
} from './appointment';
import { AppointmentStatus, TenantConfirmationStatus } from '../enums/appointment';
import { RestrictionSource } from '../enums/appointment';
import { CancellationReasonCode, RejectionReasonCode } from '../enums/reason-codes';

const validContact = {
  tenantName: 'Jane Doe',
  primaryEmail: 'jane@example.com',
  primaryPhone: '+61400000000',
};

const validRestriction = {
  isHome: true,
  source: RestrictionSource.TENANT_PORTAL,
};

const validPropertyId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const validBranchId = 'b1b2c3d4-e5f6-7890-abcd-ef1234567890';
const validServiceTypeId = 'c1b2c3d4-e5f6-7890-abcd-ef1234567890';
const validUserId = 'd1b2c3d4-e5f6-7890-abcd-ef1234567890';
const validInspectorId = 'e1b2c3d4-e5f6-7890-abcd-ef1234567890';

const validInlineProperty = {
  propertyCode: 'PROP-001',
  type: 'RESIDENTIAL' as const,
  street: '123 Main St',
  suburb: 'Sydney',
  postcode: '2000',
  state: 'NSW',
};

describe('createAppointmentSchema', () => {
  it('should be valid with propertyId', () => {
    const result = createAppointmentSchema.safeParse({
      branchId: validBranchId,
      propertyId: validPropertyId,
      serviceTypeId: validServiceTypeId,
      scheduledDate: '2027-04-01',
      timeSlot: '09:00-10:00',
      contact: validContact,
    });
    expect(result.success).toBe(true);
  });

  it('should be valid with inline property', () => {
    const result = createAppointmentSchema.safeParse({
      branchId: validBranchId,
      property: validInlineProperty,
      serviceTypeId: validServiceTypeId,
      scheduledDate: '2027-04-01',
      timeSlot: '09:00-10:00',
      contact: validContact,
    });
    expect(result.success).toBe(true);
  });

  it('should be invalid when both propertyId and property are provided', () => {
    const result = createAppointmentSchema.safeParse({
      branchId: validBranchId,
      propertyId: validPropertyId,
      property: validInlineProperty,
      serviceTypeId: validServiceTypeId,
      scheduledDate: '2027-04-01',
      timeSlot: '09:00-10:00',
      contact: validContact,
    });
    expect(result.success).toBe(false);
  });

  it('should be invalid when neither propertyId nor property is provided', () => {
    const result = createAppointmentSchema.safeParse({
      branchId: validBranchId,
      serviceTypeId: validServiceTypeId,
      scheduledDate: '2027-04-01',
      timeSlot: '09:00-10:00',
      contact: validContact,
    });
    expect(result.success).toBe(false);
  });

  it('should be invalid with wrong timeSlot format', () => {
    const result = createAppointmentSchema.safeParse({
      branchId: validBranchId,
      propertyId: validPropertyId,
      serviceTypeId: validServiceTypeId,
      scheduledDate: '2027-04-01',
      timeSlot: '9am-10am',
      contact: validContact,
    });
    expect(result.success).toBe(false);
  });

  it('should be valid with all optional fields', () => {
    const result = createAppointmentSchema.safeParse({
      branchId: validBranchId,
      propertyId: validPropertyId,
      serviceTypeId: validServiceTypeId,
      scheduledDate: '2027-04-01',
      timeSlot: '09:00-10:00',
      contact: validContact,
      restriction: validRestriction,
      keyRequired: true,
      meetingLocation: 'Front gate',
      keyLocation: 'Lockbox at front door',
      notes: 'Please call before arriving',
      customFields: { clientRef: 'ABC123' },
    });
    expect(result.success).toBe(true);
  });

  it('should accept a past date (temporal validation moved to use case for TZ-awareness)', () => {
    // Schema only validates date format; past-date rejection is TZ-aware and done in the use case.
    const result = createAppointmentSchema.safeParse({
      branchId: validBranchId,
      propertyId: validPropertyId,
      serviceTypeId: validServiceTypeId,
      scheduledDate: '2020-01-01',
      timeSlot: '09:00-10:00',
      contact: validContact,
    });
    expect(result.success).toBe(true);
  });

  it('should accept today as scheduledDate', () => {
    const today = new Date().toISOString().split('T')[0];
    const result = createAppointmentSchema.safeParse({
      branchId: validBranchId,
      propertyId: validPropertyId,
      serviceTypeId: validServiceTypeId,
      scheduledDate: today,
      timeSlot: '09:00-10:00',
      contact: validContact,
    });
    expect(result.success).toBe(true);
  });

  it('should accept tomorrow as scheduledDate', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const result = createAppointmentSchema.safeParse({
      branchId: validBranchId,
      propertyId: validPropertyId,
      serviceTypeId: validServiceTypeId,
      scheduledDate: tomorrow,
      timeSlot: '09:00-10:00',
      contact: validContact,
    });
    expect(result.success).toBe(true);
  });

  it('should default keyRequired to false', () => {
    const result = createAppointmentSchema.safeParse({
      branchId: validBranchId,
      propertyId: validPropertyId,
      serviceTypeId: validServiceTypeId,
      scheduledDate: '2027-04-01',
      timeSlot: '09:00-10:00',
      contact: validContact,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keyRequired).toBe(false);
    }
  });

  it('should keep a non-empty observation as-is', () => {
    const result = createAppointmentSchema.safeParse({
      branchId: validBranchId,
      propertyId: validPropertyId,
      serviceTypeId: validServiceTypeId,
      scheduledDate: '2027-04-01',
      timeSlot: '09:00-10:00',
      contact: validContact,
      observation: 'Gate code 4321',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.observation).toBe('Gate code 4321');
    }
  });

  it('should normalize an empty/whitespace observation to undefined on create', () => {
    const result = createAppointmentSchema.safeParse({
      branchId: validBranchId,
      propertyId: validPropertyId,
      serviceTypeId: validServiceTypeId,
      scheduledDate: '2027-04-01',
      timeSlot: '09:00-10:00',
      contact: validContact,
      observation: '   ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.observation).toBeUndefined();
    }
  });
});

describe('updateAppointmentSchema', () => {
  it('should be valid with a partial update', () => {
    // Dynamic 30-days-ahead date so the fixture never drifts into the past
    // and fires the "Scheduled date cannot be in the past" refine.
    const future = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const result = updateAppointmentSchema.safeParse({
      scheduledDate: future,
      timeSlot: '10:00-11:00',
    });
    expect(result.success).toBe(true);
  });

  it('should allow empty update (all fields optional)', () => {
    const result = updateAppointmentSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should be invalid with wrong timeSlot format', () => {
    const result = updateAppointmentSchema.safeParse({
      timeSlot: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('should accept a past scheduledDate (temporal validation moved to use case for TZ-awareness)', () => {
    // Schema only validates date format; past-date rejection is TZ-aware and done in the use case.
    const result = updateAppointmentSchema.safeParse({
      scheduledDate: '2020-01-01',
    });
    expect(result.success).toBe(true);
  });

  it('should accept today as scheduledDate', () => {
    const today = new Date().toISOString().split('T')[0];
    const result = updateAppointmentSchema.safeParse({
      scheduledDate: today,
    });
    expect(result.success).toBe(true);
  });

  it('should accept tomorrow as scheduledDate', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const result = updateAppointmentSchema.safeParse({
      scheduledDate: tomorrow,
    });
    expect(result.success).toBe(true);
  });

  it('should accept update without scheduledDate (no past date check)', () => {
    const result = updateAppointmentSchema.safeParse({
      notes: 'just a note',
    });
    expect(result.success).toBe(true);
  });

  it('should allow nullable fields to be set to null', () => {
    const result = updateAppointmentSchema.safeParse({
      meetingLocation: null,
      keyLocation: null,
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it('should keep a non-empty observation as-is', () => {
    const result = updateAppointmentSchema.safeParse({ observation: 'Key under the mat' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.observation).toBe('Key under the mat');
    }
  });

  it('should normalize an empty/whitespace observation to null (explicit clear)', () => {
    const result = updateAppointmentSchema.safeParse({ observation: '   ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.observation).toBeNull();
    }
  });

  it('should keep an absent observation as undefined (no-op)', () => {
    const result = updateAppointmentSchema.safeParse({ notes: 'x' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.observation).toBeUndefined();
    }
  });

  it('should pass through an explicit null observation', () => {
    const result = updateAppointmentSchema.safeParse({ observation: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.observation).toBeNull();
    }
  });
});

describe('statusTransitionSchema', () => {
  it('should be valid with a target status', () => {
    const result = statusTransitionSchema.safeParse({
      targetStatus: AppointmentStatus.AWAITING_INSPECTOR,
    });
    expect(result.success).toBe(true);
  });

  it('should be valid with a reason', () => {
    const result = statusTransitionSchema.safeParse({
      targetStatus: AppointmentStatus.CANCELLED,
      reason: 'Client requested cancellation',
    });
    expect(result.success).toBe(true);
  });

  it('should be valid with doneCheckedByUserId', () => {
    const result = statusTransitionSchema.safeParse({
      targetStatus: AppointmentStatus.DONE,
      doneCheckedByUserId: validUserId,
    });
    expect(result.success).toBe(true);
  });

  it('should be valid with inspectorId', () => {
    const result = statusTransitionSchema.safeParse({
      targetStatus: AppointmentStatus.SCHEDULED,
      inspectorId: validInspectorId,
    });
    expect(result.success).toBe(true);
  });

  it('should be invalid with an unknown target status', () => {
    const result = statusTransitionSchema.safeParse({
      targetStatus: 'UNKNOWN_STATUS',
    });
    expect(result.success).toBe(false);
  });

  it('should accept a valid cancellation reason code', () => {
    const result = statusTransitionSchema.safeParse({
      targetStatus: AppointmentStatus.CANCELLED,
      reason: 'Client no longer needs inspection',
      cancellationReasonCode: CancellationReasonCode.CLIENT_REQUEST,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cancellationReasonCode).toBe('CLIENT_REQUEST');
    }
  });

  it('should reject an invalid cancellation reason code', () => {
    const result = statusTransitionSchema.safeParse({
      targetStatus: AppointmentStatus.CANCELLED,
      reason: 'Some reason',
      cancellationReasonCode: 'INVALID_CODE',
    });
    expect(result.success).toBe(false);
  });

  it('should accept all valid cancellation reason codes', () => {
    for (const code of Object.values(CancellationReasonCode)) {
      const result = statusTransitionSchema.safeParse({
        targetStatus: AppointmentStatus.CANCELLED,
        cancellationReasonCode: code,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should accept a valid rejection reason code', () => {
    const result = statusTransitionSchema.safeParse({
      targetStatus: AppointmentStatus.REJECTED,
      reason: 'Address does not exist',
      rejectionReasonCode: RejectionReasonCode.INVALID_ADDRESS,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rejectionReasonCode).toBe('INVALID_ADDRESS');
    }
  });

  it('should reject an invalid rejection reason code', () => {
    const result = statusTransitionSchema.safeParse({
      targetStatus: AppointmentStatus.REJECTED,
      reason: 'Some reason',
      rejectionReasonCode: 'MADE_UP_CODE',
    });
    expect(result.success).toBe(false);
  });

  it('should accept all valid rejection reason codes', () => {
    for (const code of Object.values(RejectionReasonCode)) {
      const result = statusTransitionSchema.safeParse({
        targetStatus: AppointmentStatus.REJECTED,
        rejectionReasonCode: code,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should accept transition without reason codes (optional)', () => {
    const result = statusTransitionSchema.safeParse({
      targetStatus: AppointmentStatus.CANCELLED,
      reason: 'Just cancelled',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cancellationReasonCode).toBeUndefined();
      expect(result.data.rejectionReasonCode).toBeUndefined();
    }
  });
});

describe('listAppointmentsQuerySchema', () => {
  it('should be valid with no filters', () => {
    const result = listAppointmentsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should be valid with all filters', () => {
    const result = listAppointmentsQuerySchema.safeParse({
      page: '1',
      pageSize: '20',
      sortBy: 'scheduledDate',
      sortOrder: 'asc',
      status: AppointmentStatus.SCHEDULED,
      serviceTypeId: validServiceTypeId,
      branchId: validBranchId,
      inspectorId: validInspectorId,
      tenantId: validUserId,
      search: 'Main St',
      fromDate: '2026-04-01',
      toDate: '2026-04-30',
      tenantConfirmationStatus: TenantConfirmationStatus.CONFIRMED,
    });
    expect(result.success).toBe(true);
  });

  it('should be invalid with an unknown status', () => {
    const result = listAppointmentsQuerySchema.safeParse({
      status: 'INVALID',
    });
    expect(result.success).toBe(false);
  });
});

describe('forceManualConfirmationSchema', () => {
  it('should be valid with CONFIRMED status and reason', () => {
    const result = forceManualConfirmationSchema.safeParse({
      tenantConfirmationStatus: 'CONFIRMED',
      reason: 'Operator confirmed via phone',
    });
    expect(result.success).toBe(true);
  });

  it('should be invalid with a non-CONFIRMED status', () => {
    const result = forceManualConfirmationSchema.safeParse({
      tenantConfirmationStatus: 'PENDING',
      reason: 'Some reason',
    });
    expect(result.success).toBe(false);
  });

  it('should be invalid when reason is missing', () => {
    const result = forceManualConfirmationSchema.safeParse({
      tenantConfirmationStatus: 'CONFIRMED',
    });
    expect(result.success).toBe(false);
  });

  it('should be invalid when reason is empty string', () => {
    const result = forceManualConfirmationSchema.safeParse({
      tenantConfirmationStatus: 'CONFIRMED',
      reason: '',
    });
    expect(result.success).toBe(false);
  });
});

const apptIdA = '11111111-1111-4111-8111-111111111111';
const apptIdB = '22222222-2222-4222-8222-222222222222';
const apptIdC = '33333333-3333-4333-8333-333333333333';

describe('bulkCancelRequestSchema', () => {
  it('accepts up to 100 ids with a reason', () => {
    const result = bulkCancelRequestSchema.safeParse({
      appointmentIds: [apptIdA, apptIdB],
      reason: 'Operator cancelled per agency request',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional actorTimezone', () => {
    const result = bulkCancelRequestSchema.safeParse({
      appointmentIds: [apptIdA],
      reason: 'cancel',
      actorTimezone: 'Australia/Sydney',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty appointmentIds', () => {
    const result = bulkCancelRequestSchema.safeParse({
      appointmentIds: [],
      reason: 'reason',
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 100 ids', () => {
    const ids = Array.from({ length: 101 }, (_, i) =>
      `${(i + 1).toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`,
    );
    const result = bulkCancelRequestSchema.safeParse({
      appointmentIds: ids,
      reason: 'too many',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing reason', () => {
    const result = bulkCancelRequestSchema.safeParse({
      appointmentIds: [apptIdA],
    });
    expect(result.success).toBe(false);
  });

  it('rejects reason shorter than 3 chars', () => {
    const result = bulkCancelRequestSchema.safeParse({
      appointmentIds: [apptIdA],
      reason: 'no',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-uuid ids', () => {
    const result = bulkCancelRequestSchema.safeParse({
      appointmentIds: ['not-a-uuid'],
      reason: 'valid reason',
    });
    expect(result.success).toBe(false);
  });
});

describe('bulkRescheduleRequestSchema', () => {
  it('accepts a date-only newDate', () => {
    const result = bulkRescheduleRequestSchema.safeParse({
      appointmentIds: [apptIdA, apptIdB],
      newDate: '2027-06-01',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an ISO datetime newDate', () => {
    const result = bulkRescheduleRequestSchema.safeParse({
      appointmentIds: [apptIdA],
      newDate: '2027-06-01T09:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts newTimeSlot when in HH:mm-HH:mm format', () => {
    const result = bulkRescheduleRequestSchema.safeParse({
      appointmentIds: [apptIdA],
      newDate: '2027-06-01',
      newTimeSlot: '09:00-10:00',
    });
    expect(result.success).toBe(true);
  });

  it('rejects malformed newTimeSlot', () => {
    const result = bulkRescheduleRequestSchema.safeParse({
      appointmentIds: [apptIdA],
      newDate: '2027-06-01',
      newTimeSlot: '9-10',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when newDate is missing', () => {
    const result = bulkRescheduleRequestSchema.safeParse({
      appointmentIds: [apptIdA],
    });
    expect(result.success).toBe(false);
  });
});

describe('bulkStatusTransitionRequestSchema', () => {
  it('accepts targetStatus without reason (state machine decides)', () => {
    const result = bulkStatusTransitionRequestSchema.safeParse({
      appointmentIds: [apptIdA],
      targetStatus: AppointmentStatus.AWAITING_INSPECTOR,
    });
    expect(result.success).toBe(true);
  });

  it('accepts targetStatus with reason', () => {
    const result = bulkStatusTransitionRequestSchema.safeParse({
      appointmentIds: [apptIdA, apptIdB],
      targetStatus: AppointmentStatus.REJECTED,
      reason: 'Invalid property',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown status string', () => {
    const result = bulkStatusTransitionRequestSchema.safeParse({
      appointmentIds: [apptIdA],
      targetStatus: 'FROZEN',
    });
    expect(result.success).toBe(false);
  });
});

describe('bulkAssignInspectorRequestSchema', () => {
  it('accepts inspector id with appointment ids', () => {
    const result = bulkAssignInspectorRequestSchema.safeParse({
      appointmentIds: [apptIdA, apptIdB, apptIdC],
      inspectorId: validInspectorId,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-uuid inspectorId', () => {
    const result = bulkAssignInspectorRequestSchema.safeParse({
      appointmentIds: [apptIdA],
      inspectorId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});

describe('bulkActionResultItemSchema', () => {
  it('accepts an OK item without error', () => {
    const result = bulkActionResultItemSchema.safeParse({
      appointmentId: apptIdA,
      status: 'OK',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an INVALID_TRANSITION item with error', () => {
    const result = bulkActionResultItemSchema.safeParse({
      appointmentId: apptIdA,
      status: 'INVALID_TRANSITION',
      error: { code: 'APPOINTMENT_INVALID_TRANSITION', message: 'DRAFT → DONE not allowed' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown status', () => {
    const result = bulkActionResultItemSchema.safeParse({
      appointmentId: apptIdA,
      status: 'WHATEVER',
    });
    expect(result.success).toBe(false);
  });
});

describe('bulkActionResponseSchema', () => {
  it('accepts an empty results array', () => {
    const result = bulkActionResponseSchema.safeParse({ results: [] });
    expect(result.success).toBe(true);
  });

  it('accepts a mixed result envelope', () => {
    const result = bulkActionResponseSchema.safeParse({
      results: [
        { appointmentId: apptIdA, status: 'OK' },
        { appointmentId: apptIdB, status: 'IDEMPOTENT_REPLAY' },
        {
          appointmentId: apptIdC,
          status: 'FORBIDDEN',
          error: { code: 'FORBIDDEN', message: 'CL_USER lacks cancel_appointments flag' },
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('bulkReopenForRescheduleRequestSchema (026 §FR-540)', () => {
  it('accepts a valid request with all required fields', () => {
    expect(bulkReopenForRescheduleRequestSchema.safeParse({
      appointmentIds: [apptIdA, apptIdB],
      newDate: '2027-06-01',
      newTimeSlot: '09:00-10:00',
    }).success).toBe(true);
  });

  it('accepts an ISO datetime newDate', () => {
    expect(bulkReopenForRescheduleRequestSchema.safeParse({
      appointmentIds: [apptIdA],
      newDate: '2027-06-01T09:00:00.000Z',
      newTimeSlot: '09:00-10:00',
    }).success).toBe(true);
  });

  it('accepts optional reason and actorTimezone', () => {
    expect(bulkReopenForRescheduleRequestSchema.safeParse({
      appointmentIds: [apptIdA],
      newDate: '2027-06-01',
      newTimeSlot: '09:00-10:00',
      reason: 'Tenant requested change',
      actorTimezone: 'Australia/Sydney',
    }).success).toBe(true);
  });

  it('rejects when newTimeSlot is missing (dropdown is mandatory, NOT numeric input)', () => {
    expect(bulkReopenForRescheduleRequestSchema.safeParse({
      appointmentIds: [apptIdA],
      newDate: '2027-06-01',
    }).success).toBe(false);
  });

  it('rejects empty newTimeSlot', () => {
    expect(bulkReopenForRescheduleRequestSchema.safeParse({
      appointmentIds: [apptIdA],
      newDate: '2027-06-01',
      newTimeSlot: '',
    }).success).toBe(false);
  });

  it('caps appointmentIds at 30 (same-group capacity invariant)', () => {
    const ids = Array.from({ length: 31 }, (_, i) =>
      `${(i + 1).toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`,
    );
    expect(bulkReopenForRescheduleRequestSchema.safeParse({
      appointmentIds: ids,
      newDate: '2027-06-01',
      newTimeSlot: '09:00-10:00',
    }).success).toBe(false);
  });

  it('rejects too-short reason', () => {
    expect(bulkReopenForRescheduleRequestSchema.safeParse({
      appointmentIds: [apptIdA],
      newDate: '2027-06-01',
      newTimeSlot: '09:00-10:00',
      reason: 'no',
    }).success).toBe(false);
  });
});
