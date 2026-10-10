import { describe, it, expect } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins truthy class values', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values and respects conditionals', () => {
    expect(cn('a', false && 'b', undefined, null, 'c')).toBe('a c');
  });

  it('de-duplicates conflicting Tailwind utilities (last wins)', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('merges arrays and objects like clsx', () => {
    expect(cn(['a', 'b'], { c: true, d: false })).toBe('a b c');
  });
});
