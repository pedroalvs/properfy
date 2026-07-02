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
  normalizeCustomFields,
} from './appointment';
import { AppointmentStatus, RentalTenantConfirmationStatus } from '../enums/appointment';
import { RestrictionSource } from '../enums/appointment';
import { CancellationReasonCode, RejectionReasonCode } from '../enums/reason-codes';

const validContact = {
  rentalTenantName: 'Jane Doe',
  primaryEmail: 'jane@example.com',
  primaryPhone: '+61400000000',
};

const validRestriction = {
  isHome: true,
  source: RestrictionSource.RENTAL_TENANT_PORTAL,
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
      timeSlotStart: '09:00',
      timeSlotEnd: '10:00',
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
      timeSlotStart: '09:00',
      timeSlotEnd: '10:00',
      contact: validContact,
    });
    expect(result.success).toBe(true);
  });

  it('strips an extraneous skipTimeInPastCheck field — the engine-only past-date bypass is unreachable via the public schema', () => {
    const result = createAppointmentSchema.safeParse({
      branchId: validBranchId,
      propertyId: validPropertyId,
      serviceTypeId: validServiceTypeId,
      scheduledDate: '2027-04-01',
      timeSlotStart: '09:00',
      timeSlotEnd: '10:00',
      contact: validContact,
      skipTimeInPastCheck: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('skipTimeInPastCheck');
    }
  });

  it('should be invalid when both propertyId and property are provided', () => {
    const result = createAppointmentSchema.safeParse({
      branchId: validBranchId,
      propertyId: validPropertyId,
      property: validInlineProperty,
      serviceTypeId: validServiceTypeId,
      scheduledDate: '2027-04-01',
      timeSlotStart: '09:00',
      timeSlotEnd: '10:00',
      contact: validContact,
    });
    expect(result.success).toBe(false);
  });

  it('should be invalid when neither propertyId nor property is provided', () => {
    const result = createAppointmentSchema.safeParse({
      branchId: validBranchId,
      serviceTypeId: validServiceTypeId,
      scheduledDate: '2027-04-01',
      timeSlotStart: '09:00',
      timeSlotEnd: '10:00',
      contact: validContact,
    });
    expect(result.success).toBe(false);
  });

  it('should be invalid with wrong time format', () => {
    const result = createAppointmentSchema.safeParse({
      branchId: validBranchId,
      propertyId: validPropertyId,
      serviceTypeId: validServiceTypeId,
      scheduledDate: '2027-04-01',
      timeSlotStart: '9am',
      timeSlotEnd: '10am',
      contact: validContact,
    });
    expect(result.success).toBe(false);
  });

  it('should be invalid when end time is not after start time', () => {
    const result = createAppointmentSchema.safeParse({
      branchId: validBranchId,
      propertyId: validPropertyId,
      serviceTypeId: validServiceTypeId,
      scheduledDate: '2027-04-01',
      timeSlotStart: '10:00',
      timeSlotEnd: '09:00',
      contact: validContact,
    });
    expect(result.success).toBe(false);
  });

  it.each(['24:00', '12:60', '99:99', '9:00'])(
    'should reject an impossible clock value %s',
    (badTime) => {
      const result = createAppointmentSchema.safeParse({
        branchId: validBranchId,
        propertyId: validPropertyId,
        serviceTypeId: validServiceTypeId,
        scheduledDate: '2027-04-01',
        timeSlotStart: badTime,
        timeSlotEnd: '23:00',
        contact: validContact,
      });
      expect(result.success).toBe(false);
    },
  );

  it('should be valid with all optional fields', () => {
    const result = createAppointmentSchema.safeParse({
      branchId: validBranchId,
      propertyId: validPropertyId,
      serviceTypeId: validServiceTypeId,
      scheduledDate: '2027-04-01',
      timeSlotStart: '09:00',
      timeSlotEnd: '10:00',
      contact: validContact,
      restriction: validRestriction,
      keyRequired: true,
      meetingLocation: 'Front gate',
      keyLocation: 'Lockbox at front door',
      notes: 'Please call before arriving',
      customFields: [{ label: 'Client Ref', value: 'ABC123' }],
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
      timeSlotStart: '09:00',
      timeSlotEnd: '10:00',
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
      timeSlotStart: '09:00',
      timeSlotEnd: '10:00',
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
      timeSlotStart: '09:00',
      timeSlotEnd: '10:00',
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
      timeSlotStart: '09:00',
      timeSlotEnd: '10:00',
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
      timeSlotStart: '09:00',
      timeSlotEnd: '10:00',
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
      timeSlotStart: '09:00',
      timeSlotEnd: '10:00',
      contact: validContact,
      observation: '   ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.observation).toBeUndefined();
    }
  });
});

describe('appointment customFields (repeatable label/value, max 4)', () => {
  const base = {
    branchId: validBranchId,
    propertyId: validPropertyId,
    serviceTypeId: validServiceTypeId,
    scheduledDate: '2027-04-01',
    timeSlotStart: '09:00',
    timeSlotEnd: '10:00',
    contact: validContact,
  };

  it('accepts up to 4 label/value pairs', () => {
    const result = createAppointmentSchema.safeParse({
      ...base,
      customFields: [
        { label: 'Gate code', value: '1234' },
        { label: 'Parking', value: 'Level 2' },
        { label: 'Alarm', value: 'Off' },
        { label: 'Pet', value: 'Dog in yard' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects more than 4 fields', () => {
    const result = createAppointmentSchema.safeParse({
      ...base,
      customFields: Array.from({ length: 5 }, (_, i) => ({ label: `L${i}`, value: `V${i}` })),
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty label', () => {
    const result = createAppointmentSchema.safeParse({
      ...base,
      customFields: [{ label: '', value: 'x' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty value', () => {
    const result = createAppointmentSchema.safeParse({
      ...base,
      customFields: [{ label: 'x', value: '' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only value (trimmed to empty)', () => {
    const result = createAppointmentSchema.safeParse({
      ...base,
      customFields: [{ label: 'x', value: '   ' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a 50-char label but rejects 51', () => {
    const ok = createAppointmentSchema.safeParse({
      ...base,
      customFields: [{ label: 'a'.repeat(50), value: 'x' }],
    });
    expect(ok.success).toBe(true);
    const tooLong = createAppointmentSchema.safeParse({
      ...base,
      customFields: [{ label: 'a'.repeat(51), value: 'x' }],
    });
    expect(tooLong.success).toBe(false);
  });

  it('accepts a 500-char value but rejects 501', () => {
    const ok = createAppointmentSchema.safeParse({
      ...base,
      customFields: [{ label: 'x', value: 'a'.repeat(500) }],
    });
    expect(ok.success).toBe(true);
    const tooLong = createAppointmentSchema.safeParse({
      ...base,
      customFields: [{ label: 'x', value: 'a'.repeat(501) }],
    });
    expect(tooLong.success).toBe(false);
  });

  it('trims label and value', () => {
    const result = createAppointmentSchema.safeParse({
      ...base,
      customFields: [{ label: '  Gate  ', value: '  1234  ' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customFields).toEqual([{ label: 'Gate', value: '1234' }]);
    }
  });

  it('allows duplicate labels (it is a list, not a keyed map)', () => {
    const result = createAppointmentSchema.safeParse({
      ...base,
      customFields: [
        { label: 'Note', value: 'A' },
        { label: 'Note', value: 'B' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('update: accepts null to clear all custom fields', () => {
    const result = updateAppointmentSchema.safeParse({ customFields: null });
    expect(result.success).toBe(true);
  });

  it('update: rejects more than 4 fields', () => {
    const result = updateAppointmentSchema.safeParse({
      customFields: Array.from({ length: 5 }, (_, i) => ({ label: `L${i}`, value: `V${i}` })),
    });
    expect(result.success).toBe(false);
  });
});

describe('normalizeCustomFields', () => {
  it('returns [] for non-array input (null, object, string)', () => {
    expect(normalizeCustomFields(null)).toEqual([]);
    expect(normalizeCustomFields({ realtyDescription: 'legacy' })).toEqual([]);
    expect(normalizeCustomFields('nope')).toEqual([]);
  });

  it('keeps valid rows and trims them', () => {
    expect(normalizeCustomFields([{ label: '  Gate  ', value: '  1234  ' }])).toEqual([
      { label: 'Gate', value: '1234' },
    ]);
  });

  it('drops malformed rows and caps the result at 4', () => {
    const input = [
      { label: 'A', value: '1' },
      { label: '', value: 'x' }, // blank label -> dropped
      { label: 'B' }, // missing value -> dropped
      { label: 'C', value: '3' },
      { label: 'D', value: '4' },
      { label: 'E', value: '5' },
      { label: 'F', value: '6' },
    ];
    expect(normalizeCustomFields(input)).toEqual([
      { label: 'A', value: '1' },
      { label: 'C', value: '3' },
      { label: 'D', value: '4' },
      { label: 'E', value: '5' },
    ]);
  });
});

describe('updateAppointmentSchema', () => {
  it('should be valid with a partial update', () => {
    // Dynamic 30-days-ahead date so the fixture never drifts into the past
    // and fires the "Scheduled date cannot be in the past" refine.
    const future = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const result = updateAppointmentSchema.safeParse({
      scheduledDate: future,
      timeSlotStart: '10:00',
      timeSlotEnd: '11:00',
    });
    expect(result.success).toBe(true);
  });

  it('should allow empty update (all fields optional)', () => {
    const result = updateAppointmentSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should be invalid with wrong time format', () => {
    const result = updateAppointmentSchema.safeParse({
      timeSlotStart: 'invalid',
      timeSlotEnd: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('should be invalid when only one side of the time window is provided', () => {
    const result = updateAppointmentSchema.safeParse({
      timeSlotStart: '09:00',
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

  it('should accept a valid timeFrom/timeTo range', () => {
    const result = listAppointmentsQuerySchema.safeParse({ timeFrom: '09:00', timeTo: '17:00' });
    expect(result.success).toBe(true);
  });

  it('should reject an inverted timeFrom/timeTo range', () => {
    const result = listAppointmentsQuerySchema.safeParse({ timeFrom: '17:00', timeTo: '09:00' });
    expect(result.success).toBe(false);
  });

  it('should reject a malformed time in the range filter', () => {
    const result = listAppointmentsQuerySchema.safeParse({ timeFrom: '24:00' });
    expect(result.success).toBe(false);
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
      rentalTenantConfirmationStatus: RentalTenantConfirmationStatus.CONFIRMED,
    });
    expect(result.success).toBe(true);
  });

  it('should be invalid with an unknown status', () => {
    const result = listAppointmentsQuerySchema.safeParse({
      status: 'INVALID',
    });
    expect(result.success).toBe(false);
  });

  it('should accept a valid serviceGroupId (group-membership filter)', () => {
    const result = listAppointmentsQuerySchema.safeParse({
      serviceGroupId: validServiceTypeId,
    });
    expect(result.success).toBe(true);
  });

  it('should reject a non-uuid serviceGroupId', () => {
    const result = listAppointmentsQuerySchema.safeParse({
      serviceGroupId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('should reject serviceGroupId combined with ungroupedOnly (mutually exclusive)', () => {
    const result = listAppointmentsQuerySchema.safeParse({
      serviceGroupId: validServiceTypeId,
      ungroupedOnly: 'true',
    });
    expect(result.success).toBe(false);
  });

  it('should accept ungroupedOnly alone', () => {
    const result = listAppointmentsQuerySchema.safeParse({ ungroupedOnly: 'true' });
    expect(result.success).toBe(true);
  });
});

describe('forceManualConfirmationSchema', () => {
  it('should be valid with CONFIRMED status and reason', () => {
    const result = forceManualConfirmationSchema.safeParse({
      rentalTenantConfirmationStatus: 'CONFIRMED',
      reason: 'Operator confirmed via phone',
    });
    expect(result.success).toBe(true);
  });

  it('should be invalid with a non-CONFIRMED status', () => {
    const result = forceManualConfirmationSchema.safeParse({
      rentalTenantConfirmationStatus: 'PENDING',
      reason: 'Some reason',
    });
    expect(result.success).toBe(false);
  });

  it('should be invalid when reason is missing', () => {
    const result = forceManualConfirmationSchema.safeParse({
      rentalTenantConfirmationStatus: 'CONFIRMED',
    });
    expect(result.success).toBe(false);
  });

  it('should be invalid when reason is empty string', () => {
    const result = forceManualConfirmationSchema.safeParse({
      rentalTenantConfirmationStatus: 'CONFIRMED',
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

  it('accepts a new time window in HH:mm format', () => {
    const result = bulkRescheduleRequestSchema.safeParse({
      appointmentIds: [apptIdA],
      newDate: '2027-06-01',
      newTimeSlotStart: '09:00',
      newTimeSlotEnd: '10:00',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed new time window', () => {
    const result = bulkRescheduleRequestSchema.safeParse({
      appointmentIds: [apptIdA],
      newDate: '2027-06-01',
      newTimeSlotStart: '9',
      newTimeSlotEnd: '10',
    });
    expect(result.success).toBe(false);
  });

  it('rejects only one side of the new time window', () => {
    const result = bulkRescheduleRequestSchema.safeParse({
      appointmentIds: [apptIdA],
      newDate: '2027-06-01',
      newTimeSlotStart: '09:00',
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
      newTimeSlotStart: '09:00',
      newTimeSlotEnd: '10:00',
    }).success).toBe(true);
  });

  it('accepts an ISO datetime newDate', () => {
    expect(bulkReopenForRescheduleRequestSchema.safeParse({
      appointmentIds: [apptIdA],
      newDate: '2027-06-01T09:00:00.000Z',
      newTimeSlotStart: '09:00',
      newTimeSlotEnd: '10:00',
    }).success).toBe(true);
  });

  it('accepts optional reason and actorTimezone', () => {
    expect(bulkReopenForRescheduleRequestSchema.safeParse({
      appointmentIds: [apptIdA],
      newDate: '2027-06-01',
      newTimeSlotStart: '09:00',
      newTimeSlotEnd: '10:00',
      reason: 'Tenant requested change',
      actorTimezone: 'Australia/Sydney',
    }).success).toBe(true);
  });

  it('rejects when the new time window is missing (start/end are mandatory)', () => {
    expect(bulkReopenForRescheduleRequestSchema.safeParse({
      appointmentIds: [apptIdA],
      newDate: '2027-06-01',
    }).success).toBe(false);
  });

  it('rejects an empty new time window', () => {
    expect(bulkReopenForRescheduleRequestSchema.safeParse({
      appointmentIds: [apptIdA],
      newDate: '2027-06-01',
      newTimeSlotStart: '',
      newTimeSlotEnd: '',
    }).success).toBe(false);
  });

  it('caps appointmentIds at 30 (same-group capacity invariant)', () => {
    const ids = Array.from({ length: 31 }, (_, i) =>
      `${(i + 1).toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`,
    );
    expect(bulkReopenForRescheduleRequestSchema.safeParse({
      appointmentIds: ids,
      newDate: '2027-06-01',
      newTimeSlotStart: '09:00',
      newTimeSlotEnd: '10:00',
    }).success).toBe(false);
  });

  it('rejects too-short reason', () => {
    expect(bulkReopenForRescheduleRequestSchema.safeParse({
      appointmentIds: [apptIdA],
      newDate: '2027-06-01',
      newTimeSlotStart: '09:00',
      newTimeSlotEnd: '10:00',
      reason: 'no',
    }).success).toBe(false);
  });
});
