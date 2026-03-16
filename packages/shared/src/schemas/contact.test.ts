import { describe, it, expect } from 'vitest';
import { contactSchema } from './contact';

describe('contactSchema', () => {
  it('should be valid with tenantName only (minimal)', () => {
    const result = contactSchema.safeParse({ tenantName: 'Jane Doe' });
    expect(result.success).toBe(true);
  });

  it('should be valid with all fields', () => {
    const result = contactSchema.safeParse({
      tenantName: 'Jane Doe',
      primaryEmail: 'jane@example.com',
      secondaryEmail: 'jane.backup@example.com',
      primaryPhone: '+61400000000',
      secondaryPhone: '+61411111111',
    });
    expect(result.success).toBe(true);
  });

  it('should be invalid when tenantName is missing', () => {
    const result = contactSchema.safeParse({
      primaryEmail: 'jane@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('should be invalid when tenantName is empty string', () => {
    const result = contactSchema.safeParse({ tenantName: '' });
    expect(result.success).toBe(false);
  });

  it('should be invalid with a malformed email', () => {
    const result = contactSchema.safeParse({
      tenantName: 'Jane Doe',
      primaryEmail: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('should not include preferredChannel field', () => {
    const result = contactSchema.safeParse({
      tenantName: 'Jane Doe',
      preferredChannel: 'EMAIL',
    });
    // Should still succeed — extra keys are stripped by default in Zod
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).preferredChannel).toBeUndefined();
    }
  });
});
