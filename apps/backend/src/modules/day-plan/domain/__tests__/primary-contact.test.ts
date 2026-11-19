import { describe, it, expect } from 'vitest';
import { selectPrimaryContact, type SelectableContact } from '../primary-contact';

const c = (over: Partial<SelectableContact> & { name: string }): SelectableContact => ({
  phone: null,
  isPrimary: false,
  role: 'RENTAL_TENANT',
  createdAt: new Date('2026-11-01T00:00:00.000Z'),
  ...over,
});

describe('selectPrimaryContact', () => {
  it('prefers the is_primary contact over a higher-ranked role', () => {
    const result = selectPrimaryContact([
      c({ name: 'PM', role: 'PROPERTY_MANAGER', isPrimary: true, phone: '+61412345678' }),
      c({ name: 'Tenant', role: 'RENTAL_TENANT', isPrimary: false }),
    ]);
    expect(result).toMatchObject({ name: 'PM', role: 'PROPERTY_MANAGER' });
  });

  it('falls back to role order when none is primary', () => {
    const result = selectPrimaryContact([
      c({ name: 'Broker', role: 'BROKER', createdAt: new Date('2026-11-01T08:00:00Z') }),
      c({ name: 'Keeper', role: 'HOUSEKEEPER', createdAt: new Date('2026-11-01T09:00:00Z') }),
      c({ name: 'Tenant', role: 'RENTAL_TENANT', createdAt: new Date('2026-11-01T10:00:00Z') }),
    ]);
    expect(result?.name).toBe('Tenant');
  });

  it('breaks a role tie by created_at asc', () => {
    const result = selectPrimaryContact([
      c({ name: 'Newer', role: 'RENTAL_TENANT', createdAt: new Date('2026-11-02T00:00:00Z') }),
      c({ name: 'Older', role: 'RENTAL_TENANT', createdAt: new Date('2026-11-01T00:00:00Z') }),
    ]);
    expect(result?.name).toBe('Older');
  });

  it('returns the only property manager', () => {
    const result = selectPrimaryContact([c({ name: 'PM', role: 'PROPERTY_MANAGER' })]);
    expect(result).toMatchObject({ name: 'PM', role: 'PROPERTY_MANAGER' });
  });

  it('returns null without contacts', () => {
    expect(selectPrimaryContact([])).toBeNull();
  });

  it('drops a non-E.164 phone but keeps the name', () => {
    const result = selectPrimaryContact([c({ name: 'Jane', phone: '0412 345' })]);
    expect(result).toEqual({ name: 'Jane', phone: null, role: 'RENTAL_TENANT' });
  });

  it('keeps a valid E.164 phone', () => {
    const result = selectPrimaryContact([c({ name: 'Jane', phone: '+61412345678' })]);
    expect(result?.phone).toBe('+61412345678');
  });
});
