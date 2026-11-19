import { describe, expect, it } from 'vitest';

import {
  TENANT_ETA_BAND_HALF_WIDTH_MINUTES,
  TENANT_ETA_DAILY_SMS_WARN_THRESHOLD,
  TENANT_ETA_EARLY_CHANGE_MINUTES,
  TENANT_ETA_ON_THE_WAY_MAX_LEAD_MINUTES,
} from './tenant-eta';

describe('tenant-eta constants', () => {
  it('match the F06 decisions', () => {
    expect(TENANT_ETA_BAND_HALF_WIDTH_MINUTES).toBe(30);
    expect(TENANT_ETA_ON_THE_WAY_MAX_LEAD_MINUTES).toBe(60);
    expect(TENANT_ETA_EARLY_CHANGE_MINUTES).toBe(30);
    expect(TENANT_ETA_DAILY_SMS_WARN_THRESHOLD).toBe(500);
  });
});
