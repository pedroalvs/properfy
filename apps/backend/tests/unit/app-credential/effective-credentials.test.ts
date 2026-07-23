import { describe, it, expect } from 'vitest';
import { AppCredentialEntity } from '../../../src/modules/app-credential/domain/app-credential.entity';
import { mergeEffectiveCredentials } from '../../../src/modules/app-credential/domain/effective-credentials';

function credential(id: string, name: string): AppCredentialEntity {
  return new AppCredentialEntity({
    id,
    tenantId: '11111111-1111-1111-1111-111111111111',
    name,
    username: 'user',
    password: 'secret',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  });
}

describe('mergeEffectiveCredentials', () => {
  it('returns linked credentials first, in their original order', () => {
    const linked = [credential('a', 'Zeta'), credential('b', 'Alpha')];
    const defaults = [credential('c', 'Midway')];
    expect(mergeEffectiveCredentials(linked, defaults).map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('dedupes a default that is also explicitly linked, keeping the linked instance', () => {
    const linkedInstance = credential('a', 'Airbnb');
    const defaultInstance = credential('a', 'Airbnb');
    const result = mergeEffectiveCredentials([linkedInstance], [defaultInstance]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(linkedInstance);
  });

  it('handles empty inputs', () => {
    expect(mergeEffectiveCredentials([], [])).toEqual([]);
    expect(mergeEffectiveCredentials([], [credential('a', 'Solo')]).map((c) => c.id)).toEqual(['a']);
    expect(mergeEffectiveCredentials([credential('a', 'Solo')], []).map((c) => c.id)).toEqual(['a']);
  });

  it('preserves the order defaults were given in (repo sorts by name)', () => {
    const defaults = [credential('a', 'Alpha'), credential('b', 'Beta')];
    expect(mergeEffectiveCredentials([], defaults).map((c) => c.id)).toEqual(['a', 'b']);
  });
});
