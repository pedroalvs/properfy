import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAccessLocationPresets } from './useAccessLocationPresets';

const BRANCHES = [
  {
    id: 'branch-1',
    addressJson: { street: '1 Help St', suburb: 'Chatswood', state: 'NSW', postcode: '2067' },
  },
  { id: 'branch-2', addressJson: null },
];

const PROPERTIES = [
  { id: 'prop-1', street: '5/24 Belgrave St', suburb: 'Kogarah', state: 'NSW', postcode: '2217' },
];

describe('useAccessLocationPresets', () => {
  it('resolves the selected branch office address from addressJson', () => {
    const { result } = renderHook(() =>
      useAccessLocationPresets({
        branchItems: BRANCHES,
        propertyItems: PROPERTIES,
        branchId: 'branch-1',
        propertyId: '',
      }),
    );
    expect(result.current.agencyAddress).toContain('1 Help St');
    expect(result.current.agencyAddress).toContain('Chatswood');
  });

  it('resolves the selected property address from its structured fields', () => {
    const { result } = renderHook(() =>
      useAccessLocationPresets({
        branchItems: BRANCHES,
        propertyItems: PROPERTIES,
        branchId: '',
        propertyId: 'prop-1',
      }),
    );
    expect(result.current.propertyAddress).toContain('5/24 Belgrave St');
    expect(result.current.propertyAddress).toContain('Kogarah');
  });

  it('falls back to the provided property address when the property is not in the list', () => {
    const { result } = renderHook(() =>
      useAccessLocationPresets({
        branchItems: BRANCHES,
        propertyItems: PROPERTIES,
        branchId: '',
        propertyId: 'prop-missing',
        fallbackPropertyAddress: '9 Fallback Rd, Sydney NSW 2000',
      }),
    );
    expect(result.current.propertyAddress).toBe('9 Fallback Rd, Sydney NSW 2000');
  });

  it('returns null for a branch without an address and an unselected property', () => {
    const { result } = renderHook(() =>
      useAccessLocationPresets({
        branchItems: BRANCHES,
        propertyItems: PROPERTIES,
        branchId: 'branch-2',
        propertyId: '',
      }),
    );
    expect(result.current.agencyAddress).toBeNull();
    expect(result.current.propertyAddress).toBeNull();
  });

  it('tolerates undefined lists while data is loading', () => {
    const { result } = renderHook(() =>
      useAccessLocationPresets({
        branchItems: undefined,
        propertyItems: undefined,
        branchId: 'branch-1',
        propertyId: 'prop-1',
      }),
    );
    expect(result.current.agencyAddress).toBeNull();
    expect(result.current.propertyAddress).toBeNull();
  });
});
