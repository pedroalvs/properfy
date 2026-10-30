import { describe, expect, it } from 'vitest';
import { buildAppVersion } from '../../lib/app-version';

describe('buildAppVersion', () => {
  it('appends the short (7-char) build SHA', () => {
    expect(buildAppVersion('0.1.0', 'ab12cd3ef')).toBe('0.1.0+ab12cd3');
  });

  it('falls back to +dev when no SHA is provided', () => {
    expect(buildAppVersion('0.1.0', undefined)).toBe('0.1.0+dev');
  });

  it('stays within the 40-char cap the API enforces', () => {
    expect(buildAppVersion('0.1.0', 'ab12cd3ef').length).toBeLessThanOrEqual(40);
  });
});
