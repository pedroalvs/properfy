import { describe, it, expect } from 'vitest';
import {
  paymentSettingsSchema,
  serviceTypesSchema,
  createInspectorSchema,
  updateInspectorSchema,
  listInspectorsQuerySchema,
  createAvailabilitySlotSchema,
  updateAvailabilitySlotSchema,
  listAvailabilitySlotsQuerySchema,
  inspectorSelfUpdateSchema,
} from './inspector';

describe('paymentSettingsSchema', () => {
  it('should accept valid full payment settings', () => {
    const result = paymentSettingsSchema.safeParse({
      bankName: 'Commonwealth Bank',
      accountNumber: '12345678',
      bsb: '062-000',
      abn: '51824753556',
      paymentMethod: 'BANK_TRANSFER',
    });
    expect(result.success).toBe(true);
  });

  it('should accept empty object', () => {
    const result = paymentSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept partial fields', () => {
    const result = paymentSettingsSchema.safeParse({
      bankName: 'ANZ',
      paymentMethod: 'BANK_TRANSFER',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid paymentMethod', () => {
    const result = paymentSettingsSchema.safeParse({
      paymentMethod: 'BITCOIN',
    });
    expect(result.success).toBe(false);
  });

  it('should passthrough unknown fields for forward compatibility', () => {
    const result = paymentSettingsSchema.safeParse({
      bankName: 'Test Bank',
      swiftCode: 'TESTAU2S',
      customField: 42,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bankName).toBe('Test Bank');
      expect((result.data as Record<string, unknown>)['swiftCode']).toBe('TESTAU2S');
      expect((result.data as Record<string, unknown>)['customField']).toBe(42);
    }
  });

  it('should reject bankName exceeding max length', () => {
    const result = paymentSettingsSchema.safeParse({
      bankName: 'A'.repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

describe('serviceTypesSchema', () => {
  it('should accept valid service type entries', () => {
    const result = serviceTypesSchema.safeParse([
      { serviceTypeId: '550e8400-e29b-41d4-a716-446655440000', certified: true },
      { serviceTypeId: '550e8400-e29b-41d4-a716-446655440001', certified: false },
    ]);
    expect(result.success).toBe(true);
  });

  it('should accept empty array', () => {
    const result = serviceTypesSchema.safeParse([]);
    expect(result.success).toBe(true);
  });

  it('should default certified to false', () => {
    const result = serviceTypesSchema.safeParse([
      { serviceTypeId: '550e8400-e29b-41d4-a716-446655440000' },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].certified).toBe(false);
    }
  });

  it('should reject invalid UUID for serviceTypeId', () => {
    const result = serviceTypesSchema.safeParse([
      { serviceTypeId: 'not-a-uuid', certified: true },
    ]);
    expect(result.success).toBe(false);
  });

  it('should reject non-boolean certified', () => {
    const result = serviceTypesSchema.safeParse([
      { serviceTypeId: '550e8400-e29b-41d4-a716-446655440000', certified: 'yes' },
    ]);
    expect(result.success).toBe(false);
  });

  it('should reject missing serviceTypeId', () => {
    const result = serviceTypesSchema.safeParse([
      { certified: true },
    ]);
    expect(result.success).toBe(false);
  });
});

describe('createInspectorSchema', () => {
  const validInput = {
    name: 'John Smith',
    email: 'john@example.com',
    phone: '+61412345678',
    paymentSettings: { bankName: 'ANZ', paymentMethod: 'BANK_TRANSFER' as const },
    regions: ['Sydney', 'Melbourne'],
    serviceTypes: [
      { serviceTypeId: '550e8400-e29b-41d4-a716-446655440000', certified: true },
    ],
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
    }
  });

  it('should reject serviceTypes with plain UUID strings', () => {
    const result = createInspectorSchema.safeParse({
      name: 'John Smith',
      email: 'john@example.com',
      serviceTypes: ['550e8400-e29b-41d4-a716-446655440000'],
    });
    expect(result.success).toBe(false);
  });

  it('should accept paymentSettings with passthrough fields', () => {
    const result = createInspectorSchema.safeParse({
      name: 'John Smith',
      email: 'john@example.com',
      paymentSettings: {
        bankName: 'Test Bank',
        swiftCode: 'TESTAU2S',
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data.paymentSettings as Record<string, unknown>)['swiftCode']).toBe('TESTAU2S');
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

  it('should accept typed serviceTypes update', () => {
    const result = updateInspectorSchema.safeParse({
      serviceTypes: [
        { serviceTypeId: '550e8400-e29b-41d4-a716-446655440000', certified: true },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('should accept typed paymentSettings update', () => {
    const result = updateInspectorSchema.safeParse({
      paymentSettings: {
        bankName: 'Westpac',
        bsb: '032-000',
        accountNumber: '987654',
        paymentMethod: 'BANK_TRANSFER',
      },
    });
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

describe('AU phone validation on inspector schemas', () => {
  it('createInspectorSchema normalizes local phone to E.164', () => {
    const result = createInspectorSchema.parse({
      name: 'Insp',
      email: 'insp@example.com',
      phone: '0412 345 678',
    });
    expect(result.phone).toBe('+61412345678');
  });

  it('createInspectorSchema rejects invalid phone', () => {
    expect(
      createInspectorSchema.safeParse({ name: 'Insp', email: 'insp@example.com', phone: '123' }).success,
    ).toBe(false);
  });

  it('updateInspectorSchema normalizes and still accepts null', () => {
    expect(updateInspectorSchema.parse({ phone: '0412345678' }).phone).toBe('+61412345678');
    expect(updateInspectorSchema.safeParse({ phone: null }).success).toBe(true);
    expect(updateInspectorSchema.safeParse({ phone: 'bogus' }).success).toBe(false);
  });

  it('inspectorSelfUpdateSchema requires AU number (rejects non-AU E.164)', () => {
    expect(inspectorSelfUpdateSchema.safeParse({ phone: '+15551234567' }).success).toBe(false);
    expect(inspectorSelfUpdateSchema.parse({ phone: '0412 345 678' }).phone).toBe('+61412345678');
    expect(inspectorSelfUpdateSchema.safeParse({ phone: null }).success).toBe(true);
  });
});
