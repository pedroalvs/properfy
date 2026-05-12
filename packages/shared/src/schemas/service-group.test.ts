import { describe, it, expect } from 'vitest';
import {
  createServiceGroupSchema,
  publishServiceGroupSchema,
  assignInspectorSchema,
  cancelServiceGroupSchema,
  acceptOfferSchema,
  listServiceGroupsQuerySchema,
  listMarketplaceOffersQuerySchema,
  addAppointmentsToGroupRequestSchema,
  eligibilityCheckRequestSchema,
  eligibilityCheckResponseSchema,
} from './service-group';

const validUuid = '550e8400-e29b-41d4-a716-446655440000';

function generateUuids(count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
  );
}

describe('createServiceGroupSchema', () => {
  const validInput = {
    appointmentIds: generateUuids(5),
    serviceTypeId: validUuid,
    scheduledDate: '2026-04-15',
    timeWindow: '08:00-12:00',
    priorityMode: 'STANDARD' as const,
    serviceRegionId: validUuid,
  };

  it('should accept valid input', () => {
    const result = createServiceGroupSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should default priorityMode to STANDARD', () => {
    const { priorityMode: _priorityMode, ...rest } = validInput;
    const result = createServiceGroupSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priorityMode).toBe('STANDARD');
    }
  });

  it('should accept PRIORITY_24H as priorityMode', () => {
    const result = createServiceGroupSchema.safeParse({
      ...validInput,
      priorityMode: 'PRIORITY_24H',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty appointments array (min 1 required)', () => {
    const result = createServiceGroupSchema.safeParse({
      ...validInput,
      appointmentIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('should reject more than 30 appointments', () => {
    const result = createServiceGroupSchema.safeParse({
      ...validInput,
      appointmentIds: generateUuids(31),
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid UUID in appointmentIds', () => {
    const result = createServiceGroupSchema.safeParse({
      ...validInput,
      appointmentIds: ['not-a-uuid', ...generateUuids(4)],
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid date format', () => {
    const result = createServiceGroupSchema.safeParse({
      ...validInput,
      scheduledDate: '15/04/2026',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid time window format', () => {
    const result = createServiceGroupSchema.safeParse({
      ...validInput,
      timeWindow: '8am-12pm',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing serviceTypeId', () => {
    const { serviceTypeId: _serviceTypeId, ...rest } = validInput;
    const result = createServiceGroupSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing serviceRegionId', () => {
    const { serviceRegionId: _serviceRegionId, ...rest } = validInput;
    const result = createServiceGroupSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject invalid UUID for serviceRegionId', () => {
    const result = createServiceGroupSchema.safeParse({
      ...validInput,
      serviceRegionId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});

describe('publishServiceGroupSchema', () => {
  it('should accept empty object', () => {
    const result = publishServiceGroupSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('assignInspectorSchema', () => {
  it('should accept valid inspectorId', () => {
    const result = assignInspectorSchema.safeParse({ inspectorId: validUuid });
    expect(result.success).toBe(true);
  });

  it('should reject invalid UUID', () => {
    const result = assignInspectorSchema.safeParse({ inspectorId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('should reject missing inspectorId', () => {
    const result = assignInspectorSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('cancelServiceGroupSchema', () => {
  it('should accept valid reason', () => {
    const result = cancelServiceGroupSchema.safeParse({ reason: 'Client requested cancellation' });
    expect(result.success).toBe(true);
  });

  it('should reject empty reason', () => {
    const result = cancelServiceGroupSchema.safeParse({ reason: '' });
    expect(result.success).toBe(false);
  });

  it('should reject missing reason', () => {
    const result = cancelServiceGroupSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject reason exceeding 1000 characters', () => {
    const result = cancelServiceGroupSchema.safeParse({ reason: 'x'.repeat(1001) });
    expect(result.success).toBe(false);
  });
});

describe('acceptOfferSchema', () => {
  it('should accept empty object', () => {
    const result = acceptOfferSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('listServiceGroupsQuerySchema', () => {
  it('should apply pagination defaults', () => {
    const result = listServiceGroupsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  it('should accept all valid filters', () => {
    const result = listServiceGroupsQuerySchema.safeParse({
      tenantId: validUuid,
      status: 'PUBLISHED',
      serviceTypeId: validUuid,
      scheduledDateFrom: '2026-01-01',
      scheduledDateTo: '2026-12-31',
      priorityMode: 'PRIORITY_24H',
      page: 2,
      pageSize: 10,
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid status', () => {
    const result = listServiceGroupsQuerySchema.safeParse({ status: 'INVALID' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid date format in scheduledDateFrom', () => {
    const result = listServiceGroupsQuerySchema.safeParse({ scheduledDateFrom: '01-01-2026' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid UUID in tenantId', () => {
    const result = listServiceGroupsQuerySchema.safeParse({ tenantId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});

describe('listMarketplaceOffersQuerySchema', () => {
  it('should apply pagination defaults', () => {
    const result = listMarketplaceOffersQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
      expect(result.data.sortOrder).toBe('desc');
    }
  });
});

describe('addAppointmentsToGroupRequestSchema (026 §FR-503)', () => {
  it('accepts 1..30 uuids', () => {
    expect(addAppointmentsToGroupRequestSchema.safeParse({
      appointmentIds: generateUuids(1),
    }).success).toBe(true);
    expect(addAppointmentsToGroupRequestSchema.safeParse({
      appointmentIds: generateUuids(30),
    }).success).toBe(true);
  });

  it('rejects empty array', () => {
    expect(addAppointmentsToGroupRequestSchema.safeParse({
      appointmentIds: [],
    }).success).toBe(false);
  });

  it('rejects more than 30 ids (group capacity cap)', () => {
    expect(addAppointmentsToGroupRequestSchema.safeParse({
      appointmentIds: generateUuids(31),
    }).success).toBe(false);
  });

  it('rejects non-uuid ids', () => {
    expect(addAppointmentsToGroupRequestSchema.safeParse({
      appointmentIds: ['not-a-uuid'],
    }).success).toBe(false);
  });
});

describe('eligibilityCheckRequestSchema (026 §FR-503)', () => {
  it('shares the same shape as the add request', () => {
    expect(eligibilityCheckRequestSchema.safeParse({
      appointmentIds: generateUuids(5),
    }).success).toBe(true);
  });

  it('caps at 30 ids like the add request', () => {
    expect(eligibilityCheckRequestSchema.safeParse({
      appointmentIds: generateUuids(31),
    }).success).toBe(false);
  });
});

describe('eligibilityCheckResponseSchema (026 §FR-503)', () => {
  it('accepts a fully eligible response', () => {
    expect(eligibilityCheckResponseSchema.safeParse({
      eligibleAppointmentIds: generateUuids(3),
      ineligibleAppointmentIds: [],
      groupAccepts: true,
      groupReasons: [],
    }).success).toBe(true);
  });

  it('accepts a mixed response with reasons', () => {
    expect(eligibilityCheckResponseSchema.safeParse({
      eligibleAppointmentIds: generateUuids(2),
      ineligibleAppointmentIds: [{ id: validUuid, reasonCode: 'INVALID_TENANT' }],
      groupAccepts: false,
      groupReasons: ['GROUP_CAPACITY_EXCEEDED'],
    }).success).toBe(true);
  });

  it('rejects ineligible entries missing the reasonCode', () => {
    expect(eligibilityCheckResponseSchema.safeParse({
      eligibleAppointmentIds: [],
      ineligibleAppointmentIds: [{ id: validUuid }],
      groupAccepts: false,
      groupReasons: [],
    }).success).toBe(false);
  });
});
