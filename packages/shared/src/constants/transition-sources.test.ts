import { describe, it, expect } from 'vitest';
import { TRANSITION_SOURCE_INSPECTOR_CANT_DO } from './transition-sources';

describe('transition sources', () => {
  it('exposes the inspector cant-do source', () => {
    expect(TRANSITION_SOURCE_INSPECTOR_CANT_DO).toBe('INSPECTOR_CANT_DO');
  });
});
