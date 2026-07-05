import { describe, it, expect } from 'vitest';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';

function buildProperty(overrides: Partial<ConstructorParameters<typeof PropertyEntity>[0]> = {}) {
  const now = new Date('2027-01-01T00:00:00Z');
  return new PropertyEntity({
    id: 'prop-1',
    tenantId: 'tenant-1',
    branchId: null,
    propertyCode: 'PROP-001',
    type: 'HOUSE',
    street: '3/18 Ocean St',
    addressLine2: null,
    suburb: 'Kogarah',
    postcode: '2217',
    state: 'NSW',
    country: 'AU',
    lat: null,
    lng: null,
    geocodingStatus: 'PENDING',
    notes: null,
    rulesJson: {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  });
}

describe('PropertyEntity.normalizedAddressKey', () => {
  it('matches buildNormalizedAddressKey applied to the entity fields', () => {
    const property = buildProperty();
    expect(property.normalizedAddressKey).toBe('3/18 ocean st||kogarah|nsw|2217');
  });

  it('changes when addressLine2 differs', () => {
    const a = buildProperty({ addressLine2: 'Unit 3' });
    const b = buildProperty({ addressLine2: 'Unit 4' });
    expect(a.normalizedAddressKey).not.toBe(b.normalizedAddressKey);
  });

  it('is stable regardless of casing/whitespace variance in the source fields', () => {
    const a = buildProperty({ street: 'OCEAN   ST', suburb: '  Kogarah' });
    const b = buildProperty({ street: 'ocean st', suburb: 'Kogarah' });
    expect(a.normalizedAddressKey).toBe(b.normalizedAddressKey);
  });
});
