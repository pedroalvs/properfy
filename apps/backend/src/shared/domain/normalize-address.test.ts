import { describe, it, expect } from 'vitest';
import { buildNormalizedAddressKey } from './normalize-address';

describe('buildNormalizedAddressKey', () => {
  it('joins components with a pipe, trimmed and lowercased', () => {
    const key = buildNormalizedAddressKey({
      street: '3/18 Ocean St',
      addressLine2: null,
      suburb: 'Kogarah',
      state: 'NSW',
      postcode: '2217',
    });
    expect(key).toBe('3/18 ocean st||kogarah|nsw|2217');
  });

  it('is case-insensitive', () => {
    const a = buildNormalizedAddressKey({
      street: 'OCEAN ST', addressLine2: null, suburb: 'KOGARAH', state: 'nsw', postcode: '2217',
    });
    const b = buildNormalizedAddressKey({
      street: 'ocean st', addressLine2: null, suburb: 'kogarah', state: 'NSW', postcode: '2217',
    });
    expect(a).toBe(b);
  });

  it('trims leading/trailing whitespace on every field', () => {
    const a = buildNormalizedAddressKey({
      street: '  3/18 Ocean St  ', addressLine2: '  ', suburb: ' Kogarah ', state: ' NSW ', postcode: ' 2217 ',
    });
    const b = buildNormalizedAddressKey({
      street: '3/18 Ocean St', addressLine2: null, suburb: 'Kogarah', state: 'NSW', postcode: '2217',
    });
    expect(a).toBe(b);
  });

  it('collapses internal whitespace runs to a single space', () => {
    const a = buildNormalizedAddressKey({
      street: '3/18   Ocean    St', addressLine2: null, suburb: 'Kogarah', state: 'NSW', postcode: '2217',
    });
    const b = buildNormalizedAddressKey({
      street: '3/18 Ocean St', addressLine2: null, suburb: 'Kogarah', state: 'NSW', postcode: '2217',
    });
    expect(a).toBe(b);
  });

  it('treats a null addressLine2 the same as an empty/whitespace-only one', () => {
    const withNull = buildNormalizedAddressKey({
      street: '5/24 Belgrave St', addressLine2: null, suburb: 'Kogarah', state: 'NSW', postcode: '2217',
    });
    const withUndefined = buildNormalizedAddressKey({
      street: '5/24 Belgrave St', addressLine2: undefined, suburb: 'Kogarah', state: 'NSW', postcode: '2217',
    });
    const withBlank = buildNormalizedAddressKey({
      street: '5/24 Belgrave St', addressLine2: '   ', suburb: 'Kogarah', state: 'NSW', postcode: '2217',
    });
    expect(withNull).toBe(withUndefined);
    expect(withNull).toBe(withBlank);
  });

  it('distinguishes different address_line_2 values (e.g. different units)', () => {
    const unit3 = buildNormalizedAddressKey({
      street: '18 Ocean St', addressLine2: 'Unit 3', suburb: 'Kogarah', state: 'NSW', postcode: '2217',
    });
    const unit4 = buildNormalizedAddressKey({
      street: '18 Ocean St', addressLine2: 'Unit 4', suburb: 'Kogarah', state: 'NSW', postcode: '2217',
    });
    expect(unit3).not.toBe(unit4);
  });

  it('distinguishes different postcodes/states/suburbs even with the same street', () => {
    const a = buildNormalizedAddressKey({
      street: '1 Main St', addressLine2: null, suburb: 'Kogarah', state: 'NSW', postcode: '2217',
    });
    const b = buildNormalizedAddressKey({
      street: '1 Main St', addressLine2: null, suburb: 'Carlton', state: 'NSW', postcode: '2218',
    });
    expect(a).not.toBe(b);
  });
});
