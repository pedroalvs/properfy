import { describe, expect, it } from 'vitest';

import { isTenantEtaNoticesEnabled } from './tenant-eta-notices';

describe('isTenantEtaNoticesEnabled', () => {
  it('reads absent/null/empty as enabled (fail-open)', () => {
    expect(isTenantEtaNoticesEnabled(null)).toBe(true);
    expect(isTenantEtaNoticesEnabled(undefined)).toBe(true);
    expect(isTenantEtaNoticesEnabled({})).toBe(true);
  });

  it('reads an explicit false as disabled, true as enabled', () => {
    expect(isTenantEtaNoticesEnabled({ tenantEtaNoticesEnabled: false })).toBe(false);
    expect(isTenantEtaNoticesEnabled({ tenantEtaNoticesEnabled: true })).toBe(true);
  });
});
