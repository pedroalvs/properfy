import { describe, it, expect } from 'vitest';
import {
  contactRegistrySchema,
  contactRegistryUpdateSchema,
  appointmentContactsArraySchema,
  contactSchema,
} from './contact';

describe('contactRegistrySchema', () => {
  it('should be valid with email only', () => {
    const result = contactRegistrySchema.safeParse({
      type: 'TENANT',
      displayName: 'Jane Doe',
      primaryEmail: 'jane@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('should be valid with phone only', () => {
    const result = contactRegistrySchema.safeParse({
      type: 'PROPERTY_MANAGER',
      displayName: 'John Smith',
      primaryPhone: '+61400000000',
    });
    expect(result.success).toBe(true);
  });

  it('should be valid with all fields', () => {
    const result = contactRegistrySchema.safeParse({
      type: 'BROKER',
      displayName: 'Jane Doe',
      company: 'Smith Realty',
      primaryEmail: 'jane@example.com',
      primaryPhone: '+61400000000',
      additionalChannels: [
        { channel: 'EMAIL', value: 'jane.work@example.com', label: 'Work' },
        { channel: 'PHONE', value: '+61411111111' },
      ],
      notes: 'Preferred contact for inspections',
    });
    expect(result.success).toBe(true);
  });

  it('should fail when both email and phone are missing', () => {
    const result = contactRegistrySchema.safeParse({
      type: 'TENANT',
      displayName: 'Jane Doe',
    });
    expect(result.success).toBe(false);
  });

  it('should fail when both email and phone are null', () => {
    const result = contactRegistrySchema.safeParse({
      type: 'TENANT',
      displayName: 'Jane Doe',
      primaryEmail: null,
      primaryPhone: null,
    });
    expect(result.success).toBe(false);
  });

  it('should fail with invalid email', () => {
    const result = contactRegistrySchema.safeParse({
      type: 'TENANT',
      displayName: 'Jane Doe',
      primaryEmail: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('should fail when additionalChannels duplicates primaryEmail', () => {
    const result = contactRegistrySchema.safeParse({
      type: 'TENANT',
      displayName: 'Jane Doe',
      primaryEmail: 'jane@example.com',
      additionalChannels: [
        { channel: 'EMAIL', value: 'jane@example.com' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('should fail when additionalChannels duplicates primaryPhone', () => {
    const result = contactRegistrySchema.safeParse({
      type: 'TENANT',
      displayName: 'Jane Doe',
      primaryPhone: '+61400000000',
      additionalChannels: [
        { channel: 'PHONE', value: '+61400000000' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('should fail when additionalChannels has intra-array duplicates', () => {
    const result = contactRegistrySchema.safeParse({
      type: 'TENANT',
      displayName: 'Jane Doe',
      primaryEmail: 'jane@example.com',
      additionalChannels: [
        { channel: 'EMAIL', value: 'dup@example.com' },
        { channel: 'EMAIL', value: 'dup@example.com' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('should fail when additionalChannels exceeds max(10)', () => {
    const channels = Array.from({ length: 11 }, (_, i) => ({
      channel: 'EMAIL' as const,
      value: `email${i}@example.com`,
    }));
    const result = contactRegistrySchema.safeParse({
      type: 'TENANT',
      displayName: 'Jane Doe',
      primaryEmail: 'jane@example.com',
      additionalChannels: channels,
    });
    expect(result.success).toBe(false);
  });

  it('should fail with invalid type', () => {
    const result = contactRegistrySchema.safeParse({
      type: 'INVALID',
      displayName: 'Jane Doe',
      primaryEmail: 'jane@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('should fail with empty displayName', () => {
    const result = contactRegistrySchema.safeParse({
      type: 'TENANT',
      displayName: '',
      primaryEmail: 'jane@example.com',
    });
    expect(result.success).toBe(false);
  });
});

describe('contactRegistryUpdateSchema', () => {
  it('should accept partial update', () => {
    const result = contactRegistryUpdateSchema.safeParse({
      displayName: 'Updated Name',
    });
    expect(result.success).toBe(true);
  });

  it('should accept isActive field', () => {
    const result = contactRegistryUpdateSchema.safeParse({
      isActive: false,
    });
    expect(result.success).toBe(true);
  });

  it('should accept null to clear optional fields', () => {
    const result = contactRegistryUpdateSchema.safeParse({
      company: null,
      primaryEmail: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('appointmentContactsArraySchema', () => {
  it('should be valid with single primary contact by contactId', () => {
    const result = appointmentContactsArraySchema.safeParse([
      { contactId: '550e8400-e29b-41d4-a716-446655440000', role: 'TENANT', isPrimary: true },
    ]);
    expect(result.success).toBe(true);
  });

  it('should be valid with inline contact', () => {
    const result = appointmentContactsArraySchema.safeParse([
      {
        inline: {
          type: 'HOUSEKEEPER',
          displayName: 'Maria',
          primaryPhone: '+61498765432',
        },
        role: 'HOUSEKEEPER',
        isPrimary: true,
      },
    ]);
    expect(result.success).toBe(true);
  });

  it('should be valid with mixed contactId and inline', () => {
    const result = appointmentContactsArraySchema.safeParse([
      { contactId: '550e8400-e29b-41d4-a716-446655440000', role: 'TENANT', isPrimary: true },
      {
        inline: {
          type: 'HOUSEKEEPER',
          displayName: 'Maria',
          primaryPhone: '+61498765432',
        },
        role: 'HOUSEKEEPER',
        isPrimary: false,
      },
    ]);
    expect(result.success).toBe(true);
  });

  it('should fail with empty array', () => {
    const result = appointmentContactsArraySchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it('should fail with zero primaries', () => {
    const result = appointmentContactsArraySchema.safeParse([
      { contactId: '550e8400-e29b-41d4-a716-446655440000', role: 'TENANT', isPrimary: false },
    ]);
    expect(result.success).toBe(false);
  });

  it('should fail with two primaries', () => {
    const result = appointmentContactsArraySchema.safeParse([
      { contactId: '550e8400-e29b-41d4-a716-446655440000', role: 'TENANT', isPrimary: true },
      { contactId: '550e8400-e29b-41d4-a716-446655440001', role: 'PROPERTY_MANAGER', isPrimary: true },
    ]);
    expect(result.success).toBe(false);
  });
});

describe('contactSchema (legacy)', () => {
  it('should still work for backward compat', () => {
    const result = contactSchema.safeParse({ tenantName: 'Jane Doe' });
    expect(result.success).toBe(true);
  });

  it('should be invalid when tenantName is missing', () => {
    const result = contactSchema.safeParse({
      primaryEmail: 'jane@example.com',
    });
    expect(result.success).toBe(false);
  });
});
