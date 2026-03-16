import { describe, it, expect } from 'vitest';
import {
  createTenantSchema,
  updateTenantSchema,
  deactivateSchema,
  createBranchSchema,
  updateBranchSchema,
  listTenantsQuerySchema,
  listBranchesQuerySchema,
  tenantSettingsSchema,
} from './tenant';

describe('createTenantSchema', () => {
  const validInput = {
    name: 'Acme Realty',
    legalName: 'Acme Realty Pty Ltd',
  };

  it('should accept valid input with defaults', () => {
    const result = createTenantSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBe('Australia/Sydney');
      expect(result.data.currency).toBe('AUD');
    }
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
  it('should accept valid input', () => {
    const result = createBranchSchema.safeParse({ name: 'Downtown Branch' });
    expect(result.success).toBe(true);
  });

  it('should accept input with address', () => {
    const result = createBranchSchema.safeParse({
      name: 'Downtown Branch',
      address: { street: '123 Main St', city: 'Sydney' },
    });
    expect(result.success).toBe(true);
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
  it('should accept partial input', () => {
    const result = updateBranchSchema.safeParse({ name: 'Updated Branch' });
    expect(result.success).toBe(true);
  });

  it('should accept empty object', () => {
    const result = updateBranchSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept address only', () => {
    const result = updateBranchSchema.safeParse({
      address: { street: '456 Oak Ave' },
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

  it('should reject extra fields (strict mode)', () => {
    const result = tenantSettingsSchema.safeParse({
      billingPeriod: 'MONTHLY',
      unknownField: 'value',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid email', () => {
    const result = tenantSettingsSchema.safeParse({
      notificationEmail: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });
});
