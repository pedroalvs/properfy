import { describe, it, expect } from 'vitest';
import { isIdenticalContact } from '../../../src/modules/contact/domain/contact-identity';
import { ContactEntity } from '../../../src/modules/contact/domain/contact.entity';

function makeContact(overrides: Partial<ConstructorParameters<typeof ContactEntity>[0]> = {}): ContactEntity {
  return new ContactEntity({
    id: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    type: 'RENTAL_TENANT' as any,
    displayName: 'Jane Tenant',
    company: null,
    primaryEmail: 'jane@example.com',
    primaryPhone: '0400 111 222',
    additionalChannels: [],
    notes: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

describe('isIdenticalContact', () => {
  it('matches when name, email and phone are all equal', () => {
    expect(isIdenticalContact(makeContact(), {
      name: 'Jane Tenant',
      email: 'jane@example.com',
      phone: '0400 111 222',
    })).toBe(true);
  });

  it('matches name case-insensitively and ignoring surrounding whitespace', () => {
    expect(isIdenticalContact(makeContact(), {
      name: '  jane tenant ',
      email: 'jane@example.com',
      phone: '0400 111 222',
    })).toBe(true);
  });

  it('does not match when the name differs', () => {
    expect(isIdenticalContact(makeContact(), {
      name: 'John Tenant',
      email: 'jane@example.com',
      phone: '0400 111 222',
    })).toBe(false);
  });

  it('does not match when the email differs', () => {
    expect(isIdenticalContact(makeContact(), {
      name: 'Jane Tenant',
      email: 'other@example.com',
      phone: '0400 111 222',
    })).toBe(false);
  });

  it('does not match when the phone differs', () => {
    expect(isIdenticalContact(makeContact(), {
      name: 'Jane Tenant',
      email: 'jane@example.com',
      phone: '0400 999 888',
    })).toBe(false);
  });

  it('requires null channels to match null (email present on contact, absent on row)', () => {
    expect(isIdenticalContact(makeContact(), {
      name: 'Jane Tenant',
      email: null,
      phone: '0400 111 222',
    })).toBe(false);
  });

  it('matches when both sides have a null channel', () => {
    expect(isIdenticalContact(makeContact({ primaryEmail: null }), {
      name: 'Jane Tenant',
      email: null,
      phone: '0400 111 222',
    })).toBe(true);
  });
});
