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
  inspectorAppStateSchema,
} from './inspector';
import { AU_STATES, inspectorBaseAddressSchema } from './address';
import { inspectorResponseSchema } from './responses';

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

/** Satisfies the canonical password policy shared with createUserSchema. */
const VALID_PASSWORD = 'Insp@2026x';

// F01-1: a base address is mandatory on create. Shared across the create tests
// so each one isolates the behaviour it actually asserts.
const VALID_BASE_ADDRESS = {
  street: '1 George St',
  suburb: 'Sydney',
  city: 'Sydney',
  state: 'NSW',
  postcode: '2000',
  country: 'AU',
} as const;

describe('createInspectorSchema', () => {
  const validInput = {
    name: 'John Smith',
    email: 'john@example.com',
    password: VALID_PASSWORD,
    phone: '+61412345678',
    paymentSettings: { bankName: 'ANZ', paymentMethod: 'BANK_TRANSFER' as const },
    regions: ['Sydney', 'Melbourne'],
    serviceTypes: [
      { serviceTypeId: '550e8400-e29b-41d4-a716-446655440000', certified: true },
    ],
    address: VALID_BASE_ADDRESS,
  };

  it('should accept valid full input', () => {
    const result = createInspectorSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should accept valid minimal input with defaults', () => {
    const result = createInspectorSchema.safeParse({
      name: 'John Smith',
      email: 'john@example.com',
      password: VALID_PASSWORD,
      address: VALID_BASE_ADDRESS,
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
      password: VALID_PASSWORD,
    });
    expect(result.success).toBe(false);
  });

  it('should apply defaults for arrays', () => {
    const result = createInspectorSchema.safeParse({
      name: 'John Smith',
      email: 'john@example.com',
      password: VALID_PASSWORD,
      address: VALID_BASE_ADDRESS,
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
      password: VALID_PASSWORD,
      serviceTypes: ['550e8400-e29b-41d4-a716-446655440000'],
    });
    expect(result.success).toBe(false);
  });

  it('should accept paymentSettings with passthrough fields', () => {
    const result = createInspectorSchema.safeParse({
      name: 'John Smith',
      email: 'john@example.com',
      password: VALID_PASSWORD,
      paymentSettings: {
        bankName: 'Test Bank',
        swiftCode: 'TESTAU2S',
      },
      address: VALID_BASE_ADDRESS,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data.paymentSettings as Record<string, unknown>)['swiftCode']).toBe('TESTAU2S');
    }
  });

  it('should require a password', () => {
    const result = createInspectorSchema.safeParse({
      name: 'John Smith',
      email: 'john@example.com',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'password')).toBe(true);
    }
  });

  it.each([
    ['too short', 'Ab1!'],
    ['no uppercase', 'insp@2026x'],
    ['no lowercase', 'INSP@2026X'],
    ['no digit', 'Inspector@x'],
    ['no special character', 'Inspector2026'],
  ])('should reject a password with %s', (_label, password) => {
    const result = createInspectorSchema.safeParse({
      name: 'John Smith',
      email: 'john@example.com',
      password,
    });
    expect(result.success).toBe(false);
  });

  // The inspector's email is their login identity: loginSchema lowercases the
  // input and findByEmail is an exact match, so an un-normalised email here
  // would leave the account permanently unreachable.
  it('should lowercase the email, matching createUserSchema', () => {
    const result = createInspectorSchema.safeParse({
      name: 'John Smith',
      email: 'John@Inspect.COM',
      password: VALID_PASSWORD,
      address: VALID_BASE_ADDRESS,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('john@inspect.com');
    }
  });

  // Zod runs .transform() after the whole validation chain, so the trailing
  // .trim() never sees a padded value — .email() rejects it first. Asserted so
  // nobody "fixes" the ordering expecting whitespace to be tolerated.
  it('should reject a whitespace-padded email rather than trimming it', () => {
    const result = createInspectorSchema.safeParse({
      name: 'John Smith',
      email: '  john@inspect.com  ',
      password: VALID_PASSWORD,
    });
    expect(result.success).toBe(false);
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

  it('should lowercase the email so it stays in sync with the login identity', () => {
    const result = updateInspectorSchema.safeParse({ email: 'Jane@Inspect.COM' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('jane@inspect.com');
    }
  });

  it('should strip a password — resets go through the dedicated endpoint', () => {
    const result = updateInspectorSchema.safeParse({ password: VALID_PASSWORD });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('password');
    }
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
      password: VALID_PASSWORD,
      phone: '0412 345 678',
      address: VALID_BASE_ADDRESS,
    });
    expect(result.phone).toBe('+61412345678');
  });

  it('createInspectorSchema rejects invalid phone', () => {
    expect(
      createInspectorSchema.safeParse({
        name: 'Insp',
        email: 'insp@example.com',
        password: VALID_PASSWORD,
        phone: '123',
      }).success,
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

// ─── F01-1: inspector base address, app-state heartbeat, list filter ─────────

describe('inspectorBaseAddressSchema (F01-1, derived AU address)', () => {
  const base = {
    street: '1 George St',
    suburb: 'Sydney',
    city: 'Sydney',
    state: 'NSW',
    postcode: '2000',
    country: 'AU',
  };

  it('accepts a valid AU address', () => {
    expect(inspectorBaseAddressSchema.safeParse(base).success).toBe(true);
  });

  it('exports the eight AU states', () => {
    expect(AU_STATES).toEqual(['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT']);
  });

  it('rejects whitespace-only required fields (trim + min(1))', () => {
    const result = inspectorBaseAddressSchema.safeParse({
      ...base,
      street: ' ',
      suburb: ' ',
      state: 'X',
      postcode: '0',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toEqual(expect.arrayContaining(['street', 'suburb', 'state', 'postcode']));
    }
  });

  it('trims and upper-cases the state and trims text fields', () => {
    const result = inspectorBaseAddressSchema.safeParse({
      ...base,
      state: ' nsw ',
      street: ' 1 George St ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.state).toBe('NSW');
      expect(result.data.street).toBe('1 George St');
    }
  });

  it('rejects a spelled-out state name with "Select a state"', () => {
    const result = inspectorBaseAddressSchema.safeParse({ ...base, state: 'New South Wales' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Select a state')).toBe(true);
    }
  });

  it.each(['200', '20000', '2O00'])('rejects postcode %s with the 4-digit message', (postcode) => {
    const result = inspectorBaseAddressSchema.safeParse({ ...base, postcode });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Postcode must be 4 digits')).toBe(true);
    }
  });

  it('rejects a non-AU country and defaults country to AU when absent', () => {
    expect(inspectorBaseAddressSchema.safeParse({ ...base, country: 'NZ' }).success).toBe(false);
    const { country: _c, ...noCountry } = base;
    const result = inspectorBaseAddressSchema.safeParse(noCountry);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.country).toBe('AU');
  });

  it('strips client-sent latitude/longitude without erroring', () => {
    const result = inspectorBaseAddressSchema.safeParse({ ...base, latitude: -33.8, longitude: 151.2 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('latitude');
      expect(result.data).not.toHaveProperty('longitude');
    }
  });
});

describe('createInspectorSchema base address (F01-1)', () => {
  it('requires a base address', () => {
    const result = createInspectorSchema.safeParse({
      name: 'John Smith',
      email: 'john@example.com',
      password: VALID_PASSWORD,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'address')).toBe(true);
    }
  });
});

describe('updateInspectorSchema base address (F01-1)', () => {
  it('rejects address:null (the base cannot be removed)', () => {
    expect(updateInspectorSchema.safeParse({ address: null }).success).toBe(false);
  });

  it('accepts an omitted address', () => {
    const result = updateInspectorSchema.safeParse({ name: 'X' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.address).toBeUndefined();
  });

  it('accepts a valid base address', () => {
    expect(updateInspectorSchema.safeParse({ address: VALID_BASE_ADDRESS }).success).toBe(true);
  });
});

describe('inspectorSelfUpdateSchema base address (F01-1)', () => {
  it('accepts a base address', () => {
    expect(inspectorSelfUpdateSchema.safeParse({ address: VALID_BASE_ADDRESS }).success).toBe(true);
  });

  it('rejects address:null', () => {
    expect(inspectorSelfUpdateSchema.safeParse({ address: null }).success).toBe(false);
  });
});

describe('inspectorAppStateSchema (F01-1 heartbeat)', () => {
  it('accepts a valid standalone/granted heartbeat', () => {
    const result = inspectorAppStateSchema.safeParse({
      displayMode: 'standalone',
      pushPermission: 'granted',
      appVersion: '0.1.0',
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ['bad displayMode', { displayMode: 'fullscreen', pushPermission: 'granted', appVersion: '0.1.0' }],
    ['empty appVersion', { displayMode: 'browser', pushPermission: 'default', appVersion: '' }],
    ['bad pushPermission', { displayMode: 'browser', pushPermission: 'maybe', appVersion: '0.1.0' }],
  ])('rejects %s', (_label, input) => {
    expect(inspectorAppStateSchema.safeParse(input).success).toBe(false);
  });

  it('strips unknown keys', () => {
    const result = inspectorAppStateSchema.safeParse({
      displayMode: 'browser',
      pushPermission: 'denied',
      appVersion: 'dev',
      extra: 'nope',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty('extra');
  });
});

describe('listInspectorsQuerySchema.missingBaseAddress (F01-1)', () => {
  it('coerces the string "true"/"false" to boolean', () => {
    const t = listInspectorsQuerySchema.safeParse({ missingBaseAddress: 'true' });
    const f = listInspectorsQuerySchema.safeParse({ missingBaseAddress: 'false' });
    expect(t.success && t.data.missingBaseAddress).toBe(true);
    expect(f.success && f.data.missingBaseAddress).toBe(false);
  });
});

describe('inspectorResponseSchema base/adoption fields (F01-1)', () => {
  const validBase = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'John',
    email: 'john@example.com',
    phone: null,
    status: 'ACTIVE',
    paymentSettingsJson: {},
    serviceTypesJson: [],
    createdAt: '2026-10-30T00:00:00.000Z',
    updatedAt: '2026-10-30T00:00:00.000Z',
  };

  it('tolerates a legacy address shape with null coordinates', () => {
    const result = inspectorResponseSchema.safeParse({
      ...validBase,
      address: { foo: 1 },
      baseLat: null,
      baseLng: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts the new base and adoption fields', () => {
    const result = inspectorResponseSchema.safeParse({
      ...validBase,
      baseLat: -33.8688197,
      baseLng: 151.2092955,
      baseGeocodedAt: '2026-10-30T00:00:00.000Z',
      baseGeocodeFailed: false,
      appInstalledAt: '2026-10-30T00:00:00.000Z',
      appLastSeenAt: '2026-10-30T00:00:00.000Z',
      pushEnabled: true,
      appVersion: '0.1.0',
    });
    expect(result.success).toBe(true);
  });
});
