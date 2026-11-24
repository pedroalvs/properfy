import { describe, expect, it } from 'vitest';

import { buildAddressLabel, formatAddressLabel } from './address';

describe('formatAddressLabel', () => {
  // Defect (D-04 / 00.A5): the inspector base address is captured with the
  // street number in a separate `number` field (no `formattedAddress`), so the
  // rendered label used to drop the number. It must now be prepended.
  it('prepends the street number to the inspector base address label', () => {
    const label = formatAddressLabel({
      street: 'Martin Place',
      number: '1',
      suburb: 'Sydney',
      city: 'Sydney',
      state: 'NSW',
      postcode: '2000',
      country: 'AU',
    });

    expect(label).toBe('1 Martin Place, Sydney NSW 2000, AU');
    expect(label).toContain('1 Martin Place');
  });

  // Regression: when `formattedAddress` is present (every address captured via
  // the Mapbox lookup, e.g. branches) it is returned verbatim and the `number`
  // field is never consulted — the number is already inside the street there.
  it('returns the formattedAddress verbatim when present', () => {
    const label = formatAddressLabel({
      formattedAddress: '1 George St, Sydney NSW 2000, AU',
      street: 'George St',
      number: '1',
      suburb: 'Sydney',
      state: 'NSW',
      postcode: '2000',
      country: 'AU',
    });

    expect(label).toBe('1 George St, Sydney NSW 2000, AU');
  });

  // Regression: a parts address with no `number` is unchanged (the branch-list
  // fixture `CENTRO_ADDRESS`, where the number is baked into the street).
  it('leaves a parts address without a number unchanged', () => {
    const label = formatAddressLabel({
      street: 'Rua Augusta, 100',
      suburb: 'Consolação',
      state: 'SP',
      postcode: '01305',
      country: 'BR',
    });

    expect(label).toBe('Rua Augusta, 100, Consolação SP 01305, BR');
  });

  // Regression: `city` still backs `suburb` when `suburb` is absent.
  it('falls back to city when suburb is absent', () => {
    const label = formatAddressLabel({
      street: 'Main St',
      city: 'Townsville',
      state: 'QLD',
      postcode: '4810',
      country: 'AU',
    });

    expect(label).toBe('Main St, Townsville QLD 4810, AU');
  });

  // An empty/whitespace number must not leave a leading space on the street.
  it('ignores a blank number', () => {
    const label = formatAddressLabel({
      street: 'Martin Place',
      number: '   ',
      suburb: 'Sydney',
      state: 'NSW',
      postcode: '2000',
      country: 'AU',
    });

    expect(label).toBe('Martin Place, Sydney NSW 2000, AU');
  });

  it('returns null for a non-object input', () => {
    expect(formatAddressLabel(null)).toBeNull();
    expect(formatAddressLabel(undefined)).toBeNull();
    expect(formatAddressLabel('123 Main St')).toBeNull();
  });
});

describe('buildAddressLabel', () => {
  // buildAddressLabel is the explicit-parts helper (properties, portal, branch
  // form); it has no `number` field and is unchanged by the fix above.
  it('joins the provided parts without a number field', () => {
    const label = buildAddressLabel({
      street: 'Martin Place',
      suburb: 'Sydney',
      state: 'NSW',
      postcode: '2000',
      country: 'AU',
    });

    expect(label).toBe('Martin Place, Sydney NSW 2000, AU');
  });
});
