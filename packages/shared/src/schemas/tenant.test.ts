import { describe, it, expect } from 'vitest';
import {
  createTenantSchema,
  updateTenantSchema,
  deactivateSchema,
  validateBillingSettings,
  createBranchSchema,
  updateBranchSchema,
  listTenantsQuerySchema,
  listBranchesQuerySchema,
  tenantSettingsSchema,
} from './tenant';
import { branchAddressSchema } from './address';

describe('createTenantSchema', () => {
  const validInput = {
    name: 'Acme Realty',
    legalName: 'Acme Realty Pty Ltd',
    appointmentCodePrefix: 'ACME',
  };

  it('should accept valid input with defaults', () => {
    const result = createTenantSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBe('Australia/Sydney');
      expect(result.data.currency).toBe('AUD');
    }
  });

  it('should require appointmentCodePrefix', () => {
    const { appointmentCodePrefix: _omit, ...noPrefix } = validInput;
    const result = createTenantSchema.safeParse(noPrefix);
    expect(result.success).toBe(false);
  });

  it('should normalize appointmentCodePrefix to uppercase', () => {
    const result = createTenantSchema.safeParse({ ...validInput, appointmentCodePrefix: 'ab1' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.appointmentCodePrefix).toBe('AB1');
    }
  });

  it('should reject appointmentCodePrefix shorter than 3 chars', () => {
    const result = createTenantSchema.safeParse({ ...validInput, appointmentCodePrefix: 'AB' });
    expect(result.success).toBe(false);
  });

  it('should reject appointmentCodePrefix longer than 4 chars', () => {
    const result = createTenantSchema.safeParse({ ...validInput, appointmentCodePrefix: 'ABCDE' });
    expect(result.success).toBe(false);
  });

  it('should reject appointmentCodePrefix with non-alphanumeric chars', () => {
    const result = createTenantSchema.safeParse({ ...validInput, appointmentCodePrefix: 'A-1' });
    expect(result.success).toBe(false);
  });

  it('should accept valid input with all fields', () => {
    const result = createTenantSchema.safeParse({
      ...validInput,
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
      settings: { billingPeriod: 'WEEKLY' },
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing name', () => {
    const result = createTenantSchema.safeParse({ legalName: 'Legal' });
    expect(result.success).toBe(false);
  });

  it('should reject missing legalName', () => {
    const result = createTenantSchema.safeParse({ name: 'Name' });
    expect(result.success).toBe(false);
  });

  it('should reject name exceeding 200 characters', () => {
    const result = createTenantSchema.safeParse({
      ...validInput,
      name: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

describe('updateTenantSchema', () => {
  it('should accept partial valid input', () => {
    const result = updateTenantSchema.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('should accept empty object', () => {
    const result = updateTenantSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept partial settings', () => {
    const result = updateTenantSchema.safeParse({
      settings: { billingPeriod: 'BIWEEKLY' },
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid currency length', () => {
    const result = updateTenantSchema.safeParse({ currency: 'US' });
    expect(result.success).toBe(false);
  });

  it('should accept and uppercase a valid appointmentCodePrefix', () => {
    const result = updateTenantSchema.safeParse({ appointmentCodePrefix: 'xy9' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.appointmentCodePrefix).toBe('XY9');
    }
  });

  it('should reject an invalid appointmentCodePrefix', () => {
    const result = updateTenantSchema.safeParse({ appointmentCodePrefix: 'toolong' });
    expect(result.success).toBe(false);
  });
});

describe('deactivateSchema', () => {
  it('should accept valid reason', () => {
    const result = deactivateSchema.safeParse({ reason: 'Client requested deactivation' });
    expect(result.success).toBe(true);
  });

  it('should reject empty reason', () => {
    const result = deactivateSchema.safeParse({ reason: '' });
    expect(result.success).toBe(false);
  });

  it('should reject reason exceeding 500 characters', () => {
    const result = deactivateSchema.safeParse({ reason: 'a'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('should reject missing reason', () => {
    const result = deactivateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('createBranchSchema', () => {
  const validAddress = {
    street: '123 Main St',
    suburb: 'CBD',
    city: 'Sydney',
    state: 'NSW',
    postcode: '2000',
  };

  it('should accept valid input', () => {
    const result = createBranchSchema.safeParse({ name: 'Downtown Branch' });
    expect(result.success).toBe(true);
  });

  it('should accept input with structured address', () => {
    const result = createBranchSchema.safeParse({
      name: 'Downtown Branch',
      address: validAddress,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.address?.country).toBe('AU');
    }
  });

  it('should reject freeform address object', () => {
    const result = createBranchSchema.safeParse({
      name: 'Downtown Branch',
      address: { foo: 'bar' },
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing name', () => {
    const result = createBranchSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject empty name', () => {
    const result = createBranchSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });
});

describe('updateBranchSchema', () => {
  const validAddress = {
    street: '456 Oak Ave',
    suburb: 'Surry Hills',
    city: 'Sydney',
    state: 'NSW',
    postcode: '2010',
  };

  it('should accept partial input', () => {
    const result = updateBranchSchema.safeParse({ name: 'Updated Branch' });
    expect(result.success).toBe(true);
  });

  it('should accept empty object', () => {
    const result = updateBranchSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept structured address', () => {
    const result = updateBranchSchema.safeParse({ address: validAddress });
    expect(result.success).toBe(true);
  });

  it('should reject address missing required fields', () => {
    const result = updateBranchSchema.safeParse({
      address: { street: '456 Oak Ave' },
    });
    expect(result.success).toBe(false);
  });
});

describe('branchAddressSchema', () => {
  const validFullAddress = {
    street: '123 Main St',
    number: '42A',
    complement: 'Suite 5',
    suburb: 'CBD',
    city: 'Sydney',
    state: 'NSW',
    postcode: '2000',
    country: 'AU',
    latitude: -33.8688,
    longitude: 151.2093,
  };

  it('should accept valid full address', () => {
    const result = branchAddressSchema.safeParse(validFullAddress);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validFullAddress);
    }
  });

  it('should pass with optional fields omitted', () => {
    const result = branchAddressSchema.safeParse({
      street: '10 George St',
      suburb: 'The Rocks',
      city: 'Sydney',
      state: 'NSW',
      postcode: '2000',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.country).toBe('AU');
      expect(result.data.number).toBeUndefined();
      expect(result.data.complement).toBeUndefined();
      expect(result.data.latitude).toBeUndefined();
      expect(result.data.longitude).toBeUndefined();
    }
  });

  it('should reject missing required field (street)', () => {
    const { street: _, ...noStreet } = validFullAddress;
    const result = branchAddressSchema.safeParse(noStreet);
    expect(result.success).toBe(false);
  });

  it('should reject missing required field (suburb)', () => {
    const { suburb: _, ...noSuburb } = validFullAddress;
    const result = branchAddressSchema.safeParse(noSuburb);
    expect(result.success).toBe(false);
  });

  it('should reject missing required field (city)', () => {
    const { city: _, ...noCity } = validFullAddress;
    const result = branchAddressSchema.safeParse(noCity);
    expect(result.success).toBe(false);
  });

  it('should reject invalid country code (3 chars)', () => {
    const result = branchAddressSchema.safeParse({
      ...validFullAddress,
      country: 'AUS',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid country code (1 char)', () => {
    const result = branchAddressSchema.safeParse({
      ...validFullAddress,
      country: 'A',
    });
    expect(result.success).toBe(false);
  });

  it('should reject latitude out of range (too low)', () => {
    const result = branchAddressSchema.safeParse({
      ...validFullAddress,
      latitude: -91,
    });
    expect(result.success).toBe(false);
  });

  it('should reject latitude out of range (too high)', () => {
    const result = branchAddressSchema.safeParse({
      ...validFullAddress,
      latitude: 91,
    });
    expect(result.success).toBe(false);
  });

  it('should reject longitude out of range (too low)', () => {
    const result = branchAddressSchema.safeParse({
      ...validFullAddress,
      longitude: -181,
    });
    expect(result.success).toBe(false);
  });

  it('should reject longitude out of range (too high)', () => {
    const result = branchAddressSchema.safeParse({
      ...validFullAddress,
      longitude: 181,
    });
    expect(result.success).toBe(false);
  });

  it('should reject street exceeding max length', () => {
    const result = branchAddressSchema.safeParse({
      ...validFullAddress,
      street: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('should accept boundary latitude and longitude values', () => {
    const result = branchAddressSchema.safeParse({
      ...validFullAddress,
      latitude: -90,
      longitude: 180,
    });
    expect(result.success).toBe(true);
  });
});

describe('listTenantsQuerySchema', () => {
  it('should accept valid filters', () => {
    const result = listTenantsQuerySchema.safeParse({
      status: 'ACTIVE',
      search: 'acme',
      page: 2,
      pageSize: 10,
    });
    expect(result.success).toBe(true);
  });

  it('should apply pagination defaults', () => {
    const result = listTenantsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  it('should reject invalid status', () => {
    const result = listTenantsQuerySchema.safeParse({ status: 'DELETED' });
    expect(result.success).toBe(false);
  });
});

describe('listBranchesQuerySchema', () => {
  it('should accept valid filters', () => {
    const result = listBranchesQuerySchema.safeParse({
      status: 'ACTIVE',
      search: 'downtown',
    });
    expect(result.success).toBe(true);
  });

  it('should apply pagination defaults', () => {
    const result = listBranchesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    }
  });

  it('should reject invalid status', () => {
    const result = listBranchesQuerySchema.safeParse({ status: 'PENDING' });
    expect(result.success).toBe(false);
  });
});

describe('tenantSettingsSchema', () => {
  it('should accept valid settings', () => {
    const result = tenantSettingsSchema.safeParse({
      billingPeriod: 'WEEKLY',
      notificationEmail: 'admin@acme.com',
      timezone: 'Australia/Sydney',
    });
    expect(result.success).toBe(true);
  });

  it('should apply billingPeriod default', () => {
    const result = tenantSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.billingPeriod).toBe('MONTHLY');
    }
  });

  it('should allow extra fields (passthrough mode)', () => {
    const result = tenantSettingsSchema.safeParse({
      billingPeriod: 'MONTHLY',
      unknownField: 'value',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid email', () => {
    const result = tenantSettingsSchema.safeParse({
      notificationEmail: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('should accept all new settings keys with valid values', () => {
    const result = tenantSettingsSchema.safeParse({
      billingPeriod: 'WEEKLY',
      billingDayOfWeek: 1,
      notificationFromName: 'Properfy',
      notificationFromEmail: 'noreply@properfy.com',
      smsFromName: 'Properfy',
      logoUrl: 'https://storage.example.com/logo.png',
      primaryColor: '#FF5733',
      allowClientCancellation: false,
      allowClientRescheduling: true,
      allowClientFinancialView: true,
      allowClientReportExport: false,
      allowClientUserManagement: true,
      priorityOfferHours: 48,
      inspectorOfferRadiusKm: 5,
      clUserPermissions: ['create_appointments', 'cancel_appointments'],
      emailTemplates: {
        initial: { subject: 'Inspection Notice', headerText: 'Hello' },
        reminder7d: { subject: '7 Day Reminder' },
      },
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid primaryColor', () => {
    const result = tenantSettingsSchema.safeParse({ primaryColor: 'red' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid clUserPermissions value', () => {
    const result = tenantSettingsSchema.safeParse({ clUserPermissions: ['invalid_permission'] });
    expect(result.success).toBe(false);
  });

  it('should reject billingDayOfWeek out of range', () => {
    const result = tenantSettingsSchema.safeParse({ billingDayOfWeek: 7 });
    expect(result.success).toBe(false);
  });

  it('should reject billingDayOfMonth out of range', () => {
    const result = tenantSettingsSchema.safeParse({ billingDayOfMonth: 29 });
    expect(result.success).toBe(false);
  });

  it('should reject non-alphanumeric smsFromName', () => {
    const result = tenantSettingsSchema.safeParse({ smsFromName: 'Hello World!' });
    expect(result.success).toBe(false);
  });

  it('should default feature flags correctly', () => {
    const result = tenantSettingsSchema.parse({});
    expect(result.allowClientCancellation).toBe(true);
    expect(result.allowClientRescheduling).toBe(true);
    expect(result.allowClientFinancialView).toBe(false);
    expect(result.allowClientReportExport).toBe(false);
    expect(result.allowClientUserManagement).toBe(false);
    expect(result.priorityOfferHours).toBe(24);
    expect(result.inspectorOfferRadiusKm).toBe(2);
    expect(result.clUserPermissions).toEqual([]);
  });

  it('should default inspectionWindowBeforeMinutes to 30', () => {
    const result = tenantSettingsSchema.parse({});
    expect(result.inspectionWindowBeforeMinutes).toBe(30);
  });

  it('should default inspectionWindowAfterMinutes to 30', () => {
    const result = tenantSettingsSchema.parse({});
    expect(result.inspectionWindowAfterMinutes).toBe(30);
  });

  it('should accept custom inspection window bounds', () => {
    const result = tenantSettingsSchema.safeParse({
      inspectionWindowBeforeMinutes: 60,
      inspectionWindowAfterMinutes: 15,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.inspectionWindowBeforeMinutes).toBe(60);
      expect(result.data.inspectionWindowAfterMinutes).toBe(15);
    }
  });

  it('should accept zero for inspection window bounds', () => {
    const result = tenantSettingsSchema.safeParse({
      inspectionWindowBeforeMinutes: 0,
      inspectionWindowAfterMinutes: 0,
    });
    expect(result.success).toBe(true);
  });

  it('should accept maximum (120) for inspection window bounds', () => {
    const result = tenantSettingsSchema.safeParse({
      inspectionWindowBeforeMinutes: 120,
      inspectionWindowAfterMinutes: 120,
    });
    expect(result.success).toBe(true);
  });

  it('should reject inspectionWindowBeforeMinutes exceeding 120', () => {
    const result = tenantSettingsSchema.safeParse({
      inspectionWindowBeforeMinutes: 121,
    });
    expect(result.success).toBe(false);
  });

  it('should reject inspectionWindowAfterMinutes exceeding 120', () => {
    const result = tenantSettingsSchema.safeParse({
      inspectionWindowAfterMinutes: 121,
    });
    expect(result.success).toBe(false);
  });

  it('should reject negative inspection window bounds', () => {
    const result = tenantSettingsSchema.safeParse({
      inspectionWindowBeforeMinutes: -1,
    });
    expect(result.success).toBe(false);
  });

  it('should reject non-integer inspection window bounds', () => {
    const result = tenantSettingsSchema.safeParse({
      inspectionWindowBeforeMinutes: 30.5,
    });
    expect(result.success).toBe(false);
  });

  it('should default maxConcurrentReports to 10', () => {
    const result = tenantSettingsSchema.parse({});
    expect(result.maxConcurrentReports).toBe(10);
  });

  it('should accept maxConcurrentReports within range 1-50', () => {
    const result = tenantSettingsSchema.safeParse({ maxConcurrentReports: 25 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxConcurrentReports).toBe(25);
    }
  });

  it('should reject maxConcurrentReports below 1', () => {
    const result = tenantSettingsSchema.safeParse({ maxConcurrentReports: 0 });
    expect(result.success).toBe(false);
  });

  it('should reject maxConcurrentReports above 50', () => {
    const result = tenantSettingsSchema.safeParse({ maxConcurrentReports: 51 });
    expect(result.success).toBe(false);
  });

  it('should reject non-integer maxConcurrentReports', () => {
    const result = tenantSettingsSchema.safeParse({ maxConcurrentReports: 10.5 });
    expect(result.success).toBe(false);
  });
});

describe('validateBillingSettings', () => {
  it('should pass when WEEKLY with billingDayOfWeek', () => {
    expect(validateBillingSettings({ billingPeriod: 'WEEKLY', billingDayOfWeek: 1 }).valid).toBe(true);
  });

  it('should fail when WEEKLY without billingDayOfWeek', () => {
    const result = validateBillingSettings({ billingPeriod: 'WEEKLY' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('billingDayOfWeek');
  });

  it('should fail when BIWEEKLY without billingDayOfWeek', () => {
    const result = validateBillingSettings({ billingPeriod: 'BIWEEKLY' });
    expect(result.valid).toBe(false);
  });

  it('should pass when MONTHLY with billingDayOfMonth', () => {
    expect(validateBillingSettings({ billingPeriod: 'MONTHLY', billingDayOfMonth: 15 }).valid).toBe(true);
  });

  it('should fail when MONTHLY without billingDayOfMonth', () => {
    const result = validateBillingSettings({ billingPeriod: 'MONTHLY' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('billingDayOfMonth');
  });

  it('should pass when no billingPeriod specified', () => {
    expect(validateBillingSettings({}).valid).toBe(true);
  });
});
