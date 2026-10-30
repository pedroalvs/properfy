import { describe, it, expect } from 'vitest';
import { applyInspectorFieldVisibility } from '../../../src/modules/inspector/application/inspector-field-visibility';

const FULL = {
  id: 'i1',
  name: 'John',
  status: 'ACTIVE',
  // base fields
  address: { street: '1 George St' },
  baseLat: -33.86,
  baseLng: 151.2,
  baseGeocodedAt: new Date('2026-10-30T00:00:00Z'),
  // adoption fields
  appInstalledAt: new Date('2026-10-30T00:00:00Z'),
  appLastSeenAt: new Date('2026-10-30T00:00:00Z'),
  pushEnabled: true,
  appVersion: '0.1.0',
};

const BASE_KEYS = ['address', 'baseLat', 'baseLng', 'baseGeocodedAt'];
const ADOPTION_KEYS = ['appInstalledAt', 'appLastSeenAt', 'pushEnabled', 'appVersion'];

describe('applyInspectorFieldVisibility', () => {
  it.each(['AM', 'OP'])('keeps every field for %s', (role) => {
    const out = applyInspectorFieldVisibility({ ...FULL }, role);
    for (const k of [...BASE_KEYS, ...ADOPTION_KEYS]) {
      expect(out).toHaveProperty(k);
    }
  });

  it('keeps base fields but strips adoption for INSP', () => {
    const out = applyInspectorFieldVisibility({ ...FULL }, 'INSP');
    for (const k of BASE_KEYS) expect(out).toHaveProperty(k);
    for (const k of ADOPTION_KEYS) expect(out).not.toHaveProperty(k);
  });

  it.each(['CL_ADMIN', 'CL_USER'])('strips base and adoption for %s', (role) => {
    const out = applyInspectorFieldVisibility({ ...FULL }, role);
    for (const k of [...BASE_KEYS, ...ADOPTION_KEYS]) {
      expect(out).not.toHaveProperty(k);
    }
  });

  it('leaves the non-restricted fields identical', () => {
    const out = applyInspectorFieldVisibility({ ...FULL }, 'CL_ADMIN');
    expect(out.id).toBe('i1');
    expect(out.name).toBe('John');
    expect(out.status).toBe('ACTIVE');
  });

  it('does not mutate the input object', () => {
    const input = { ...FULL };
    applyInspectorFieldVisibility(input, 'CL_ADMIN');
    expect(input).toHaveProperty('address');
    expect(input).toHaveProperty('appVersion');
  });
});
