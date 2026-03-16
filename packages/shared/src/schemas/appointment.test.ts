import { describe, it, expect } from 'vitest';
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  statusTransitionSchema,
  listAppointmentsQuerySchema,
  forceManualConfirmationSchema,
} from './appointment';
import { AppointmentStatus, TenantConfirmationStatus } from '../enums/appointment';
import { RestrictionSource } from '../enums/appointment';

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
      scheduledDate: '2026-04-01',
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
      scheduledDate: '2026-04-01',
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
      scheduledDate: '2026-04-01',
      timeSlot: '09:00-10:00',
      contact: validContact,
    });
    expect(result.success).toBe(false);
  });

  it('should be invalid when neither propertyId nor property is provided', () => {
    const result = createAppointmentSchema.safeParse({
      branchId: validBranchId,
      serviceTypeId: validServiceTypeId,
      scheduledDate: '2026-04-01',
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
      scheduledDate: '2026-04-01',
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
      scheduledDate: '2026-04-01',
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

  it('should default keyRequired to false', () => {
    const result = createAppointmentSchema.safeParse({
      branchId: validBranchId,
      propertyId: validPropertyId,
      serviceTypeId: validServiceTypeId,
      scheduledDate: '2026-04-01',
      timeSlot: '09:00-10:00',
      contact: validContact,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keyRequired).toBe(false);
    }
  });
});

describe('updateAppointmentSchema', () => {
  it('should be valid with a partial update', () => {
    const result = updateAppointmentSchema.safeParse({
      scheduledDate: '2026-04-15',
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

  it('should allow nullable fields to be set to null', () => {
    const result = updateAppointmentSchema.safeParse({
      meetingLocation: null,
      keyLocation: null,
      notes: null,
    });
    expect(result.success).toBe(true);
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
