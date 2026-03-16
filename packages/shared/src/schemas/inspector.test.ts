import { describe, it, expect } from 'vitest';
import {
  createInspectorSchema,
  updateInspectorSchema,
  listInspectorsQuerySchema,
  createAvailabilitySlotSchema,
  updateAvailabilitySlotSchema,
  listAvailabilitySlotsQuerySchema,
} from './inspector';

describe('createInspectorSchema', () => {
  const validInput = {
    name: 'John Smith',
    email: 'john@example.com',
    phone: '+61412345678',
    paymentSettings: { bankAccount: '123456' },
    regions: ['Sydney', 'Melbourne'],
    serviceTypes: ['550e8400-e29b-41d4-a716-446655440000'],
    clientEligibility: ['550e8400-e29b-41d4-a716-446655440001'],
  };

  it('should accept valid full input', () => {
    const result = createInspectorSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should accept valid minimal input with defaults', () => {
    const result = createInspectorSchema.safeParse({
      name: 'John Smith',
      email: 'john@example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.paymentSettings).toEqual({});
      expect(result.data.regions).toEqual([]);
      expect(result.data.serviceTypes).toEqual([]);
      expect(result.data.clientEligibility).toEqual([]);
    }
  });

  it('should reject invalid email', () => {
    const result = createInspectorSchema.safeParse({
      name: 'John Smith',
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('should apply defaults for arrays', () => {
    const result = createInspectorSchema.safeParse({
      name: 'John Smith',
      email: 'john@example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.regions).toEqual([]);
      expect(result.data.serviceTypes).toEqual([]);
      expect(result.data.clientEligibility).toEqual([]);
    }
  });
});

describe('updateInspectorSchema', () => {
  it('should accept partial valid input', () => {
    const result = updateInspectorSchema.safeParse({ name: 'Updated Name' });
    expect(result.success).toBe(true);
  });

  it('should accept empty object', () => {
    const result = updateInspectorSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept nullable phone', () => {
    const result = updateInspectorSchema.safeParse({ phone: null });
    expect(result.success).toBe(true);
  });
});

describe('listInspectorsQuerySchema', () => {
  it('should accept valid filters', () => {
    const result = listInspectorsQuerySchema.safeParse({
      status: 'ACTIVE',
      search: 'john',
      region: 'Sydney',
      serviceTypeId: '550e8400-e29b-41d4-a716-446655440000',
      tenantId: '550e8400-e29b-41d4-a716-446655440001',
      page: 1,
      pageSize: 10,
    });
    expect(result.success).toBe(true);
  });

  it('should apply pagination defaults', () => {
    const result = listInspectorsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
      expect(result.data.sortOrder).toBe('desc');
    }
  });
});

describe('createAvailabilitySlotSchema', () => {
  const validInput = {
    date: '2026-04-15',
    startTime: '09:00',
    endTime: '17:00',
  };

  it('should accept valid input', () => {
    const result = createAvailabilitySlotSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should reject invalid time format', () => {
    const result = createAvailabilitySlotSchema.safeParse({
      ...validInput,
      startTime: '9:00',
    });
    expect(result.success).toBe(false);
  });

  it('should default capacity to 1', () => {
    const result = createAvailabilitySlotSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.capacity).toBe(1);
    }
  });

  it('should reject invalid date', () => {
    const result = createAvailabilitySlotSchema.safeParse({
      ...validInput,
      date: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateAvailabilitySlotSchema', () => {
  it('should accept partial valid input', () => {
    const result = updateAvailabilitySlotSchema.safeParse({
      startTime: '10:00',
      capacity: 3,
    });
    expect(result.success).toBe(true);
  });

  it('should accept empty object', () => {
    const result = updateAvailabilitySlotSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('listAvailabilitySlotsQuerySchema', () => {
  it('should accept valid filters', () => {
    const result = listAvailabilitySlotsQuerySchema.safeParse({
      dateFrom: '2026-04-01',
      dateTo: '2026-04-30',
      status: 'AVAILABLE',
      page: 1,
      pageSize: 10,
    });
    expect(result.success).toBe(true);
  });

  it('should apply pagination defaults', () => {
    const result = listAvailabilitySlotsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
      expect(result.data.sortOrder).toBe('desc');
    }
  });
});
