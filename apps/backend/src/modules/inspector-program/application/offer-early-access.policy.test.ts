import { describe, it, expect, vi } from 'vitest';
import { OfferEarlyAccessPolicy } from './offer-early-access.policy';
import type { IPlatformSettingsReader } from '../../../shared/domain/platform-settings';

const DEFAULT_SETTINGS = {
  levels: { silverMinScore: 60, goldMinScore: 85 },
  earlyAccess: { enabled: true, hours: 12, minLevel: 'GOLD', enabledAt: '2026-11-01T00:00:00.000Z' },
};

function build(overrides?: {
  settings?: Record<string, unknown>;
  hasAccess?: boolean;
  latestSnapshotDate?: string | null;
}) {
  const settings = { ...DEFAULT_SETTINGS, ...(overrides?.settings ?? {}) };
  const get = vi.fn().mockResolvedValue(settings);
  const settingsReader = { get } as unknown as IPlatformSettingsReader;
  const hasEarlyAccess = vi
    .fn()
    .mockResolvedValue({ hasAccess: overrides?.hasAccess ?? false, reason: null });
  const latestSnapshotDate =
    overrides && 'latestSnapshotDate' in overrides ? overrides.latestSnapshotDate : '2026-11-10';
  const findLatestSnapshotDate = vi.fn().mockResolvedValue(latestSnapshotDate);
  const warn = vi.fn();
  const policy = new OfferEarlyAccessPolicy(
    { hasEarlyAccess },
    settingsReader,
    { findLatestSnapshotDate },
    { warn },
  );
  return { policy, get, hasEarlyAccess, findLatestSnapshotDate, warn };
}

const NOW = new Date('2026-11-10T10:00:00.000Z');

describe('OfferEarlyAccessPolicy.resolve', () => {
  it('returns null and reads no snapshot when disabled', async () => {
    const { policy, hasEarlyAccess, findLatestSnapshotDate } = build({
      settings: { earlyAccess: { ...DEFAULT_SETTINGS.earlyAccess, enabled: false } },
    });
    expect(await policy.resolve('insp-1', NOW)).toBeNull();
    expect(hasEarlyAccess).not.toHaveBeenCalled();
    expect(findLatestSnapshotDate).not.toHaveBeenCalled();
  });

  it('returns null and reads no snapshot when the viewer qualifies', async () => {
    const { policy, findLatestSnapshotDate } = build({ hasAccess: true });
    expect(await policy.resolve('insp-1', NOW)).toBeNull();
    expect(findLatestSnapshotDate).not.toHaveBeenCalled();
  });

  it('resolves the window params once when enabled and the viewer does not qualify', async () => {
    const { policy, get, hasEarlyAccess, findLatestSnapshotDate } = build();
    const params = await policy.resolve('insp-1', NOW);
    expect(params).toEqual({
      hours: 12,
      cutoffUtc: '2026-11-09T22:00:00.000',
      enabledAtUtc: '2026-11-01T00:00:00.000',
      protectedFrom: '2026-11-12',
      minScore: 85, // minScoreForLevel(GOLD, {60,85})
      latestSnapshotDate: '2026-11-10',
    });
    expect(get).toHaveBeenCalledTimes(1);
    expect(hasEarlyAccess).toHaveBeenCalledTimes(1);
    expect(findLatestSnapshotDate).toHaveBeenCalledTimes(1);
  });

  it('returns null when no snapshot exists yet', async () => {
    const { policy } = build({ latestSnapshotDate: null });
    expect(await policy.resolve('insp-1', NOW)).toBeNull();
  });

  it('(L-F08-08) returns null and warns when enabled but enabledAt is null', async () => {
    const { policy, warn } = build({
      settings: { earlyAccess: { ...DEFAULT_SETTINGS.earlyAccess, enabledAt: null } },
    });
    expect(await policy.resolve('insp-1', NOW)).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.any(Object),
      'marketplace.early_access_missing_enabled_at',
    );
  });
});
