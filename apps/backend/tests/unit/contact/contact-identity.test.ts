import { describe, it, expect } from 'vitest';
import { isIdenticalContact, resolveInlineContactMatch } from '../../../src/modules/contact/domain/contact-identity';
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

describe('resolveInlineContactMatch', () => {
  const inline = { name: 'Jane Tenant', email: 'jane@example.com', phone: '0400 111 222' };

  it('links the identical candidate with its registry data as the snapshot', () => {
    expect(resolveInlineContactMatch([makeContact()], inline)).toEqual({
      contactId: '11111111-1111-1111-1111-111111111111',
      snapshotName: 'Jane Tenant',
      snapshotEmail: 'jane@example.com',
      snapshotPhone: '0400 111 222',
    });
  });

  it('scans past a partially colliding candidate to find the identical one', () => {
    const collision = makeContact({ id: 'other', displayName: 'Someone Else', primaryEmail: 'other@example.com' });
    expect(resolveInlineContactMatch([collision, makeContact()], inline)!.contactId)
      .toBe('11111111-1111-1111-1111-111111111111');
  });

  it('returns an unlinked snapshot of the inline data on a partial collision', () => {
    const collision = makeContact({ displayName: 'Someone Else' });
    expect(resolveInlineContactMatch([collision], inline)).toEqual({
      contactId: null,
      snapshotName: 'Jane Tenant',
      snapshotEmail: 'jane@example.com',
      snapshotPhone: '0400 111 222',
    });
  });

  it('returns null when there are no candidates (caller creates a new contact)', () => {
    expect(resolveInlineContactMatch([], inline)).toBeNull();
  });
});
