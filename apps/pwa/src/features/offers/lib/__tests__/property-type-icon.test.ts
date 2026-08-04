import { describe, it, expect } from 'vitest';
import {
  PROPERTY_TYPE_ICONS,
  distinctPropertyTypes,
  formatOfferAddress,
  pickOfferAddresses,
} from '../property-type-icon';

describe('PROPERTY_TYPE_ICONS', () => {
  it('maps every PropertyType to an mdi class', () => {
    expect(PROPERTY_TYPE_ICONS.APARTMENT).toBe('mdi-office-building-outline');
    expect(PROPERTY_TYPE_ICONS.HOUSE).toBe('mdi-home-outline');
  });
});

describe('distinctPropertyTypes', () => {
  it('dedupes types so a same-type group shows a single icon', () => {
    expect(
      distinctPropertyTypes([
        { street: 'a', suburb: 'Bondi NSW', propertyType: 'HOUSE' },
        { street: 'b', suburb: 'Bondi NSW', propertyType: 'HOUSE' },
      ]),
    ).toEqual(['HOUSE']);
  });

  it('keeps both types for a mixed group, in first-seen order', () => {
    expect(
      distinctPropertyTypes([
        { street: 'a', suburb: 'Bondi NSW', propertyType: 'HOUSE' },
        { street: 'b', suburb: 'Coogee NSW', propertyType: 'APARTMENT' },
        { street: 'c', suburb: 'Manly NSW', propertyType: 'HOUSE' },
      ]),
    ).toEqual(['HOUSE', 'APARTMENT']);
  });

  it('drops null types (missing or soft-deleted property)', () => {
    expect(
      distinctPropertyTypes([
        { street: '', suburb: '', propertyType: null },
        { street: 'b', suburb: 'Coogee NSW', propertyType: 'APARTMENT' },
      ]),
    ).toEqual(['APARTMENT']);
  });

  it('returns an empty array for an empty group', () => {
    expect(distinctPropertyTypes([])).toEqual([]);
  });
});

describe('formatOfferAddress', () => {
  it('joins street and suburb', () => {
    expect(
      formatOfferAddress({ street: '12 Ocean St', suburb: 'Bondi NSW', propertyType: 'HOUSE' }),
    ).toBe('12 Ocean St, Bondi NSW');
  });

  it('falls back to the suburb alone when the street is blank', () => {
    expect(
      formatOfferAddress({ street: '', suburb: 'Bondi NSW', propertyType: null }),
    ).toBe('Bondi NSW');
  });

  it('returns an empty string when both parts are blank', () => {
    expect(formatOfferAddress({ street: '', suburb: '', propertyType: null })).toBe('');
  });
});

describe('pickOfferAddresses', () => {
  const properties = [
    { street: '12 Ocean St', suburb: 'Bondi NSW', propertyType: 'HOUSE' as const },
    { street: '3 Beach Rd', suburb: 'Coogee NSW', propertyType: 'APARTMENT' as const },
    { street: '7 Hill St', suburb: 'Manly NSW', propertyType: 'HOUSE' as const },
  ];

  it('returns the first full address and the count of the rest', () => {
    expect(pickOfferAddresses(properties, [])).toEqual({
      primary: '12 Ocean St, Bondi NSW',
      remaining: 2,
    });
  });

  it('reports no remainder for a single-property group', () => {
    expect(pickOfferAddresses([properties[0]!], [])).toEqual({
      primary: '12 Ocean St, Bondi NSW',
      remaining: 0,
    });
  });

  it('skips blanked entries when choosing the primary but still counts them', () => {
    expect(
      pickOfferAddresses(
        [{ street: '', suburb: '', propertyType: null }, properties[1]!],
        [],
      ),
    ).toEqual({ primary: '3 Beach Rd, Coogee NSW', remaining: 1 });
  });

  // Older offers served before the payload carried `properties` still render.
  it('falls back to the suburbs list when no property has an address', () => {
    expect(
      pickOfferAddresses([{ street: '', suburb: '', propertyType: null }], ['Bondi NSW', 'Coogee NSW']),
    ).toEqual({ primary: 'Bondi NSW · Coogee NSW', remaining: 0 });
  });

  it('falls back to the suburbs list when properties is empty', () => {
    expect(pickOfferAddresses([], ['Bondi NSW'])).toEqual({
      primary: 'Bondi NSW',
      remaining: 0,
    });
  });

  it('returns an empty primary when there is nothing at all to show', () => {
    expect(pickOfferAddresses([], [])).toEqual({ primary: '', remaining: 0 });
  });
});
