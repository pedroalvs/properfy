import { describe, it, expect } from 'vitest';
import { formatTimeWindow } from '../time-slot';

describe('formatTimeWindow', () => {
  it('joins bare HH:mm start and end with an en-dash', () => {
    expect(formatTimeWindow('09:00', '11:00')).toBe('09:00 – 11:00');
  });
});
