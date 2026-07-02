import { describe, it, expect } from 'vitest';
import {
  importRowIssueSchema,
  importPropertyPlanSchema,
  importContactPlanSchema,
  resolvedImportRowSchema,
  importSummarySchema,
  appointmentImportPreviewResponseSchema,
} from './appointment-import';

const VALID_PROPERTY_PLAN = {
  resolution: 'new' as const,
  propertyId: null,
  propertyCode: null,
  street: '3/18 Ocean St',
  addressLine2: null,
  suburb: 'Kogarah',
  state: 'NSW',
  postcode: '2217',
  country: 'AU',
  duplicateOfRow: null,
};

const VALID_CONTACT_PLAN = {
  resolution: 'new' as const,
  contactId: null,
  displayName: 'Jeanette Rojas',
  primaryEmail: 'jeanette.rojas31@gmail.com',
  primaryPhone: '0412345678',
  additionalChannels: [],
  channelsDropped: false,
};

const VALID_ROW = {
  rowNumber: 2,
  severity: 'ready' as const,
  importable: true,
  serviceTypeName: 'Routine Inspection',
  serviceTypeId: '11111111-1111-1111-1111-111111111111',
  scheduledDate: '2027-06-15',
  scheduledDateDefaulted: false,
  timeSlotStart: '08:00',
  timeSlotEnd: '17:00',
  timeDefaulted: true,
  notes: null,
  property: VALID_PROPERTY_PLAN,
  contact: VALID_CONTACT_PLAN,
  customFields: [{ label: 'Complete Property Address', value: '3/18 Ocean St, Kogarah' }],
  customFieldsTruncated: false,
  issues: [],
};

describe('importRowIssueSchema', () => {
  it('accepts a valid issue', () => {
    const result = importRowIssueSchema.safeParse({
      field: 'scheduledDate',
      code: 'DEFAULT_APPLIED_DATE',
      severity: 'warning',
      message: 'Date empty; defaulted to today (2027-06-15)',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid severity', () => {
    const result = importRowIssueSchema.safeParse({
      field: 'scheduledDate',
      code: 'DEFAULT_APPLIED_DATE',
      severity: 'info',
      message: 'x',
    });
    expect(result.success).toBe(false);
  });
});

describe('importPropertyPlanSchema', () => {
  it('accepts a new-property plan', () => {
    expect(importPropertyPlanSchema.safeParse(VALID_PROPERTY_PLAN).success).toBe(true);
  });

  it('accepts an existing-property plan with an id and code', () => {
    const result = importPropertyPlanSchema.safeParse({
      ...VALID_PROPERTY_PLAN,
      resolution: 'existing',
      propertyId: '22222222-2222-2222-2222-222222222222',
      propertyCode: 'PROP-001',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown resolution', () => {
    const result = importPropertyPlanSchema.safeParse({ ...VALID_PROPERTY_PLAN, resolution: 'reused' });
    expect(result.success).toBe(false);
  });
});

describe('importContactPlanSchema', () => {
  it('accepts a new-contact plan with additional channels', () => {
    const result = importContactPlanSchema.safeParse({
      ...VALID_CONTACT_PLAN,
      additionalChannels: [{ channel: 'EMAIL', value: 'secondary@example.com', label: 'Secondary' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an existing-contact plan with channelsDropped=true', () => {
    const result = importContactPlanSchema.safeParse({
      ...VALID_CONTACT_PLAN,
      resolution: 'existing',
      contactId: '33333333-3333-3333-3333-333333333333',
      channelsDropped: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown resolution', () => {
    const result = importContactPlanSchema.safeParse({ ...VALID_CONTACT_PLAN, resolution: 'linked' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-boolean channelsDropped', () => {
    const result = importContactPlanSchema.safeParse({ ...VALID_CONTACT_PLAN, channelsDropped: 'yes' });
    expect(result.success).toBe(false);
  });
});

describe('resolvedImportRowSchema', () => {
  it('accepts a fully valid ready row', () => {
    const result = resolvedImportRowSchema.safeParse(VALID_ROW);
    expect(result.success).toBe(true);
  });

  it('accepts a row with null property/contact plans (unresolved) and error issues', () => {
    const result = resolvedImportRowSchema.safeParse({
      ...VALID_ROW,
      severity: 'error',
      importable: false,
      property: null,
      contact: null,
      issues: [
        { field: 'property', code: 'PROPERTY_STREET_REQUIRED', severity: 'error', message: 'Street is required' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('caps customFields at 4 entries', () => {
    const result = resolvedImportRowSchema.safeParse({
      ...VALID_ROW,
      customFields: Array.from({ length: 5 }, (_, i) => ({ label: `F${i}`, value: `V${i}` })),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a negative rowNumber', () => {
    const result = resolvedImportRowSchema.safeParse({ ...VALID_ROW, rowNumber: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed timeSlotStart', () => {
    const result = resolvedImportRowSchema.safeParse({ ...VALID_ROW, timeSlotStart: '8am' });
    expect(result.success).toBe(false);
  });
});

describe('importSummarySchema', () => {
  it('accepts a valid summary', () => {
    const result = importSummarySchema.safeParse({
      totalRows: 10,
      importable: 8,
      withWarnings: 3,
      withErrors: 2,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a negative totalRows', () => {
    const result = importSummarySchema.safeParse({
      totalRows: -1, importable: 0, withWarnings: 0, withErrors: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer count', () => {
    const result = importSummarySchema.safeParse({
      totalRows: 10, importable: 8.5, withWarnings: 3, withErrors: 2,
    });
    expect(result.success).toBe(false);
  });
});

describe('appointmentImportPreviewResponseSchema', () => {
  it('accepts a full preview response', () => {
    const result = appointmentImportPreviewResponseSchema.safeParse({
      importId: '44444444-4444-4444-4444-444444444444',
      branchId: '55555555-5555-5555-5555-555555555555',
      tenantId: '66666666-6666-6666-6666-666666666666',
      summary: { totalRows: 1, importable: 1, withWarnings: 1, withErrors: 0 },
      rows: [VALID_ROW],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed importId', () => {
    const result = appointmentImportPreviewResponseSchema.safeParse({
      importId: 'not-a-uuid',
      branchId: '55555555-5555-5555-5555-555555555555',
      tenantId: '66666666-6666-6666-6666-666666666666',
      summary: { totalRows: 1, importable: 1, withWarnings: 1, withErrors: 0 },
      rows: [VALID_ROW],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed branchId', () => {
    const result = appointmentImportPreviewResponseSchema.safeParse({
      importId: '44444444-4444-4444-4444-444444444444',
      branchId: 'not-a-uuid',
      tenantId: '66666666-6666-6666-6666-666666666666',
      summary: { totalRows: 1, importable: 1, withWarnings: 1, withErrors: 0 },
      rows: [VALID_ROW],
    });
    expect(result.success).toBe(false);
  });
});
